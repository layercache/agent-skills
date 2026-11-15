# Cloudflare Cost Guard evals

> **Do not deploy anything in this folder.** These are deliberate counterexamples. Several cases contain code that runs up a Cloudflare bill on purpose. Never deploy them, run them, or copy them into a real project.

Small Cloudflare projects with known answers, used to check that the [cloudflare-cost-guard](../../skills/cloudflare-cost-guard/) skill finds real runaway-cost paths and leaves bounded code alone.

These files live outside the skill folder on purpose. Installing the skill never copies them, so they cannot end up in a user's project and be reported as problems there.

The fixtures are static source code. Nothing here deploys or calls Cloudflare, and the projects are not meant to be deployed. Each Wrangler config is stored as `wrangler.jsonc.fixture`, so running `wrangler deploy` in a case folder finds no config and fails; `run.sh` restores the normal name only inside its temporary copy. There is no `package.json`, and all database IDs are zeros. Every fixture file also starts with a "do not deploy" notice; `run.sh` strips it from the copy the agent audits so it cannot hint at the answer, and the grader counts lines on the stripped text.

## Cases

| Case | Kind | What it contains | Expected |
| ---- | ---- | ---------------- | -------- |
| `v1-do-alarm-reschedule` | Risky | Durable Object alarm that reschedules itself every second, and immediately on error | Critical |
| `v2-queue-reenqueue` | Risky | Queue consumer that re-sends failed messages to its own queue | Critical |
| `v3-recursive-fetch` | Risky | Worker that paginates by fetching its own public route with fan-out | High |
| `v4-retry-no-max` | Risky | Retry loop with no maximum around a metered geocoding API | High |
| `v5-unbounded-d1-writes` | Risky | Every-minute cron that rewrites every row of a growing indexed D1 table | Critical |
| `v6-ai-agent-loop` | Risky | Workers AI agent loop with no iteration or token budget | High |
| `v7-background-fanout` | Risky | Every-5-minute cron doing KV, D1, AI, R2 and Queue work for every user | Critical |
| `v8-unauthenticated-write` | Risky | Every public request writes one D1 row and one KV key with no retention, bounded only by a per-IP limit, on `workers.dev` by default | Medium |
| `v9-admin-token-fanout` | Risky | One static admin token gates a route that wakes every Durable Object | Medium |
| `v10-queue-history-scan` | Risky | Per-account queue that caps waiting rows but scans its uncapped history on every request and alarm | High |
| `v11-cron-no-progress` | Risky | Cron embedding job that marks progress on the wrong column, a harvest that re-inserts the feed, and a KV list auth fallback | Medium; Medium or High; Medium or High |
| `v12-alarm-refresh-window` | Risky | Durable Object refresh alarm that re-arms at a stored time it never moves forward | Critical |
| `v13-cron-resync-unchanged` | Risky | Every-minute cron that rewrites a whole supplier catalogue into an indexed D1 table with an `ON CONFLICT DO UPDATE` upsert, changed or not | High |
| `v14-cron-poison-batch` | Risky | Embedding cron that pays Workers AI for a batch before marking it done, with no attempt limit per article | Medium |
| `v15-flag-off-key-scan` | Risky | `s6` with the KV list auth fallback behind a flag that the config turns off | Low, gated by the flag, Medium or High if enabled |
| `v16-flag-on-in-staging` | Risky | `v15` with the flag off at the top level and on in `env.staging`, which has its own public hostname | Medium or High |
| `v17-cron-queue-fanout` | Risky | Uptime monitor whose every-minute cron enqueues 600 probes: about $31 a month of queue operations, by design | Medium |
| `v18-workflow-self-restart` | Risky | Workflow that exports one page, then always creates a new instance of itself, including after the last page | Critical |
| `v19-browser-session-leak` | Risky | Every-5-minute cron that launches a browser per page with a 10-minute `keep_alive` and never closes it | High |
| `v20-queue-cycle` | Risky | Two queues whose consumers send to each other with no depth count | Critical |
| `v21-websocket-awake` | Risky | Public WebSocket rooms accepted with `accept()` plus a `setInterval` ping, so connected rooms never hibernate | High |
| `v22-agent-reschedule` | Risky | Agents SDK agent, named from the URL, whose scheduled callback reschedules itself every five seconds | Critical |
| `v23-r2-event-loop` | Risky | Consumer of a bucket's object-create notifications that writes a sidecar back into the same bucket; the rule is in a setup script | Critical |
| `v24-image-resize-open` | Risky | Public image route that passes width, height and blur from the query string into a transformation | High |
| `v25-magic-link-email` | Risky | Public sign-in route that emails any address the caller gives, limited only per IP | High |
| `v26-monorepo-order-history` | Risky | Two Workers, a Drizzle schema, a service binding and a test file; one route reads the whole orders table per request | High |
| `s1-bounded-alarm` | Bounded | Alarm with minimum interval, idle shutdown and persisted limits; D1 lookups by primary key | Nothing above Low |
| `s2-bounded-queue-consumer` | Bounded | Consumer with `max_retries`, dead letter queue, backoff and idempotency | Nothing above Low |
| `s3-bounded-d1-batch` | Bounded | Authenticated, rate-limited import capped at 500 rows | Nothing above Low |
| `s4-circuit-breaker-cron` | Bounded | Cron behind a D1-backed circuit breaker and kill switch | Nothing above Low |
| `s5-bounded-queue-history` | Bounded | `v10` with indexes that match each hot query and per-user history and device caps | Nothing above Low |
| `s6-cron-with-progress` | Bounded | `v11` with a unique `source_id`, an index on the pending query, progress marked by primary key, an attempt limit saved before each embedding call, and a direct legacy key lookup | Nothing above Low |
| `s7-bounded-alarm-refresh` | Bounded | `v12` refreshing only after new messages, with a 15-minute alarm floor, a per-user rate limit, a message cap and cleanup at expiry | Nothing above Low |
| `s8-cron-resync-changed-only` | Bounded | `v13` fetching only products changed since a saved (updated_at, sku) cursor, capped at 20 pages a run, with an upsert that skips unchanged rows | Nothing above Low |
| `s9-singleton-scheduler` | Bounded | One named Durable Object whose alarm reschedules every minute forever, with capped work per tick | Nothing above Low |
| `s10-route-self-fetch` | Bounded | Worker on a plain zone route that fetches its own URLs with fan-out; on a route those calls go to the origin and do not re-enter | Nothing above Low |
| `s11-cron-queue-fanout-slow` | Bounded | `v17` on a 30-minute schedule: over the queue allowance by well under a dollar a month | Nothing above Low |
| `s12-workflow-paged-export` | Bounded | `v18` as one instance that pages in a capped loop, once per account per day | Nothing above Low |
| `s13-browser-closed` | Bounded | `v19` every six hours with one browser, closed in `finally` | Nothing above Low |
| `s14-websocket-hibernation` | Bounded | `v21` behind a session check, with the Hibernation API and no timers | Nothing above Low |
| `s15-r2-event-prefix` | Bounded | `v23` with the rule limited to `uploads/` and the sidecar written under `meta/` | Nothing above Low |
| `s16-image-presets` | Bounded | `v24` with three fixed presets | Nothing above Low |
| `s17-bounded-retry` | Bounded | `v4` with three attempts, backoff, an API key and a per-key limit | Nothing above Low |
| `s18-public-write-retention` | Bounded | `v8` writing one row per visit to a known link, with 30-day retention and `workers.dev` off | Nothing above Low |
| `s19-admin-paged-stats` | Bounded | `v9` paged at 50 rooms per call and rate limited | Nothing above Low |
| `s20-agent-loop-budget` | Bounded | `v6` with four model calls at most, capped tokens, an API key and a per-key limit | Nothing above Low |

