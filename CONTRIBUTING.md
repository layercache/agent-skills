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
| `license` | No | A license name or a bundled license file. Use `MIT` unless the skill needs something else. |
| `compatibility` | No | Up to 500 characters on environment requirements (product, system packages, network access). Leave it out unless needed. |
| `metadata` | No | String key/value pairs. We set `author: layercache` and a `version`. |
| `allowed-tools` | No | Space-separated list of pre-approved tools. Experimental. |

No other frontmatter fields are allowed.

### Writing guidance

- Keep `SKILL.md` under 500 lines (about 5,000 tokens). Agents load the whole body when the skill activates, so move detailed material into `references/`.
- Reference files with paths relative to the skill root and keep references one level deep.
- Put deterministic work (parsing, conversion, validation) in `scripts/`. Scripts should be self-contained or document their dependencies and give clear error messages.
- Include step-by-step instructions, at least one example, and common edge cases.
- Keep each skill self-contained: link only to files inside its own folder. Installers copy just the skill folder, so links to the rest of the repository break.
- Never commit secrets, API keys or customer data. Everything in this repository is public.
- If a skill needs a license other than MIT, set `license` and bundle the license file in the skill folder.

## Evals

Test cases for a skill go in `evals/<skill-name>/`, never inside the skill folder. Anything in the skill folder is installed into users' projects, and example code there could be picked up by the skill itself or by the user's own tools. See [evals/cloudflare-cost-guard](evals/cloudflare-cost-guard/) for the layout: small fixture projects with an `expected.json` each, a checker CI runs, and a manual runner that drives a real agent.

## Before opening a pull request

1. Install the reference validator with `pip install skills-ref`, then run `scripts/validate.sh` and fix any errors.
2. Run `python3 scripts/check_skills.py` to check links stay inside each skill folder and that the skill contains nothing deployable (no Wrangler config, `package.json` or JavaScript/TypeScript files; keep example code in fenced Markdown snippets).
3. If the skill has evals, run its checks (for example `python3 evals/cloudflare-cost-guard/evaltool.py check`) and, for changes to the skill's instructions, the agent eval described in its README.
4. Add the skill to the table in the root `README.md`, with its `npx skills add layercache/agent-skills#<release tag> --skill <skill-name>` command.
5. Try the skill in an agent and confirm it triggers on the requests you expect.

CI runs the same checks plus a secret scan on every pull request.

Use one pull request per skill where possible. By contributing, you agree your contribution is licensed under MIT.
