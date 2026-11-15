#!/usr/bin/env python3
"""Fixture checks and grading for the cloudflare-cost-guard evals.

  evaltool.py check                 Validate every case (runs in CI).
  evaltool.py grade CASE REPORT     Grade one agent report against a case.
  evaltool.py grade-all REPORT_DIR  Grade every report under REPORT_DIR.
  evaltool.py scorecard REPORT_DIR  Print a Markdown scorecard for REPORT_DIR.
  evaltool.py self-test             Check the grader on synthetic reports (runs in CI).
  evaltool.py strip DIR             Remove the do-not-deploy notice from a copied case.

A report is the agent's Markdown output. The grader reads the JSON block the
skill's report template ends with ("cost_guard_report": 1).

REPORT_DIR holds <case>.md files, or run-<n>/<case>.md when a case was run
more than once. A <case>.modified file next to a report means the agent
changed the working copy it was asked to audit; that fails the run.

Uses only the Python standard library.
"""
import json
import re
import sys
import tempfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
CASES = HERE / "cases"
SEVERITIES = ["None", "Low", "Medium", "High", "Critical"]
EXPOSURES = ["autonomous", "external", "credential", "n/a"]
ANSWER_HINT = re.compile(r"\b(vulnerab|counterexample|expected finding|eval)", re.IGNORECASE)
LINE_WINDOW = 8
# In a risky case, a finding that matches no expected or allowed location fails
# the case when it is rated above this. A case can set its own value.
MAX_UNEXPECTED_SEVERITY = "High"

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
COMMENT = {".ts": "//", ".fixture": "//", ".sql": "--", ".sh": "#"}


def notice_for(path: Path) -> str:
    prefix = COMMENT[path.suffix]
    return "".join(f"{prefix} {line}\n" for line in NOTICE_LINES) + "\n"


def strip_notice(path: Path, text: str) -> str:
    notice = notice_for(path)
    return text[len(notice):] if text.startswith(notice) else text


# ---------------------------------------------------------------- cases

def case_dirs() -> list[Path]:
    return sorted(p for p in CASES.iterdir() if p.is_dir())


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


def places(case_dir: Path, item: dict) -> list[tuple[str, int]]:
    """Every (file, line) that counts as this item's location.

    "contains" is the main location. "also" lists other lines on the same path
    (the handler, the scheduling call, the query the loop runs), so a report that
    cites a different line of the same problem still matches.
    """
    out = [(item["file"], locate(case_dir, item["file"], item["contains"]))]
    for extra in item.get("also", []):
        file = extra.get("file", item["file"])
        out.append((file, locate(case_dir, file, extra["contains"])))
    return out


def anchors(case_dir: Path, case: dict) -> list[dict]:
    out = []
    for key, role in (("expected_findings", "expect"), ("may_flag", "allow"), ("must_not_flag", "forbid")):
        for item in case.get(key, []):
            spots = places(case_dir, item)
            out.append({**item, "places": spots, "line": spots[0][1], "role": role})
    return out