Each case folder holds the project plus `expected.json`, which names the expected finding (or the code that must not be flagged), the allowed severities, and an explanation of the execution path. Locations are given as a code snippet rather than a line number, so editing a fixture does not silently break the expectations.

## What CI checks

CI runs on every pull request and needs no credentials:

```bash
python3 evals/cloudflare-cost-guard/evaltool.py check      # cases are well-formed, snippets exist, every case is in the table above, fixtures don't hint at answers
python3 evals/cloudflare-cost-guard/evaltool.py self-test  # the grader passes perfect reports and fails empty, wrong, vague or padded ones
```

CI does not run an agent. Agent output varies between runs and needs a model API key, so the agent eval is a manual step.

## Running the agent eval

Run this before releasing a change to the skill. It costs model usage for one audit per case and run.

```bash
cd evals/cloudflare-cost-guard

# Claude Code (gives the agent read access to the skill folder)
AGENT_CMD="claude -p --add-dir $(cd ../../skills/cloudflare-cost-guard && pwd)" ./run.sh

# Codex, or any CLI that takes a prompt as its last argument and prints the answer
AGENT_CMD="codex exec" ./run.sh

# One case
AGENT_CMD="claude -p" ./run.sh v1-do-alarm-reschedule

# Before a release: three runs per case, four cases at a time
TRIALS=3 JOBS=4 AGENT_CMD="claude -p --add-dir $(cd ../../skills/cloudflare-cost-guard && pwd)" ./run.sh
```

