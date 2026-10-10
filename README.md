# Layer Cache Agent Skills

A public collection of [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) maintained by [Layer Cache](https://github.com/layercache). Each skill is a self-contained folder of instructions, scripts and resources that an agent such as Claude loads on demand to do a specific task well.

## Repository layout

```
.
├── skills/                 # One folder per published skill
│   └── <skill-name>/
│       ├── SKILL.md        # Required: frontmatter + instructions
│       ├── scripts/        # Optional: helper scripts the skill runs
│       ├── references/     # Optional: docs loaded only when needed
│       └── assets/         # Optional: templates, images, other files
├── template/               # Starting point for a new skill
│   └── SKILL.md
├── scripts/
│   └── validate_skills.py  # Checks every skill's frontmatter
├── CONTRIBUTING.md
└── LICENSE
```

## Skills

| Skill | Description |
| ----- | ----------- |
| _None yet_ | Add the first one with the steps in [CONTRIBUTING.md](CONTRIBUTING.md). |

## Using a skill

**Claude Code:** copy (or symlink) a skill folder into `~/.claude/skills/` for personal use, or into `.claude/skills/` inside a project to share it with that repository.

```bash
git clone https://github.com/layercache/agent-skills.git
cp -r agent-skills/skills/<skill-name> ~/.claude/skills/
```

**Claude.ai:** zip the skill folder and upload it under Settings > Capabilities > Skills.

**Claude API:** upload the skill folder through the Skills API and reference it from your requests.

## Adding a skill

1. Copy `template/` to `skills/<skill-name>/`.
2. Fill in the `name` and `description` frontmatter and write the instructions.
3. Run `python3 scripts/validate_skills.py`.
4. Add a row to the table above and open a pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for naming rules and writing guidance.

## License

[MIT](LICENSE), unless a skill's own folder says otherwise.
