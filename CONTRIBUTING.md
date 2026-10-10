# Contributing

## Creating a skill

```bash
cp -r template skills/my-skill
```

Then edit `skills/my-skill/SKILL.md`.

### Frontmatter

Every `SKILL.md` starts with YAML frontmatter containing two required fields:

| Field | Rules |
| ----- | ----- |
| `name` | Lowercase letters, digits and hyphens; at most 64 characters; must match the folder name. Must not contain `anthropic` or `claude`. |
| `description` | What the skill does and when to use it; at most 1024 characters. The agent decides whether to load the skill from this text alone, so be specific about triggers. |

### Writing guidance

- Keep `SKILL.md` focused and under about 500 lines. Move long reference material into `references/` and link to it so it loads only when needed.
- Put deterministic work (parsing, file conversion, validation) in `scripts/` rather than describing it in prose.
- Write instructions in the imperative and include at least one concrete example.
- Never commit secrets, API keys or customer data. Everything in this repository is public.
- If a skill needs a license other than the repository's MIT license, add a `LICENSE` file inside its folder.

## Before opening a pull request

1. Run `python3 scripts/validate_skills.py` and fix any errors.
2. Add the skill to the table in the root `README.md`.
3. Try the skill in Claude Code or Claude.ai and confirm it triggers on the requests you expect.

Use one pull request per skill where possible.
