# Layer Cache Agent Skills

Free, open-source [Agent Skills](https://agentskills.io) for coding agents, maintained by [Layer Cache](https://github.com/layercache). Each skill is a self-contained folder of instructions and reference material that an agent loads when a task calls for it. Every skill follows the open [Agent Skills specification](https://agentskills.io/specification), so it works in any agent that supports the format, including Codex, Cursor, GitHub Copilot, Gemini CLI, OpenCode, Windsurf and Claude Code.

## Skills

| Skill | What it does | Install |
| ----- | ------------ | ------- |
| [Cloudflare Cost Guard](skills/cloudflare-cost-guard/) | Read-only audit of a Cloudflare codebase for runaway usage and surprise billing: self-rescheduling alarms, queue loops, recursive Workers, unbounded retries and more. | `npx skills add layercache/agent-skills#v1.4.0 --skill cloudflare-cost-guard` |

## Install

Skills install with the [`skills` CLI](https://github.com/vercel-labs/skills) (the one behind [skills.sh](https://skills.sh)). It needs Node.js and installs the skill for the agents you choose.

Install from a tagged release, so you get a reviewed version of `main` rather than whatever was pushed last. The examples use `v1.4.0`; check [Releases](https://github.com/layercache/agent-skills/releases) for the latest tag. The CLI shows what it is about to install and asks before writing anything, so read the prompt rather than skipping it.

```bash
# See what's available
npx skills add layercache/agent-skills#v1.4.0 --list

# Install one skill into the current project
npx skills add layercache/agent-skills#v1.4.0 --skill cloudflare-cost-guard

# Install for your user account instead, so every project can use it
# (-a names your agent: codex, cursor, github-copilot, gemini-cli, opencode, claude-code, ...)
npx skills add layercache/agent-skills#v1.4.0 --skill cloudflare-cost-guard -g -a <agent>

# Install for specific agents only
npx skills add layercache/agent-skills#v1.4.0 --skill cloudflare-cost-guard -a codex -a cursor

# Install every skill in this repository
npx skills add layercache/agent-skills#v1.4.0 --skill '*'
```

**What gets installed:** only the skill folder (`skills/<name>/`): Markdown instructions, reference notes and a report template. It contains no Wrangler config, `package.json` or runnable Worker code; example code appears only as fenced snippets in Markdown. The test projects under `evals/` are never installed.

**Project vs. global:** a project install puts the skill in the project's agent folder (for example `.agents/skills/`, which many agents share), so it can be committed and shared with your team. A global install (`-g`) puts it in your home directory for all your projects. Not every agent supports global installs: without `-a`, the CLI reports those agents as failed and still installs for the rest, so name your agents with `-a` to avoid a confusing result. The [skills CLI](https://github.com/vercel-labs/skills#supported-agents) lists every supported agent, its `-a` name and its folders.

**Without the CLI:** copy the skill folder (`skills/<name>/`) into your agent's skills directory, such as `.agents/skills/` in a project. Agents that take uploaded skills (for example Claude.ai) accept the folder as a zip.

## Use

Agents load a skill when your request matches its description, so you can just ask:

> Audit this repo for Cloudflare cost risks.

> Could anything here run up our Cloudflare bill on its own?

Many agents also let you call a skill by name (for example `/cloudflare-cost-guard`); check your agent's docs for the exact syntax.

## Cloudflare Cost Guard

On Workers Paid, the monthly subscription is a minimum, not a spending limit. A Durable Object alarm that reschedules itself, or a queue consumer that re-sends its own failures, keeps running and keeps billing with nobody using the app. Cost Guard looks for those paths in your code before your invoice does.

**What it audits:** Workers and Pages Functions, Durable Objects (alarms, SQLite and key-value storage), D1, KV, R2, Queues, Workflows, Cron Triggers, Workers AI, AI Gateway, Browser Run, Containers, Hyperdrive, Vectorize and Email Service, plus loops that call metered third-party APIs, public routes anyone can use to drive cost (including `workers.dev` and preview URLs), and admin routes behind a single shared secret.

**How it works:** the agent inventories your Wrangler configs and handlers, searches for known runaway patterns, traces each one from its entrypoint to the billable operations, checks whether real safeguards bound it, and explains how each affected service is billed.

**What you get:** a Markdown report that opens with a short "At a glance" block (overall risk, the worst finding priced at a documented rate, and a table of the top actions with what each fixes, where, and when to do it), then a service inventory, findings with severity, confidence, file and line references, what setting gates them, and a cost at a stated rate, a list of Cloudflare dashboard settings to check by hand, a prioritized action table, evidence gaps, and a JSON summary. Give it the JSON summary from a previous run and it also tells you what is new, fixed or re-rated since then.

**Example finding**

| Field | Detail |
| ----- | ------ |
| Severity | Critical |
| Confidence | High |
| Service | Durable Objects |
| Location | `src/room.ts:37` (`alarm()`), started from `src/room.ts:16` |
| Trigger | First request to any room; the room name comes from the query string |
| Scenario | `alarm()` always calls `setAlarm(Date.now() + 1000)`, with no idle check or tick limit, and reschedules immediately on error. Each room keeps running about 86,400 alarms a day after its users leave, each billed as a Durable Object request plus duration and SQLite writes. |
| Existing safeguards | None found |
| Recommendation | Reschedule only while durable state shows active members, enforce a minimum interval, keep a persisted tick and failure limit, and stop the alarm when idle. |

**Safety:** the skill is read-only. It does not edit your code, deploy, run your scripts or tests, call your endpoints, or need Cloudflare credentials. It does not write fixes. Any fix changes exactly the code that can generate cost, so review it carefully and test it in a non-production account before deploying.

**Limitations:** it is a static review. It cannot see your account settings, traffic or code outside the repository, and it can miss problems or flag bounded code. Pricing in the skill is a dated snapshot; the agent confirms current figures at developers.cloudflare.com when it has network access. A clean report does not mean your application cannot generate unexpected cost. Set budget alerts in Cloudflare, and remember they notify you but do not stop usage.

## Repository layout

```
.
├── skills/                 # One folder per skill; this is what gets installed
│   └── cloudflare-cost-guard/
│       ├── SKILL.md        # Frontmatter + audit procedure
│       ├── references/     # Billing, patterns and safeguards, loaded on demand
│       └── assets/         # Report template
├── evals/                  # Test cases and graders, never installed
│   └── cloudflare-cost-guard/
├── template/               # Starting point for a new skill
├── scripts/                # Validation used by CI
├── CONTRIBUTING.md
└── LICENSE
```

## Contributing

Please fork the skills if you wish to make changes, these are also used internally by us and we can't manage pull requests at this time.

## License

[MIT](LICENSE). Every skill in this repository is MIT-licensed.