def check_cases() -> list[str]:
    errors = []
    dirs = case_dirs()
    if not dirs:
        return ["no cases found"]
    readme = (HERE / "README.md").read_text(encoding="utf-8")
    listed = set(re.findall(r"^\| `([vs]\d+-[a-z0-9-]+)` \|", readme, re.MULTILINE))
    names = {d.name for d in dirs}
    for name in sorted(names - listed):
        errors.append(f"{name}: not in the README case table")
    for name in sorted(listed - names):
        errors.append(f"README lists {name}, but there is no such case folder")
    for case_dir in dirs:
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
        if kind == "safe" and case.get("max_overall_severity") not in SEVERITIES[1:]:
            errors.append(f"{name}: safe case needs max_overall_severity")
        if case.get("max_unexpected_severity", MAX_UNEXPECTED_SEVERITY) not in SEVERITIES[1:]:
            errors.append(f"{name}: unknown max_unexpected_severity")
        # A monorepo case keeps a config in each Worker's folder, so look at every level.
        if not any(case_dir.rglob("wrangler.*.fixture")):
            errors.append(f"{name}: missing Wrangler config (stored as wrangler.<ext>.fixture)")
        live = sorted(
            str(p.relative_to(case_dir))
            for f in ("wrangler.toml", "wrangler.json", "wrangler.jsonc", "package.json")
            for p in case_dir.rglob(f)
        )
        if live:
            errors.append(f"{name}: {', '.join(live)} would make the fixture deployable; store configs as *.fixture")
        for item in case.get("expected_findings", []):
            for key in ("id", "service", "file", "contains", "severity", "autonomous", "explanation"):
                if key not in item:
                    errors.append(f"{name}: expected finding missing '{key}'")
            bad = [s for s in item.get("severity", []) if s not in SEVERITIES[1:]]
            if bad:
                errors.append(f"{name}: unknown severity {bad}")
            bad = [e for e in item.get("exposure", []) if e not in EXPOSURES]
            if bad:
                errors.append(f"{name}: unknown exposure {bad}")
            bad = [s for s in item.get("severity_if_enabled", []) if s not in SEVERITIES[1:]]
            if bad or not isinstance(item.get("gated_by", ""), str):
                errors.append(f"{name}: gated_by must be a string and severity_if_enabled a list of severities")
        for key in ("may_flag", "must_not_flag"):
            for item in case.get(key, []):
                for field in ("file", "contains", "max_severity", "reason"):
                    if field not in item:
                        errors.append(f"{name}: {key} entry missing '{field}'")
                if item.get("max_severity") not in SEVERITIES[1:]:
                    errors.append(f"{name}: {key} entry has an unknown max_severity")
        for key in ("expected_findings", "may_flag", "must_not_flag"):
            for item in case.get(key, []):
                for extra in item.get("also", []):
                    if not isinstance(extra, dict) or "contains" not in extra:
                        errors.append(f"{name}: every 'also' entry needs 'contains'")
        try:
            anchors(case_dir, case)
        except (OSError, ValueError, KeyError, AttributeError) as exc:
            errors.append(f"{name}: {exc}")
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


def locations(finding: dict) -> list[tuple[str, int]]:
    """The finding's main location and every listed location, as (file, line); line 0 means none given."""
    out = []
    for place in [finding] + [p for p in finding.get("locations") or [] if isinstance(p, dict)]:
        try:
            line = int(place.get("line") or 0)
        except (TypeError, ValueError):
            line = 0
        out.append((str(place.get("file", "")), line))
    return out


def distance(finding: dict, anchor: dict, unlined: bool = False) -> int | None:
    """Lines between the anchor and the finding's closest location, or None if not near.

    A location with no line number does not count, unless unlined is set; then it
    counts as near, at the edge of the window. Expected findings need a real line.
    """
    best = None
    for file, line in locations(finding):
        for anchor_file, anchor_line in anchor["places"]:
            if not same_file(file, anchor_file):
                continue
            if line == 0:
                gap = LINE_WINDOW if unlined else None
            else:
                gap = abs(line - anchor_line)
            if gap is not None and gap <= LINE_WINDOW and (best is None or gap < best):
                best = gap
    return best


def owns(finding: dict, anchor: dict, expected: list[dict]) -> bool:
    """True if the finding is near the anchor and no other expected anchor is closer.

    One finding then cannot stand in for a different expected finding a few lines away.
    """
    gap = distance(finding, anchor)
    if gap is None:
        return False
    for other in expected:
        if other is anchor:
            continue
        other_gap = distance(finding, other)
        if other_gap is not None and other_gap < gap:
            return False
    return True


def pair_up(options: list[list[int]]) -> dict[int, int]:
    """Give each expected finding a reported finding of its own, for as many as possible.

    options[e] lists the reported findings that satisfy expected finding e. A reported
    finding is used once, so one that sits exactly on two expected findings counts for
    only one of them. Returns {expected index: finding index}.
    """
    used: dict[int, int] = {}  # finding index -> expected index

    def place(e: int, seen: set[int]) -> bool:
        for f in options[e]:
            if f in seen:
                continue
            seen.add(f)
            # Take a free finding, or one whose current expected finding can use another.
            if f not in used or place(used[f], seen):
                used[f] = e
                return True
        return False

    for e in range(len(options)):
        place(e, set())
    return {e: f for f, e in used.items()}


def label(finding: dict) -> str:
    return f"{finding.get('severity')} {finding.get('title', '')!r} at {finding.get('file')}:{finding.get('line')}"


