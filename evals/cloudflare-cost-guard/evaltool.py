#!/usr/bin/env python3
"""Fixture checks and grading for the cloudflare-cost-guard evals.

  evaltool.py check                 Validate every case (runs in CI).
  evaltool.py grade CASE REPORT     Grade one agent report against a case.
  evaltool.py grade-all REPORT_DIR  Grade REPORT_DIR/<case>.md for every case.
  evaltool.py self-test             Check the grader on synthetic reports (runs in CI).
  evaltool.py strip DIR             Remove the do-not-deploy notice from a copied case.

A report is the agent's Markdown output. The grader reads the JSON block the
skill's report template ends with ("cost_guard_report": 1).

Uses only the Python standard library.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CASES = HERE / "cases"
SEVERITIES = ["None", "Low", "Medium", "High", "Critical"]
ANSWER_HINT = re.compile(r"\b(vulnerab|counterexample|expected finding|eval)", re.IGNORECASE)
LINE_WINDOW = 8

# Every fixture file starts with this notice. run.sh strips it from the copy
# the agent audits, so the notice never hints at the answer, and line numbers
# are computed on the stripped text to match what the agent sees.
NOTICE_START = "COST GUARD TEST FIXTURE: DO NOT DEPLOY"
NOTICE_END = "END OF TEST FIXTURE NOTICE"
NOTICE_LINES = [
    f"==== {NOTICE_START} ====",
    "This is a deliberate counterexample for testing the cloudflare-cost-guard",
    "skill. Cases in this folder contain code that can run up a Cloudflare bill",
    "on purpose. Never deploy it, run it, or copy it into a real project.",
    f"==== {NOTICE_END} ====",
]
COMMENT = {".ts": "//", ".fixture": "//", ".sql": "--"}


def notice_for(path: Path) -> str:
    prefix = COMMENT[path.suffix]
    return "".join(f"{prefix} {line}\n" for line in NOTICE_LINES) + "\n"


def strip_notice(path: Path, text: str) -> str:
    notice = notice_for(path)
    return text[len(notice):] if text.startswith(notice) else text


# ---------------------------------------------------------------- cases

def load_case(case_dir: Path) -> dict:
    return json.loads((case_dir / "expected.json").read_text(encoding="utf-8"))


def locate(case_dir: Path, file: str, snippet: str) -> int:
    """Return the 1-based line where snippet starts; it must occur exactly once."""
    path = case_dir / file
    text = strip_notice(path, path.read_text(encoding="utf-8"))
    count = text.count(snippet)
    if count != 1:
        raise ValueError(f"{case_dir.name}/{file}: snippet found {count} times, need exactly 1: {snippet!r}")
    return text[: text.index(snippet)].count("\n") + 1


def anchors(case_dir: Path, case: dict) -> list[dict]:
    out = []
    for item in case.get("expected_findings", []):
        out.append({**item, "line": locate(case_dir, item["file"], item["contains"]), "role": "expect"})
    for item in case.get("must_not_flag", []):
        out.append({**item, "line": locate(case_dir, item["file"], item["contains"]), "role": "forbid"})
    return out


def check_cases() -> list[str]:
    errors = []
    case_dirs = sorted(p for p in CASES.iterdir() if p.is_dir())
    if not case_dirs:
        return ["no cases found"]
    for case_dir in case_dirs:
        name = case_dir.name
        try:
            case = load_case(case_dir)
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"{name}: cannot read expected.json: {exc}")
            continue
        kind = case.get("kind")
        if kind not in ("vulnerable", "safe"):
            errors.append(f"{name}: kind must be 'vulnerable' or 'safe'")
        if not name.startswith({"vulnerable": "v", "safe": "s"}.get(kind, "?")):
            errors.append(f"{name}: folder must start with 'v' for vulnerable or 's' for safe cases")
        if kind == "vulnerable" and not case.get("expected_findings"):
            errors.append(f"{name}: vulnerable case has no expected_findings")
        if kind == "safe" and (case.get("expected_findings") or not case.get("must_not_flag")):
            errors.append(f"{name}: safe case needs must_not_flag and no expected_findings")
        if not any((case_dir / f).exists() for f in ("wrangler.toml.fixture", "wrangler.json.fixture", "wrangler.jsonc.fixture")):
            errors.append(f"{name}: missing Wrangler config (stored as wrangler.<ext>.fixture)")
        live = [f for f in ("wrangler.toml", "wrangler.json", "wrangler.jsonc", "package.json") if (case_dir / f).exists()]
        if live:
            errors.append(f"{name}: {', '.join(live)} would make the fixture deployable; store configs as *.fixture")
        for item in case.get("expected_findings", []):
            for key in ("id", "service", "file", "contains", "severity", "autonomous", "explanation"):
                if key not in item:
                    errors.append(f"{name}: expected finding missing '{key}'")
            bad = [s for s in item.get("severity", []) if s not in SEVERITIES[1:]]
            if bad:
                errors.append(f"{name}: unknown severity {bad}")
        for item in case.get("must_not_flag", []):
            for key in ("file", "contains", "max_severity", "reason"):
                if key not in item:
                    errors.append(f"{name}: must_not_flag entry missing '{key}'")
        try:
            anchors(case_dir, case)
        except (OSError, ValueError) as exc:
            errors.append(str(exc))
        # Fixtures must not tell the agent what the answer is.
        for src in case_dir.rglob("*"):
            if src.is_file() and src.name != "expected.json":
                text = src.read_text(encoding="utf-8")
                if src.suffix not in COMMENT:
                    errors.append(f"{name}/{src.relative_to(case_dir)}: unsupported fixture file type")
                    continue
                if not text.startswith(notice_for(src)):
                    errors.append(f"{name}/{src.relative_to(case_dir)}: missing the do-not-deploy notice at the top")
                for lineno, line in enumerate(strip_notice(src, text).splitlines(), 1):
                    if ANSWER_HINT.search(line):
                        errors.append(f"{name}/{src.relative_to(case_dir)}:{lineno}: fixture hints at the answer")
    return errors


# ---------------------------------------------------------------- grading

def parse_report(text: str) -> dict:
    for block in re.findall(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and "cost_guard_report" in data:
            return data
    raise ValueError("no machine-readable summary (JSON block with \"cost_guard_report\") found")


def rank(severity: str) -> int:
    return SEVERITIES.index(severity) if severity in SEVERITIES else 0


def same_file(reported: str, expected: str) -> bool:
    reported = reported.replace("\\", "/").removeprefix("./")
    return reported == expected or reported.endswith("/" + expected)


def near(finding: dict, anchor: dict) -> bool:
    """True if the finding's main location or any listed location is near the anchor."""
    places = [finding] + [p for p in finding.get("locations") or [] if isinstance(p, dict)]
    for place in places:
        try:
            line = int(place.get("line") or 0)
        except (TypeError, ValueError):
            line = 0
        if same_file(str(place.get("file", "")), anchor["file"]) and (
            line == 0 or abs(line - anchor["line"]) <= LINE_WINDOW
        ):
            return True
    return False


