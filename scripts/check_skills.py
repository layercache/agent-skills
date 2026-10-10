#!/usr/bin/env python3
"""Repository checks the reference validator does not cover.

For every skill under skills/ (the template is skipped: its paths are examples):
- every relative Markdown link and every backticked scripts/, references/ or
  assets/ path points to a file that exists inside the same skill folder, so
  the skill still works after it is installed on its own;
- no link points outside the skill folder;
- no symlinks, which installers may not copy;
- nothing deployable: no Wrangler config, package.json or JavaScript/TypeScript
  files (example code belongs in fenced Markdown snippets);
- SKILL.md stays under 500 lines, as CONTRIBUTING.md asks.

Uses only the Python standard library.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_SKILL_LINES = 500
DEPLOYABLE_NAMES = {"wrangler.toml", "wrangler.json", "wrangler.jsonc", "package.json"}
DEPLOYABLE_SUFFIXES = {".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx"}

LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
BACKTICK_PATH = re.compile(r"`((?:scripts|references|assets)/[^`\s]+)`")
FENCE = re.compile(r"^(```|~~~)")


def strip_fences(text: str) -> str:
    """Drop fenced code blocks so example snippets are not checked as links."""
    out, in_fence = [], False
    for line in text.splitlines():
        if FENCE.match(line.strip()):
            in_fence = not in_fence
            continue
        if not in_fence:
            out.append(line)
    return "\n".join(out)


def check_skill(skill: Path) -> list[str]:
    errors = []
    skill_md = skill / "SKILL.md"
    if skill_md.exists():
        lines = len(skill_md.read_text(encoding="utf-8").splitlines())
        if lines > MAX_SKILL_LINES:
            errors.append(f"{skill_md.relative_to(ROOT)}: {lines} lines (max {MAX_SKILL_LINES})")

    for path in sorted(skill.rglob("*")):
        rel = path.relative_to(ROOT)
        if path.is_symlink():
            errors.append(f"{rel}: symlinks are not allowed in a skill")
            continue
        if path.is_file() and (path.name in DEPLOYABLE_NAMES or path.suffix in DEPLOYABLE_SUFFIXES):
            errors.append(f"{rel}: deployable file in a skill; put example code in a fenced Markdown snippet")
            continue
        if path.suffix != ".md" or not path.is_file():
            continue
        text = strip_fences(path.read_text(encoding="utf-8"))
        targets = [m.group(1) for m in LINK.finditer(text)]
        # Backticked paths are relative to the skill root by convention.
        rooted = [m.group(1) for m in BACKTICK_PATH.finditer(text)]
        for target in targets:
            if re.match(r"^[a-z][a-z0-9+.-]*:", target) or target.startswith("#"):
                continue  # external URL, mailto: or same-page anchor
            target_path = target.split("#", 1)[0]
            if target_path.startswith("/"):
                errors.append(f"{rel}: absolute link '{target}'")
                continue
            resolved = (path.parent / target_path).resolve()
            errors.extend(check_target(skill, rel, target, resolved))
        for target in rooted:
            if "<" in target or "*" in target:
                continue  # placeholder or glob, not a real path
            resolved = (skill / target.rstrip("/")).resolve()
            errors.extend(check_target(skill, rel, target, resolved))
    return errors


def check_target(skill: Path, rel: Path, target: str, resolved: Path) -> list[str]:
    if not resolved.is_relative_to(skill.resolve()):
        return [f"{rel}: '{target}' points outside the skill folder"]
    if not resolved.exists():
        return [f"{rel}: '{target}' does not exist"]
    return []


def main() -> int:
    skills = sorted(p for p in (ROOT / "skills").iterdir() if p.is_dir())
    status = 0
    for skill in skills:
        errors = check_skill(skill)
        label = skill.relative_to(ROOT)
        if errors:
            status = 1
            print(f"FAIL  {label}")
            for error in errors:
                print(f"      {error}")
        else:
            print(f"ok    {label}")
    return status


if __name__ == "__main__":
    sys.exit(main())
