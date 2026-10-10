# Contributing

Every skill in this repository must follow the [Agent Skills specification](https://agentskills.io/specification). CI rejects any skill that fails the reference validator.

## Creating a skill

```bash
cp -r template skills/my-skill
```

Then edit `skills/my-skill/SKILL.md` and set `name: my-skill`.

A skill folder looks like this; only `SKILL.md` is required:

```
my-skill/
├── SKILL.md       # Frontmatter + instructions
├── scripts/       # Executable code the agent can run
├── references/    # Documentation loaded on demand
└── assets/        # Templates, images, data files
```

### Frontmatter

| Field | Required | Rules |
| ----- | -------- | ----- |
| `name` | Yes | 1–64 characters: lowercase letters, digits and hyphens. No leading, trailing or consecutive hyphens. Must match the folder name. |
| `description` | Yes | 1–1024 characters. Say what the skill does **and** when to use it, with the keywords a user is likely to mention. |
| `license` | No | A license name or a bundled license file. Use `MIT-0` unless the skill needs something else. |
| `compatibility` | No | Up to 500 characters on environment requirements (product, system packages, network access). Leave it out unless needed. |
| `metadata` | No | String key/value pairs. We set `author: layercache` and a `version`. |
| `allowed-tools` | No | Space-separated list of pre-approved tools. Experimental. |

No other frontmatter fields are allowed.

### Writing guidance

- Keep `SKILL.md` under 500 lines (about 5,000 tokens). Agents load the whole body when the skill activates, so move detailed material into `references/`.
- Reference files with paths relative to the skill root and keep references one level deep.
- Put deterministic work (parsing, conversion, validation) in `scripts/`. Scripts should be self-contained or document their dependencies and give clear error messages.
- Include step-by-step instructions, at least one example, and common edge cases.
- Never commit secrets, API keys or customer data. Everything in this repository is public.
- If a skill needs a license other than MIT-0, set `license` and bundle the license file in the skill folder.

## Before opening a pull request

1. Install the reference validator with `pip install skills-ref`, then run `scripts/validate.sh` and fix any errors.
2. Add the skill to the table in the root `README.md`.
3. Try the skill in an agent and confirm it triggers on the requests you expect.

Use one pull request per skill where possible. By contributing, you agree your contribution is licensed under MIT-0.