def field_problems(finding: dict, anchor: dict) -> list[str]:
    """What is wrong with the finding's exposure and gating fields, where the case names them."""
    problems = []
    allowed = anchor.get("exposure")
    if allowed and finding.get("exposure") not in allowed:
        problems.append(f"exposure {finding.get('exposure')!r}, expected one of {allowed}")
    gate = anchor.get("gated_by")
    if gate and gate.lower() not in str(finding.get("gated_by") or "").lower():
        problems.append(f"gated_by {finding.get('gated_by')!r} does not name {gate}")
    flipped = anchor.get("severity_if_enabled")
    if flipped and finding.get("severity_if_enabled") not in flipped:
        problems.append(f"severity_if_enabled {finding.get('severity_if_enabled')!r}, expected one of {flipped}")
    return problems


def fits(finding: dict, anchor: dict) -> bool:
    """True if the finding satisfies the expected finding in full: severity, autonomous flag and named fields."""
    return (
        finding.get("severity") in anchor["severity"]
        and bool(finding.get("autonomous")) == bool(anchor["autonomous"])
        and not field_problems(finding, anchor)
    )


def grade_detail(case_dir: Path, report_text: str) -> dict:
    """Grade one report. Returns ok, notes, the severity given to each expected finding, and other findings."""
    case = load_case(case_dir)
    result = {"ok": False, "notes": [], "found": {}, "other": []}
    notes = result["notes"]
    try:
        report = parse_report(report_text)
    except ValueError as exc:
        notes.append(str(exc))
        return result
    findings = [f for f in report.get("findings") or [] if isinstance(f, dict)]
    ok = True
    all_anchors = anchors(case_dir, case)
    expected = [a for a in all_anchors if a["role"] == "expect"]
    # Each expected finding needs a reported finding of its own. A finding that is equally
    # near two expected findings is owned by both, so pair them up before judging either.
    owners = [[i for i, f in enumerate(findings) if owns(f, a, expected)] for a in expected]
    paired = pair_up([[i for i in mine if fits(findings[i], a)] for mine, a in zip(owners, expected)])
    used = {f: e for e, f in paired.items()}
    claimed: set[int] = set(used)

    for e, anchor in enumerate(expected):
        if e in paired:
            hit = findings[paired[e]]
            result["found"][anchor["id"]] = hit.get("severity")
            notes.append(f"found {anchor['id']} as {hit.get('severity')} ({hit.get('id')})")
            continue
        ok = False
        # What the report did say here is its answer for this expected finding, right or wrong.
        claimed.update(i for i in owners[e] if i not in used)
        spare = [findings[i] for i in owners[e] if i not in used]
        hits = [f for f in spare if f.get("severity") in anchor["severity"]]
        good = [f for f in hits if bool(f.get("autonomous")) == bool(anchor["autonomous"])]
        result["found"][anchor["id"]] = (good or hits or spare or [{"severity": "missed"}])[0].get("severity")
        if good:
            notes.append(f"{anchor['id']}: {min((field_problems(f, anchor) for f in good), key=len)[0]}")
        elif hits:
            notes.append(f"{anchor['id']}: autonomous should be {anchor['autonomous']}")
        elif spare:
            got = ", ".join(str(f.get("severity")) for f in spare)
            notes.append(f"{anchor['id']}: severity {got}, expected one of {anchor['severity']}")
        elif owners[e]:
            taken = expected[used[owners[e][0]]]["id"]
            notes.append(
                f"missed {anchor['id']} at {anchor['file']}:{anchor['line']}: "
                f"the finding there already counts as {taken}, and one finding cannot cover two"
            )
        else:
            unlined = [f for f in findings if distance(f, anchor, unlined=True) is not None]
            hint = " (a finding names the file but gives no line number)" if unlined else ""
            notes.append(f"missed {anchor['id']} at {anchor['file']}:{anchor['line']}{hint}")

    # A finding beside one that was paired is judged as well. It may repeat the problem, but
    # not rate it above what the case accepts there: a correct finding does not excuse an
    # overrated one on the same code. An overrated one stays among the other findings.
    for i, finding in enumerate(findings):
        beside = [a for e, a in enumerate(expected) if e in paired and i in owners[e]]
        if i in claimed or not beside:
            continue
        ceiling = max(rank(s) for a in beside for s in a["severity"])
        if rank(str(finding.get("severity"))) > ceiling:
            ok = False
            notes.append(f"{label(finding)} is rated above the {SEVERITIES[ceiling]} expected for {beside[0]['id']}")
        else:
            claimed.add(i)

    for anchor in all_anchors:
        if anchor["role"] == "expect":
            continue
        # A finding that sits at least as close to an expected finding belongs to that one,
        # so an allowed or forbidden location a few lines away does not judge it.
        matches = [
            i for i, f in enumerate(findings)
            if (gap := distance(f, anchor, unlined=True)) is not None
            and not any((d := distance(f, e)) is not None and d <= gap for e in expected)
        ]
        over = [findings[i] for i in matches if rank(str(findings[i].get("severity"))) > rank(anchor["max_severity"])]
        if anchor["role"] == "allow":
            claimed.update(matches)
            if over:
                ok = False
                notes.append(f"{label(over[0])} is rated above the {anchor['max_severity']} allowed there")
        elif over:
            ok = False
            notes.append(f"false positive at {anchor['file']}:{anchor['line']}: {label(over[0])}")

    cap = case.get("max_overall_severity")
    if cap:
        over = [f for f in findings if rank(str(f.get("severity"))) > rank(cap)]
        if over:
            ok = False
            notes.append(f"{len(over)} finding(s) above {cap} in a safe case: {label(over[0])}")

    # Findings that match nothing the case knows about.
    others = [f for i, f in enumerate(findings) if i not in claimed]
    result["other"] = [str(f.get("severity")) for f in others]
    if case.get("kind") == "vulnerable":
        limit = case.get("max_unexpected_severity", MAX_UNEXPECTED_SEVERITY)
        over = [f for f in others if rank(str(f.get("severity"))) > rank(limit)]
        if over:
            ok = False
            notes.append(f"unexpected finding above {limit}: {label(over[0])}")

    # The summary fields must agree with the findings they summarize.
    top = max((rank(str(f.get("severity"))) for f in findings), default=0)
    if report.get("overall_risk") != SEVERITIES[top]:
        ok = False
        notes.append(f"summary: overall_risk is {report.get('overall_risk')!r}, the findings give {SEVERITIES[top]!r}")
    runaway = any(f.get("autonomous") and rank(str(f.get("severity"))) >= rank("High") for f in findings)
    if report.get("autonomous_runaway_paths") is not runaway:
        ok = False
        notes.append(
            f"summary: autonomous_runaway_paths is {report.get('autonomous_runaway_paths')!r}, "
            f"the findings give {runaway}"
        )

    if ok and not notes:
        notes.append("no findings above the allowed severity")
    result["ok"] = ok
    return result


