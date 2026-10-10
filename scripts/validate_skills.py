#!/usr/bin/env python3
"""Validate the SKILL.md frontmatter of every skill under skills/ (and the template)."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
RESERVED = ("anthropic", "claude")


def parse_frontmatter(text):
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end == -1:
        return None
    fields = {}
    for line in text[4:end].splitlines():
        if ":" in line and not line.startswith((" ", "\t")):
            key, value = line.split(":", 1)
            fields[key.strip()] = value.strip().strip("\"'")
    return fields


def validate(skill_dir, check_folder_name=True):
    errors = []
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        return [f"{skill_dir.relative_to(ROOT)}: missing SKILL.md"]
    fields = parse_frontmatter(skill_md.read_text(encoding="utf-8"))
    where = skill_md.relative_to(ROOT)
    if fields is None:
        return [f"{where}: missing or malformed YAML frontmatter"]
    name = fields.get("name", "")
    description = fields.get("description", "")
    if not name:
        errors.append(f"{where}: missing 'name'")
    else:
        if not NAME_RE.match(name) or len(name) > 64:
            errors.append(f"{where}: 'name' must be lowercase hyphenated, at most 64 characters")
        if any(word in name for word in RESERVED):
            errors.append(f"{where}: 'name' must not contain {' or '.join(RESERVED)}")
        if check_folder_name and name != skill_dir.name:
            errors.append(f"{where}: 'name' ({name}) must match folder name ({skill_dir.name})")
    if not description:
        errors.append(f"{where}: missing 'description'")
    elif len(description) > 1024:
        errors.append(f"{where}: 'description' exceeds 1024 characters")
    return errors


def main():
    errors = validate(ROOT / "template", check_folder_name=False)
    skills = sorted(p for p in (ROOT / "skills").iterdir() if p.is_dir())
    for skill_dir in skills:
        errors += validate(skill_dir)
    for error in errors:
        print(f"error: {error}")
    print(f"Checked {len(skills)} skill(s) and the template: {len(errors)} error(s).")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
