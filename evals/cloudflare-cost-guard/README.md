# Cloudflare Cost Guard evals

> **Do not deploy anything in this folder.** These are deliberate counterexamples. Several cases contain code that runs up a Cloudflare bill on purpose. Never deploy them, run them, or copy them into a real project.

Small Cloudflare projects with known answers, used to check that the [cloudflare-cost-guard](../../skills/cloudflare-cost-guard/) skill finds real runaway-cost paths and leaves bounded code alone.

These files live outside the skill folder on purpose. Installing the skill never copies them, so they cannot end up in a user's project and be reported as problems there.

The fixtures are static source code. Nothing here deploys or calls Cloudflare, and the projects are not meant to be deployed. Each Wrangler config is stored as `wrangler.jsonc.fixture`, so running `wrangler deploy` in a case folder finds no config and fails; `run.sh` restores the normal name only inside its temporary copy. There is no `package.json`, and all database IDs are zeros. Every fixture file also starts with a "do not deploy" notice; `run.sh` strips it from the copy the agent audits so it cannot hint at the answer, and the grader counts lines on the stripped text.

## Cases

| Case | Kind | What it contains | Expected |
| ---- | ---- | ---------------- | -------- |
| `v1-do-alarm-reschedule` | Risky | Durable Object alarm that reschedules itself every second, and immediately on error | Critical |
| `v2-queue-reenqueue` | Risky | Queue consumer that re-sends failed messages to its own queue | Critical or High |
| `v3-recursive-fetch` | Risky | Worker that paginates by fetching its own public route with fan-out | High or Critical |
| `v4-retry-no-max` | Risky | Retry loop with no maximum around a metered geocoding API | High or Medium |
| `v5-unbounded-d1-writes` | Risky | Every-minute cron that rewrites every row of a growing indexed D1 table | High or Critical |
| `v6-ai-agent-loop` | Risky | Workers AI agent loop with no iteration or token budget | High or Critical |
| `v7-background-fanout` | Risky | Every-5-minute cron doing KV, D1, AI, R2 and Queue work for every user | Medium to Critical |
| `v8-unauthenticated-write` | Risky | Every public request writes D1 and KV, bounded only by a per-IP limit, on `workers.dev` by default | High or Critical |
| `v9-admin-token-fanout` | Risky | One static admin token gates a route that wakes every Durable Object | Medium or High |
| `s1-bounded-alarm` | Bounded | Alarm with minimum interval, idle shutdown and persisted limits | Nothing above Low |
| `s2-bounded-queue-consumer` | Bounded | Consumer with `max_retries`, dead letter queue, backoff and idempotency | Nothing above Low |
| `s3-bounded-d1-batch` | Bounded | Authenticated, rate-limited import capped at 500 rows | Nothing above Low |
| `s4-circuit-breaker-cron` | Bounded | Cron behind a D1-backed circuit breaker and kill switch | Nothing above Low |

Each case folder holds the project plus `expected.json`, which names the expected finding (or the code that must not be flagged), the allowed severities, and an explanation of the execution path. Locations are given as a code snippet rather than a line number, so editing a fixture does not silently break the expectations.

## What CI checks

CI runs on every pull request and needs no credentials:

```bash
python3 evals/cloudflare-cost-guard/evaltool.py check      # cases are well-formed, snippets exist, fixtures don't hint at answers
python3 evals/cloudflare-cost-guard/evaltool.py self-test  # the grader passes perfect reports and fails empty or wrong ones
```

CI does not run an agent. Agent output varies between runs and needs a model API key, so the agent eval is a manual step.

## Running the agent eval

Run this before releasing a change to the skill. It costs model usage for 13 audits.

```bash
cd evals/cloudflare-cost-guard

# Claude Code (gives the agent read access to the skill folder)
AGENT_CMD="claude -p --add-dir $(cd ../../skills/cloudflare-cost-guard && pwd)" ./run.sh

# Codex, or any CLI that takes a prompt as its last argument and prints the answer
AGENT_CMD="codex exec" ./run.sh

# One case
AGENT_CMD="claude -p" ./run.sh v1-do-alarm-reschedule
```

`run.sh` copies each case to a temporary directory without `expected.json`, asks the agent to audit it with the skill, saves the report under `results/<timestamp>/`, and grades it. To grade reports you produced another way, save them as `<case>.md` in one folder and run:

```bash
python3 evaltool.py grade-all path/to/reports
```

A case passes when every expected finding is reported within 8 lines of its location at an allowed severity, and a bounded case has nothing above Low.

## Adding a case

1. Create `cases/v<n>-<name>/` (risky) or `cases/s<n>-<name>/` (bounded) with source and a Wrangler config named `wrangler.jsonc.fixture` (never `wrangler.jsonc`, and no `package.json`). Start every file with the do-not-deploy notice; copy it from an existing case.
2. Write the code the way a real project would. Do not add comments that describe the bug or the safeguard; `evaltool.py check` rejects words like "vulnerable" or "eval" in fixtures.
3. Add `expected.json` following an existing case.
4. Run `python3 evaltool.py check` and `python3 evaltool.py self-test`.