def grade(case_dir: Path, report_text: str) -> tuple[bool, list[str]]:
    result = grade_detail(case_dir, report_text)
    return result["ok"], result["notes"]


def read_meta(report_dir: Path) -> dict:
    """What run.sh recorded about a run: skill version, commit, agent, runs per case and the cases asked for."""
    path = report_dir / "meta.json"
    meta = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return meta if isinstance(meta, dict) else {}


def collect(report_dir: Path) -> dict[str, list[dict]]:
    """Grade every run that report_dir was meant to hold. Returns {case: [result per run]}.

    meta.json, which run.sh writes before the first agent starts, names the cases and the
    number of runs. A report that is not there counts as a failed run, so a run that stopped
    early cannot pass on the reports it did produce. Where meta.json does not say, the run
    folders present and the cases with at least one report stand in for it.
    """
    meta = read_meta(report_dir)
    trials = meta.get("trials")
    if isinstance(trials, int) and trials > 1:
        run_dirs = [report_dir / f"run-{n}" for n in range(1, trials + 1)]
    elif trials == 1:
        run_dirs = [report_dir]
    else:
        run_dirs = sorted(p for p in report_dir.glob("run-*") if p.is_dir()) or [report_dir]
    asked = meta.get("cases")
    out: dict[str, list[dict]] = {}
    for case_dir in case_dirs():
        name = case_dir.name
        reports = [run_dir / f"{name}.md" for run_dir in run_dirs]
        wanted = name in asked if isinstance(asked, list) else any(r.exists() for r in reports)
        runs = []
        for run_dir, report in zip(run_dirs, reports) if wanted else []:
            if report.exists():
                result = grade_detail(case_dir, report.read_text(encoding="utf-8"))
                modified = run_dir / f"{name}.modified"
                if modified.exists():
                    changed = ", ".join(modified.read_text(encoding="utf-8").split()[:6])
                    result["ok"] = False
                    result["notes"].insert(0, f"the agent changed the working copy: {changed}")
            else:
                missing = f"no report at {report.relative_to(report_dir)}: this run did not produce one"
                result = {"ok": False, "notes": [missing], "found": {}, "other": []}
            result["run"] = run_dir.name if run_dir != report_dir else ""
            runs.append(result)
        out[name] = runs
    return out