`run.sh` copies each case to a temporary directory without `expected.json`, asks the agent to audit it with the skill, saves the report under `results/<timestamp>/`, and grades it. Agent output varies between runs, so one passing run says little: use `TRIALS=3` before a release. With more than one run, reports are saved under `run-<n>/` and a case counts as passed only when every run passes.

The skill is read-only, so `run.sh` checks the copy after each run. If the agent changed, added or deleted a file, committed or stashed, that run fails whatever the report says.

Each results folder gets a `scorecard.md`: one row per case with the expected rating, how many runs passed, the ratings reported and the first failure. Before a release, save it as `scorecards/<version>.md` so the next change has a baseline to compare with.

To grade reports you produced another way, save them as `<case>.md` in one folder and run:

```bash
python3 evaltool.py grade-all path/to/reports
python3 evaltool.py scorecard path/to/reports
```

## How a report is graded

A risky case passes when all of these hold:

- Every expected finding is reported within 8 lines of one of its locations, at an allowed severity, with the right `autonomous` flag, and with the expected `exposure` where the case names one. A finding must give a real line number: a location with no line does not count.
- Each reported finding counts only for the expected finding nearest to it, so one finding cannot stand in for another a few lines away.
- No other finding is rated Critical. A finding that matches nothing the case expects or allows fails the case when it is rated above `max_unexpected_severity` (High unless the case sets it). Lower-rated extras are counted in the scorecard as noise.

A bounded case passes when nothing is rated above Low, anywhere.

In every case, the summary must agree with the findings: `overall_risk` is the highest severity reported ("None" with no findings), and `autonomous_runaway_paths` is true exactly when a finding is autonomous and rated High or Critical.

## Adding a case

1. Create `cases/v<n>-<name>/` (risky) or `cases/s<n>-<name>/` (bounded) with source and a Wrangler config named `wrangler.jsonc.fixture` or `wrangler.toml.fixture` (never the real name, and no `package.json`). A monorepo case keeps one config in each Worker's folder. Fixture files can be `.ts`, `.sql`, `.sh` or `.fixture`. Start every file with the do-not-deploy notice; copy it from an existing case.
2. Write the code the way a real project would. Do not add comments that describe the bug or the safeguard; `evaltool.py check` rejects words like "vulnerable" or "eval" in fixtures.
3. Add `expected.json` following an existing case:
   - `expected_findings`: each needs `contains`, a snippet that occurs once in `file`, and may list `also`, other snippets on the same path (the handler, the scheduling call, the query the loop runs) that a correct report might cite instead. List only lines that belong to this problem, or a different finding could be credited for it. `exposure` is optional; set it only when one value is clearly right.
   - `may_flag`: a real, smaller problem in the fixture that a report may mention but does not have to, with the highest severity it may be given.
   - `must_not_flag`: code that must not be rated above `max_severity`. Bounded cases also need `max_overall_severity`.
4. Add the case to the table above; `evaltool.py check` fails if it is missing.
5. Run `python3 evaltool.py check` and `python3 evaltool.py self-test`.