def grade(case_dir: Path, report_text: str) -> tuple[bool, list[str]]:
    case = load_case(case_dir)
    notes = []
    try:
        report = parse_report(report_text)
    except ValueError as exc:
        return False, [str(exc)]
    findings = report.get("findings") or []
    ok = True
    for anchor in anchors(case_dir, case):
        matches = [f for f in findings if near(f, anchor)]
        if anchor["role"] == "expect":
            hits = [f for f in matches if f.get("severity") in anchor["severity"]]
            wrong_auto = [f for f in hits if bool(f.get("autonomous")) != bool(anchor["autonomous"])]
            if hits and len(wrong_auto) == len(hits):
                ok = False
                notes.append(f"{anchor['id']}: autonomous should be {anchor['autonomous']}")
            elif hits:
                notes.append(f"found {anchor['id']} as {hits[0].get('severity')} ({hits[0].get('id')})")
            elif matches:
                ok = False
                got = ", ".join(str(f.get("severity")) for f in matches)
                notes.append(f"{anchor['id']}: severity {got}, expected one of {anchor['severity']}")
            else:
                ok = False
                notes.append(f"missed {anchor['id']} at {anchor['file']}:{anchor['line']}")
        else:
            limit = rank(anchor["max_severity"])
            over = [f for f in matches if rank(str(f.get("severity"))) > limit]
            if over:
                ok = False
                notes.append(
                    f"false positive at {anchor['file']}:{anchor['line']}: "
                    f"{over[0].get('severity')} {over[0].get('title', '')!r}"
                )
    cap = case.get("max_overall_severity")
    if cap:
        over = [f for f in findings if rank(str(f.get("severity"))) > rank(cap)]
        if over:
            ok = False
            notes.append(f"{len(over)} finding(s) above {cap} in a safe case")
    if ok and not notes:
        notes.append("no findings above the allowed severity")
    return ok, notes