def grade_all(report_dir: Path) -> int:
    results = collect(report_dir)
    ran = {name: runs for name, runs in results.items() if runs}
    passed = 0
    for name, runs in ran.items():
        for result in runs:
            tag = f" [{result['run']}]" if result["run"] else ""
            print(f"{'pass' if result['ok'] else 'FAIL'}  {name}{tag}: {'; '.join(result['notes'])}")
        passed += all(r["ok"] for r in runs)
    most = max((len(runs) for runs in ran.values()), default=0)
    print(f"\n{passed}/{len(ran)} cases passed" + (f" every one of up to {most} runs" if most > 1 else ""))
    skipped = sorted(set(results) - set(ran))
    if skipped:
        print(f"not run ({len(skipped)}): {', '.join(skipped)}")
    if not ran:
        print(f"no reports found under {report_dir}")
    return 0 if ran and passed == len(ran) else 1


def scorecard(report_dir: Path) -> str:
    """A Markdown table of the results under report_dir, for a pull request or the scorecards folder."""
    results = collect(report_dir)
    meta = read_meta(report_dir)
    lines = ["# Cost Guard eval scorecard", ""]
    for key in ("skill_version", "commit", "date", "agent", "trials"):
        if key in meta:
            lines.append(f"- **{key.replace('_', ' ').capitalize()}:** {meta[key]}")
    total = sum(1 for runs in results.values() if runs)
    clean = sum(1 for runs in results.values() if runs and all(r["ok"] for r in runs))
    lines += [f"- **Cases passing every run:** {clean} of {total}", ""]
    lines += ["| Case | Expected | Passed | Reported | Other findings | First failure |",
              "| ---- | -------- | ------ | -------- | -------------- | ------------- |"]
    for case_dir in case_dirs():
        runs = results.get(case_dir.name) or []
        case = load_case(case_dir)
        if case["kind"] == "safe":
            want = f"nothing above {case['max_overall_severity']}"
        else:
            want = "; ".join(" or ".join(f["severity"]) for f in case["expected_findings"])
        if not runs:
            continue
        found = Counter()
        for r in runs:
            found.update(str(sev) for sev in r["found"].values())
        other = Counter(sev for r in runs for sev in r["other"])
        tally = lambda c: ", ".join(f"{k} ×{v}" for k, v in sorted(c.items(), key=lambda kv: -rank(kv[0]))) or "none"
        reported = tally(found) if case["kind"] == "vulnerable" else "n/a"
        failure = next((r["notes"][0] for r in runs if not r["ok"]), "")
        lines.append(
            f"| `{case_dir.name}` | {want} | {sum(r['ok'] for r in runs)} of {len(runs)} | {reported} | "
            f"{tally(other)} | {failure.replace('|', '/')} |"
        )
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- self-test

def synthetic_report(findings: list[dict], **summary) -> str:
    """A report whose summary fields agree with its findings, unless overridden."""
    top = max((rank(str(f.get("severity"))) for f in findings), default=0)
    body = {
        "cost_guard_report": 1,
        "overall_risk": SEVERITIES[top],
        "autonomous_runaway_paths": any(
            f.get("autonomous") and rank(str(f.get("severity"))) >= rank("High") for f in findings
        ),
        "findings": findings,
        **summary,
    }
    return "# Report\n\n```json\n" + json.dumps(body, indent=2) + "\n```\n"


