# Layer Cache Agent Skills

A public collection of [Agent Skills](https://agentskills.io) maintained by [Layer Cache](https://github.com/layercache). Each skill is a self-contained folder of instructions, scripts and resources that an agent loads on demand to do a specific task well. Every skill follows the open [Agent Skills specification](https://agentskills.io/specification), so it works in any agent that supports the format.

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
│   └── validate.sh         # Validates every skill against the spec
├── CONTRIBUTING.md
└── LICENSE
```

## Skills

| Skill | Description |
| ----- | ----------- |
| _None yet_ | Add the first one with the steps in [CONTRIBUTING.md](CONTRIBUTING.md). |

## Using a skill

Skills are plain folders, so installing one means putting its folder where your agent looks for skills. For example:

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
3. Run `scripts/validate.sh` (needs `pip install skills-ref`).
4. Add a row to the table above and open a pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for naming rules and writing guidance.

## License

[MIT](LICENSE), unless a skill's own folder says otherwise.