def grade_all(report_dir: Path) -> int:
    passed = total = 0
    for case_dir in sorted(p for p in CASES.iterdir() if p.is_dir()):
        report = report_dir / f"{case_dir.name}.md"
        total += 1
        if not report.exists():
            print(f"MISS  {case_dir.name}: no report at {report}")
            continue
        ok, notes = grade(case_dir, report.read_text(encoding="utf-8"))
        passed += ok
        print(f"{'pass' if ok else 'FAIL'}  {case_dir.name}: {'; '.join(notes)}")
    print(f"\n{passed}/{total} cases passed")
    return 0 if passed == total else 1


# ---------------------------------------------------------------- self-test

def synthetic_report(findings: list[dict]) -> str:
    body = {"cost_guard_report": 1, "overall_risk": "High", "findings": findings}
    return "# Report\n\n```json\n" + json.dumps(body, indent=2) + "\n```\n"


def self_test() -> list[str]:
    """Perfect reports must pass, empty and wrong ones must fail."""
    errors = []
    for case_dir in sorted(p for p in CASES.iterdir() if p.is_dir()):
        case = load_case(case_dir)
        perfect = [
            {"id": f"CG-{i}", "severity": a["severity"][0], "file": a["file"], "line": a["line"],
             "autonomous": a["autonomous"], "title": a["id"]}
            for i, a in enumerate(anchors(case_dir, case), 1)
            if a["role"] == "expect"
        ]
        ok, notes = grade(case_dir, synthetic_report(perfect))
        if not ok:
            errors.append(f"{case_dir.name}: perfect report failed: {notes}")
        via_locations = [
            {**f, "file": "elsewhere.ts", "line": 1, "locations": [{"file": f["file"], "line": f["line"]}]}
            for f in perfect
        ]
        ok, notes = grade(case_dir, synthetic_report(via_locations))
        if not ok:
            errors.append(f"{case_dir.name}: report matching only via locations failed: {notes}")
        if case["kind"] == "vulnerable":
            flipped = [{**f, "autonomous": not f["autonomous"]} for f in perfect]
            ok, _ = grade(case_dir, synthetic_report(flipped))
            if ok:
                errors.append(f"{case_dir.name}: report with the wrong autonomous flag passed")
            ok, _ = grade(case_dir, synthetic_report([]))
            if ok:
                errors.append(f"{case_dir.name}: empty report passed a vulnerable case")
        else:
            anchor = anchors(case_dir, case)[0]
            wrong = [{"id": "CG-1", "severity": "High", "file": anchor["file"], "line": anchor["line"]}]
            ok, _ = grade(case_dir, synthetic_report(wrong))
            if ok:
                errors.append(f"{case_dir.name}: false positive passed a safe case")
        ok, _ = grade(case_dir, "no json here")
        if ok:
            errors.append(f"{case_dir.name}: report without a summary passed")
    return errors


def main(argv: list[str]) -> int:
    if len(argv) >= 1 and argv[0] in ("check", "self-test"):
        errors = check_cases() if argv[0] == "check" else self_test()
        for error in errors:
            print(f"FAIL  {error}")
        if not errors:
            count = sum(1 for p in CASES.iterdir() if p.is_dir())
            print(f"ok    {argv[0]}: {count} cases")
        return 1 if errors else 0
    if len(argv) == 3 and argv[0] == "grade":
        ok, notes = grade(CASES / argv[1], Path(argv[2]).read_text(encoding="utf-8"))
        print(f"{'pass' if ok else 'FAIL'}  {argv[1]}: {'; '.join(notes)}")
        return 0 if ok else 1
    if len(argv) == 2 and argv[0] == "strip":
        for src in Path(argv[1]).rglob("*"):
            if src.is_file() and src.suffix in COMMENT:
                src.write_text(strip_notice(src, src.read_text(encoding="utf-8")), encoding="utf-8")
        return 0
    if len(argv) == 2 and argv[0] == "grade-all":
        return grade_all(Path(argv[1]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