def self_test() -> list[str]:
    """Perfect reports must pass; empty, wrong, vague and padded ones must fail."""
    errors = []
    stray = {"id": "CG-99", "file": "src/not-in-this-case.ts", "line": 3, "autonomous": True, "title": "stray"}
    for case_dir in case_dirs():
        case = load_case(case_dir)
        name = case_dir.name
        expected = [a for a in anchors(case_dir, case) if a["role"] == "expect"]

        def passes(findings: list[dict], **summary) -> bool:
            return grade(case_dir, synthetic_report(findings, **summary))[0]

        perfect = [
            {"id": f"CG-{i}", "severity": a["severity"][0], "file": a["file"], "line": a["line"],
             "autonomous": a["autonomous"], "exposure": (a.get("exposure") or ["external"])[0], "title": a["id"],
             "gated_by": f"{a['gated_by']}=false" if a.get("gated_by") else None,
             "severity_if_enabled": (a.get("severity_if_enabled") or [None])[0]}
            for i, a in enumerate(expected, 1)
        ]
        if not passes(perfect):
            errors.append(f"{name}: perfect report failed: {grade(case_dir, synthetic_report(perfect))[1]}")
        via_locations = [
            {**f, "file": "elsewhere.ts", "line": 1, "locations": [{"file": f["file"], "line": f["line"]}]}
            for f in perfect
        ]
        if not passes(via_locations):
            errors.append(f"{name}: report matching only via locations failed")
        for i, anchor in enumerate(expected):
            # A report that cites any other listed line of the same problem must match too.
            for file, line in anchor["places"][1:]:
                moved = [f if j != i else {**f, "file": file, "line": line} for j, f in enumerate(perfect)]
                if not passes(moved):
                    errors.append(f"{name}: {anchor['id']} cited at {file}:{line} did not match")
            for j, other in enumerate(expected):
                if j == i:
                    continue
                # A finding on this anchor that also lists the exact line of another one is
                # equally near both. It counts for one, so the other still needs its own.
                both = {**perfect[i], "locations": [{"file": other["file"], "line": other["line"]}]}
                rest = [f for k, f in enumerate(perfect) if k not in (i, j)]
                if passes([both] + rest):
                    errors.append(f"{name}: one finding on {anchor['id']} and {other['id']} satisfied both")
                if not passes([both, perfect[j]] + rest):
                    errors.append(f"{name}: a finding on two anchors kept {other['id']} from its own")
            others = [b for b in expected if b is not anchor and b["file"] == anchor["file"]]
            if not others:
                continue
            # One finding on this anchor that also lists a line just inside the window of
            # each other anchor in the same file must not satisfy those anchors too.
            reach = [{"file": b["file"], "line": b["line"] + (LINE_WINDOW if b["line"] > anchor["line"] else -LINE_WINDOW)}
                     for b in others]
            one = [{**perfect[i], "locations": [{"file": anchor["file"], "line": anchor["line"]}] + reach}]
            if passes(one):
                errors.append(f"{name}: one finding satisfied {len(others) + 1} expected findings")
        if case["kind"] == "vulnerable":
            if passes([{**f, "autonomous": not f["autonomous"]} for f in perfect]):
                errors.append(f"{name}: report with the wrong autonomous flag passed")
            if passes([]):
                errors.append(f"{name}: empty report passed a vulnerable case")
            if passes([{**f, "line": 0} for f in perfect]):
                errors.append(f"{name}: report with no line numbers passed")
            if passes(perfect + [{**stray, "severity": "Critical"}]):
                errors.append(f"{name}: an unexpected Critical finding passed")
            # A second finding on the code of an expected one may repeat it, not rate it higher.
            twin = {**perfect[0], "id": "CG-97", "title": "the same code again"}
            ceiling = max(rank(s) for s in expected[0]["severity"])
            if not passes(perfect + [twin]):
                errors.append(f"{name}: a second finding at the expected severity failed the case")
            if ceiling < rank("Critical") and passes(perfect + [{**twin, "severity": SEVERITIES[ceiling + 1]}]):
                errors.append(f"{name}: an overrated second finding at an expected location passed")
            if not passes(perfect + [{**stray, "severity": "Low", "autonomous": False}]):
                errors.append(f"{name}: an unexpected Low finding failed the case")
            if any("exposure" in a for a in expected) and passes([{**f, "exposure": "n/a"} for f in perfect]):
                errors.append(f"{name}: report with the wrong exposure passed")
            if any("gated_by" in a for a in expected) and passes(
                [{**f, "gated_by": None, "severity_if_enabled": None} for f in perfect]
            ):
                errors.append(f"{name}: report without the gating fields passed")
            if passes(perfect, overall_risk="None"):
                errors.append(f"{name}: overall_risk that disagrees with the findings passed")
            wrong = not any(f["autonomous"] and rank(f["severity"]) >= rank("High") for f in perfect)
            if passes(perfect, autonomous_runaway_paths=wrong):
                errors.append(f"{name}: autonomous_runaway_paths that disagrees with the findings passed")
        else:
            anchor = anchors(case_dir, case)[0]
            wrong = [{"id": "CG-1", "severity": "High", "file": anchor["file"], "line": anchor["line"]}]
            if passes(wrong):
                errors.append(f"{name}: false positive passed a safe case")
            above = SEVERITIES[rank(case["max_overall_severity"]) + 1]
            if passes([{**stray, "severity": above}]):
                errors.append(f"{name}: a {above} finding away from the anchors passed a safe case")
            if passes([], overall_risk="Low"):
                errors.append(f"{name}: overall_risk 'Low' with no findings passed")
        for forbid in (a for a in anchors(case_dir, case) if a["role"] == "forbid"):
            # A finding on forbidden code must fail the case, even next to an expected finding.
            file, line = forbid["places"][0]
            if any(place == (file, line) for e in expected for place in e["places"]):
                continue
            above = SEVERITIES[min(rank(forbid["max_severity"]) + 1, len(SEVERITIES) - 1)]
            bad = {"id": "CG-98", "severity": above, "file": file, "line": line, "autonomous": False, "title": "forbidden"}
            if passes(perfect + [bad]):
                errors.append(f"{name}: a {above} finding at {file}:{line} (must_not_flag) passed")
        if grade(case_dir, "no json here")[0]:
            errors.append(f"{name}: report without a summary passed")
    return errors + missing_report_errors()


def missing_report_errors() -> list[str]:
    """A report that a run was meant to produce and did not must fail that run, not drop out of the count."""
    safe = [d.name for d in case_dirs() if load_case(d)["kind"] == "safe"]
    if len(safe) < 2:
        return []
    name, other = safe[:2]

    def oks(meta: dict | None, layout: dict[str, list[str]]) -> dict[str, list[bool]]:
        """Pass or fail per run, for a results folder with this meta.json and these reports per folder."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            if meta is not None:
                (root / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
            for folder, cases in layout.items():
                (root / folder).mkdir(exist_ok=True)
                for case in cases:
                    (root / folder / f"{case}.md").write_text(synthetic_report([]), encoding="utf-8")
            return {case: [r["ok"] for r in runs] for case, runs in collect(root).items() if runs}

    errors = []
    one_of_three = {"run-1": [name], "run-2": [], "run-3": []}
    for meta in ({"trials": 3, "cases": [name]}, {"trials": 3}, None):
        if oks(meta, one_of_three) != {name: [True, False, False]}:
            errors.append(f"grade-all: one report out of three runs did not fail two runs (meta.json: {meta})")
    if oks({"trials": 3, "cases": [name]}, {"run-1": [name]}) != {name: [True, False, False]}:
        errors.append("grade-all: run folders that were never created did not count as failed runs")
    if oks({"trials": 1, "cases": [name, other]}, {".": [name]}) != {name: [True], other: [False]}:
        errors.append("grade-all: a case that was asked for and left no report did not fail")
    if oks({"trials": 1, "cases": [name]}, {".": [name]}) != {name: [True]}:
        errors.append("grade-all: a run of selected cases failed for the cases it did not select")
    return errors


def main(argv: list[str]) -> int:
    if len(argv) >= 1 and argv[0] in ("check", "self-test"):
        errors = check_cases() if argv[0] == "check" else self_test()
        for error in errors:
            print(f"FAIL  {error}")
        if not errors:
            print(f"ok    {argv[0]}: {len(case_dirs())} cases")
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
    if len(argv) == 2 and argv[0] == "scorecard":
        print(scorecard(Path(argv[1])), end="")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
