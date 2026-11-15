---
name: cloudflare-cost-guard
description: Read-only audit of a Cloudflare codebase for runaway usage and surprise billing risk. Finds self-rescheduling Durable Object alarms, queue re-enqueue loops, recursive Worker fetches, unbounded retries, D1/KV/R2 write amplification, scheduled rewrites of unchanged data, hot queries over data that keeps growing, Durable Objects kept awake by WebSockets or timers, storage events that trigger themselves, Workers AI, Browser Run and email loops, unauthenticated cost amplification, and container lifecycle gaps, then reports evidence-backed findings with file and line references plus a dashboard checklist. Use when the user asks about Cloudflare costs, bills, overages, runaway Workers, Durable Object alarms, queue retries, or wants a cost, spend or billing-risk audit of a Workers, Pages, D1, R2, Queues or Workflows project. Never modifies code, deploys, or calls Cloudflare.
license: MIT
metadata:
  author: layercache
  version: "1.8.0"
---

# Cloudflare Cost Guard

Audit a codebase for execution paths that can generate uncontrolled billable usage on Cloudflare, especially on Workers Paid, where the monthly subscription is a minimum charge, not a spending limit, and the optional spending limits cover only Workers and Durable Objects. The audit works from source code alone and needs no Cloudflare credentials.

This skill reports. It does not fix.

## Ground rules (apply for the whole audit)

You are in read-only mode from the first step to the last. You must not:

- Edit, create or delete files in the audited repository (including formatting, lockfiles or "quick fixes").
- Run `wrangler` commands that deploy, publish, migrate, tail, or start dev servers; run project scripts, tests, builds, or package installs.
- Call production or preview endpoints, trigger cron/alarms/queues/workflows, or make any request that could incur Cloudflare or third-party charges.
- Open `.dev.vars`, `.env*`, or other secret files beyond noting that they exist. Never print secret values. Tracked example files that hold only placeholders (`.dev.vars.example`, `.env.example`, `.env.sample`) are not secret files, and you may read them.
- Run Git commands that use the network (`fetch`, `pull`, `clone`, `ls-remote`) or that change the checkout (`checkout`, `switch`, `stash`, `reset`).

You may read source, configuration, dependency manifests and installed dependency source, use search tools, and run local read-only Git commands (`status`, `log`, `show`, `blame`, `diff`, `branch --show-current`, `branch --list`). If network access is available, you may read public documentation at `developers.cloudflare.com` to confirm current pricing and limits; nothing else.

If dynamic testing would help, list it under "Recommended follow-up" in the report as something the user can choose to do later in a non-production account. Do not do it.

## Scope

**What you audit:** the working tree of the repository the user pointed you at, as currently checked out, including every Worker in a monorepo. Record the branch and commit (`git status`, `git log -1`) in the report. Other repositories in the workspace, other branches, open pull requests and remote state are out of scope unless the user names them. When code in scope calls something out of scope (a service binding to a Worker defined elsewhere, an `ops` repository that deploys crons), list it under evidence gaps.

**What counts as deployed code:** anything reachable from a Wrangler `main` entry, Pages Functions (`functions/**`, `_worker.js`), framework adapter output sources, and classes those configs bind. Audit that fully. For code that never deploys (`test/`, `__tests__/`, `*.test.*`, `docs/`, `examples/`, `fixtures/`, storybook), do not report findings, but do note it if a script there is run against production by CI or a cron outside Cloudflare.

**Skip entirely:**

- Build output: `.wrangler/`, `dist/`, `build/`, `.next/`, `.open-next/`, `.svelte-kit/`, `.output/`, `target/`, `coverage/`.
- Generated types such as `worker-configuration.d.ts`.
- Installed agent skills, including this one: `.claude/`, `.agents/`, `.codex/`, `.cursor/`, `.opencode/`, `.windsurf/`, and any folder whose root contains a `SKILL.md`.

**Dependencies** (`node_modules/`, `vendor/`): do not search them broadly. When a traced path depends on a library's behavior (an auth library's rate limiting, an ORM's batching, a queue helper's retries), read that library's installed source for that one question and cite the file and version from the lockfile. If it is not installed, record the version from the lockfile and mark the protection **unknown**; do not install anything.

State the scope, branch, commit and exclusions in the report.

## Procedure

Work through the phases in order. Keep notes of every file and line you rely on; every code-level finding must cite them.

### Phase A: Discover the infrastructure

1. Find every Wrangler config: `wrangler.toml`, `wrangler.json`, `wrangler.jsonc` (including per-environment blocks under `env`). An `env.<name>` block inherits `triggers`, `routes` and `workers_dev` from the top level, but not `vars` or bindings, which it has to repeat; record each environment's values, because a flag, a dead letter queue or a rate limiter can exist in one environment and not in another. Also check `functions/` and `_worker.js` for Pages Functions, and framework adapters (`@cloudflare/next-on-pages`, `@opennextjs/cloudflare`, `@astrojs/cloudflare`, SvelteKit/Remix/Nuxt Cloudflare adapters).
2. From each config, record bindings and triggers: `durable_objects`, `migrations` (`new_sqlite_classes` vs `new_classes`), `d1_databases`, `kv_namespaces`, `r2_buckets`, `queues.producers`/`queues.consumers` (with `max_retries`, `dead_letter_queue`, `max_batch_size`, `retry_delay`), `workflows`, `triggers.crons`, `ai`, `browser`, `containers`, `hyperdrive`, `services`, `vectorize`, `ratelimits`, `send_email`, `images`, `assets` (with `run_worker_first`), `tail_consumers`, `compatibility_flags`, `limits` (`cpu_ms`, `subrequests`), `observability`, and public exposure: `routes`, `workers_dev`, `preview_urls`. `workers_dev` defaults to `true` when a config has no `routes`; a `workers.dev` URL or preview URL is reachable outside your zone, so zone WAF and rate-limiting rules do not cover it.
3. Find the handlers each Worker exports: `fetch`, `scheduled`, `queue`, `email`, `tail`, Durable Object classes (`alarm`, `webSocketMessage`, `fetch`, RPC methods), Agents SDK classes (`onRequest`, `onConnect`, `onMessage`, scheduled callbacks), `WorkflowEntrypoint.run`, `WorkerEntrypoint` RPC methods, Container classes.
4. Check `package.json` (and `pyproject.toml`, `Cargo.toml` for Python and Rust Workers) for relevant SDKs: `agents`, `partyserver`, `@cloudflare/puppeteer`, `@cloudflare/playwright`, `@cloudflare/containers`, `@cloudflare/sandbox`, `openai`, `@anthropic-ai/sdk`, ORMs (`drizzle-orm`, `kysely`, `prisma`), third-party metered APIs.
5. Look for callers and triggers the Wrangler config does not show: web or mobile client code in the repository that calls the API on a timer, CI schedules (`.github/workflows/*.yml` with `schedule:`), and scripts or docs that create R2 event notifications, queues or other resources with Wrangler commands (`wrangler r2 bucket notification create`). Add them to the inventory as triggers (pattern P25, pattern P23).

Produce the **service inventory**: each service, where it is configured, which handlers use it, whether it runs on user requests, on a schedule, or by itself, and which public hostnames (custom domains, routes, `workers.dev`, preview URLs) reach each Worker. See [references/services.md](references/services.md) for what to look for per service.

Then build the **data growth inventory**: every SQL table (D1 and Durable Object SQLite, including tables created in code), KV key prefix, R2 key prefix and Durable Object key-value prefix the code writes. For each one, record what adds entries, what removes them, what caps the total, and which queries read it per request, per alarm, per cron run or per queue message. A cap counts only if it limits every entry in the table or prefix; a cap on some states (waiting, active, pending) leaves the rest uncapped. Fill in every row, even when the answer is "nothing"; Phase C uses this table.

If no Cloudflare services are found, say so, list what you searched, and stop.

### Phase B: Find candidate runaway paths

For each service in the inventory, search for the patterns in [references/runaway-patterns.md](references/runaway-patterns.md). Prioritize anything that runs without a user request (alarms, crons, queue consumers, workflows, self-calls, containers and browser sessions that stay alive), then public routes anyone can call that write data or call expensive services, then admin or internal routes guarded by a single shared secret.

For Durable Object alarms, always read [references/durable-object-alarms.md](references/durable-object-alarms.md); the retry and overwrite semantics decide most alarm findings.

A keyword hit is a lead, not a finding. Move to Phase C for each lead.

### Phase C: Trace the amplification

For each lead:

1. Trace from the entrypoint (handler) through every function it calls to each billable operation. Follow service bindings, RPC calls, queue sends, workflow creation and `fetch` calls into other Workers in the repo.
2. Write down the chain, for example: `scheduled` (every minute) → `syncAll()` → for each row in `users` (no LIMIT) → `env.AI.run()` + `env.BUCKET.put()`.
3. Estimate the multiplier qualitatively: fan-out per step × retries × depth × frequency. Note what it grows with (time, data size, number of users, failures).
4. Classify the trigger:
   - **Autonomous:** keeps running or repeating with no further outside input (alarms, crons, queue retries, re-enqueues, self-rescheduling workflows). A loop that one outside request starts but that then never ends on its own is autonomous. This is what the per-finding `autonomous` flag means.
   - **Externally drivable:** anyone on the internet can trigger it (no authentication, authentication that anyone can obtain such as free sign-up, or an identity header the Worker trusts without verifying), so an attacker or bot sets the volume. A request that causes a large but finite burst (for example a self-fetch chain cut off by the 16-call loop limit) is externally drivable with an amplification factor, not autonomous.
   - **Credential-gated:** needs a secret. Ask what one leaked or misused credential could cost: a single static admin token that unlocks a large fan-out is a finding even though outsiders cannot call it.
5. Decide whether the path is **bounded** per invocation (fixed counts, platform limits) and in total (data that stops growing, invocations that stop).
6. For every query the path runs per request, per alarm, per cron run or per queue message, name what bounds the rows it reads: a `LIMIT` the query can stop at, an index range that is itself capped, or a cap on the whole table from the data growth inventory. A cap on some row states does not bound the table: rows in other states (history, cancelled, delivered, expired) are still read unless an index on the filtered columns lets the query skip them. Judge index use from the schema. If the repository has no schema for the table at all (no migration, schema file or `CREATE TABLE` in code), do not file a finding on index use alone: list it under evidence gaps and recommend a query-plan check under "Recommended follow-up". If the schema is there but you cannot tell whether the query can use an index, keep the lead as a finding with Medium confidence and recommend the same check (load the repository's schema into a throwaway SQLite database outside the repository and run `EXPLAIN QUERY PLAN` on that query). Do not run it yourself. When nothing bounds the read, the query costs more on every call as the data grows (pattern P19).
7. For every repeating path (cron, alarm, queue consumer, workflow, self-rescheduling job), find the state that tells the next run what is left to do: a cursor, offset, "processed" flag or timestamp, expiry, refresh time or retry counter. Confirm the path writes that state where the next run reads it (same key, same column, same row identifier) after the work succeeds. A cursor, flag or deadline that is read but never moved forward, written to a different key or column, or matched on the wrong identifier is not a bound: every run repeats the same work. A scheduled time taken from stored state (`setAlarm(t)`, `delaySeconds`, `step.sleep`) can already be in the past, which means an immediate re-run. When progress is recorded only after a paid step (Workers AI, a metered API), also check for an attempt limit per item: without one, a single item that keeps failing makes every run pay for the same batch again (pattern P15).

8. For every repeating path that writes or pays for a call (cron, alarm, queue consumer, workflow, a client that polls a write route), work out its **steady volume**: what one run bills × runs per month from the schedule. Count every unit the run bills, not only writes: rows or objects written (× (1 + indexes covering the written columns)), rows read, Durable Object requests and duration, queue operations (about three per message), Workers AI Neurons from the model's rate and the tokens sent, browser time, container time, emails, Workflow steps, and calls to a metered API. Compare each with the included monthly allowance in [references/pricing-and-limits.md](references/pricing-and-limits.md) (use the Workers Paid allowance), and price what is over the allowance at the documented rate: that monthly figure decides the rating (see "Repeating paths at a fixed rate"). The allowance is shared by everything in the account, so when one path uses more than half of an allowance by itself, say so in the cost line even when the path is rated Low. Use the volume the repository shows: a batch cap (`LIMIT 50` per run) is a ceiling, not a rate, so when the job marks items done and pays for each one once, its steady volume is how fast new items arrive, not the cap × runs per month. Then check whether each run writes only what changed since the last run: a conditional upsert (`DO UPDATE ... WHERE` the values differ), a content hash or version compared before writing, a conditional fetch (`ETag`, `If-Modified-Since`) that skips unchanged sources, or an incremental cursor on the source's change time. A sync that rewrites the whole dataset on every run pays the full volume even when nothing changed (pattern P20). When the dataset size comes from data you cannot see (an upstream feed, a table's row count), state the size you assumed.

A loop over a fixed or small collection, a one-off migration script, or a path whose every step is capped is not a finding, unless a schedule repeats it often enough that its steady volume (step 8) costs more than a few dollars a month over the included allowance. Say why you dismissed notable leads in the report's "Reviewed and not flagged" section.

### Phase D: Verify the safeguards

For each remaining path, check the safeguards listed in [references/safeguards.md](references/safeguards.md). A safeguard counts only if all of these hold:

- It is in code on the traced path and runs before the billable operation it protects.
- It still holds when the handler throws, the Durable Object restarts or is evicted, two invocations run concurrently, or stored state is reset or missing.
- It is not only a comment, a TODO, a README promise, or a config value that the code never reads.

Record which safeguards exist and where (file:line), and which are missing.

Then check the **global safeguards** that no single path shows. When a missing one is already part of a finding above (for example no rate limit on the route that finding is about), add it to that finding's recommendation instead of filing it again. Otherwise file it as its own finding, usually Low, with exposure `n/a` and `autonomous` false (a missing safeguard is not itself a runaway path), but only when it would protect something that can actually grow: an unbounded or externally drivable path, or data that a scheduled job or hot query scans. Record every global safeguard, present or missing, in the report's "Global safeguards" section; when a missing one would only add defense in depth to paths that are already bounded, or would protect nothing (for example `workers.dev` on a Worker with no `fetch` handler), list it there and file no finding.

- A kill switch that every autonomous handler (alarm, cron, queue consumer, workflow) reads before doing billable work, and that stops rescheduling.
- Retention or cleanup for tables, KV prefixes, R2 prefixes and Durable Object storage that grow with traffic (sessions, verification tokens, request logs, rate-limit counters, events). Growth makes every scan and every scheduled job more expensive over time.
- Protection for public hostnames that bypass the zone (`workers.dev`, preview URLs), and rate limits keyed by user or API key on expensive public routes.

### Phase E: Assess billing exposure

1. For each affected service, explain how it is billed (requests, duration, rows, operations, neurons, browser hours, vCPU and memory time) using [references/services.md](references/services.md).
2. Use [references/pricing-and-limits.md](references/pricing-and-limits.md) for numbers. It is a dated snapshot: if you can reach `developers.cloudflare.com`, confirm the figures you quote and say which source and date you used. Express exposure as operation counts (requests per day, rows written per run). Give each finding a **cost at a stated rate**: the operation count per stated volume (per 1M outside requests, per day, per run) times the documented rate, with the rate's source and date, for example "per 1M junk requests: ~2M D1 rows written ≈ $2 at $1.00 per million (snapshot 2026-11-15)". State the volume you assumed. When there is no documented per-call rate (Neurons for a specific model, a third-party API), give the operation counts and the unit rate, and say the dollar figure cannot be computed from the docs. Never add these up into a total bill or predict an invoice. When a figure is unverified or undocumented (for example whether a no-op `UPDATE` counts as a row written), describe the mechanism and list it as an evidence gap.
3. Classify every protection as one of: **verified in code**, **platform-enforced** (documented Cloudflare limit), **account setting to verify manually**, or **unknown**.
4. Read [references/account-controls.md](references/account-controls.md) and build the dashboard checklist. Budget alerts and usage notifications only send email; they do not stop usage. Spending limits exist only for Workers and Durable Objects, apply only if the account owner has set them, and are a backstop, not a maximum bill. In each finding's recommendation, after the code fix, say whether one of them would stop the path once it takes effect, or that the cost is in a product no limit covers. Never lower a severity because a limit might be set.

### Severity and confidence

Severity says how large the bill can get and whether it keeps growing. It does not measure how broken the code is: a loop that wastes a small fixed amount forever is not Critical, and a sync that works as intended but costs hundreds of dollars a month can be High.

| Severity | Use when |
| -------- | -------- |
| Critical | A demonstrable path that keeps running without user activity and whose cost rate has no limit: it grows with data, time or object count, re-runs back-to-back, or adds a loop that never ends for every failure or new object. |
| High | Strong evidence of substantial amplification with inadequate bounds: one outside request causes fan-out or calls an expensive service, or a repeating path bills about $100 a month or more over its included allowance. |
| Medium | Plausible amplification with partial safeguards or important unknowns, or a repeating path that bills more than a few dollars a month over its included allowance. |
| Low | Limited exposure (including a repeating path that stays within its included allowance or passes it by a few dollars a month), a defensive improvement, or a monitoring gap. |

Confidence is **High** when you traced the full path in code, **Medium** when one link depends on runtime data or config you could not see, **Low** when the path is inferred.

Calibration rules (they decide the final rating; the starting severities in [references/runaway-patterns.md](references/runaway-patterns.md) are only starting points):

- **Critical needs a cost rate with no limit.** Only autonomous paths start at Critical, and only when one of these holds:
  - The cost of each run grows with data, time or object count and nothing stops the growth, even when each single run is capped by a platform limit (a full-table job over a table that keeps growing, a per-user job as users sign up).
  - The path re-runs back-to-back: an alarm set in the past or at `Date.now()`, a message re-sent with no delay, a loop that re-arms at a stored time it never moves forward. A back-to-back loop that stops only at a deadline days away is still Critical; a deadline bounds it only when it is minutes away.
  - Every failure or new object adds another loop that never ends (a re-enqueued message, a perpetual alarm in each object a caller names).
- **Repeating paths at a fixed rate** (the work per run is capped and does not grow) are rated by their steady volume (Phase C step 8): what the repeated work bills per month at the stated size, over the Workers Paid allowance for that service, at the documented rate. **Low** when it stays within the allowance or passes it by less than about $5 a month; **Medium** above that; **High** at about $100 a month or more, or when a dataset whose size cannot be seen is rewritten on a schedule of every few minutes or faster. Rate by the dollar figure, not by a multiple of the allowance: ten times the allowance is a few dollars for queue operations and several hundred for D1 rows written. When no rate is documented, fall back to the allowance: Medium above it, High above 10×. Say in the cost line that the cost recurs every month and name what would remove most of it. The same rule covers:
  - a perpetual alarm, timer or cron that ticks at a fixed interval on a fixed set of objects (a singleton scheduler, a few named shards) and does capped work each tick: it never stops, but its rate has a limit;
  - a path that never records its progress (Phase C step 7), so every run repeats the same capped batch;
  - a paid batch step that is paid for again when a later step fails, with no attempt limit per item (pattern P15);
  - a scheduled rewrite of unchanged data (pattern P20).

  A cap is a ceiling, not a rate. When a run handles only new items and records its progress, so each item is paid for once, the cost follows how fast new items arrive (an upstream feed, uploads, sign-ups): that is the product doing its work. Do not rate it as if every run were full. Give the ceiling (cap × runs per month, priced over the allowance) under "Reviewed and not flagged" or in a Low finding, and rate by the full ceiling only when the repository shows that every run is full: the same items come back (no progress, an item that keeps failing), or the input is a fixed list.

  For a metered third-party API with no visible rate, give the repeated calls per month. Count only the calls that the fault or the missing change detection repeats, not the calls the job needs to do its work: one poll per run that asks the source for changes is the job, not waste. About one repeated call per run on a schedule of 15 minutes or slower is Low; more than that is Medium unless the provider's published rate puts it higher.
- **Triggers that may not happen.** A path that stays dormant until a date or window that opens on its own (a refresh window, an expiry, a backlog threshold that ordinary use reaches) is rated by what happens once it opens. A path that starts only after a fault or an upstream change (an item that keeps failing, a source that omits rows, a tie at a cursor) is rated by what it costs once started, under the rules above. Either way, say in the scenario that it is dormant and what has to happen first.
- **Externally drivable** paths are rated by amplification: how many billable operations one outside request causes, and what each one costs. Almost every public API writes something, so a write alone is not High.
  - **High:** one request causes fan-out (many rows, many objects, many subrequests, a loop), or calls an expensive or reputational service (Workers AI or another LLM, Browser Run, a container, email or SMS to an address the caller chooses, a metered third-party API), and nothing caps total volume beyond a per-IP or per-location limit.
  - **Medium:** a small fixed number of cheap operations per request (a few D1 rows, a KV write) and the data persists or compounds (no retention, or a scheduled job scans it later).
  - **Low:** about one cheap operation per request with retention in place. This is the linear cost of being public: mention it under the global safeguards (budget alerts, `workers.dev`, zone rate limiting) instead of filing it as a finding.
  - Per-IP and per-location limits (including the Workers Rate Limiting binding keyed by IP) are partial bounds that a distributed client avoids; they do not lower the level. Authentication combined with a per-user cap lowers it by one.
  - Free self sign-up counts as "anyone", but rate the path by what one account unlocks, not by the fact that accounts can be created.
  - **Cost per request that grows with the caller's own data:** when a query on the path reads entries the caller can keep adding (their history, devices, items) and nothing bounds the rows it reads (Phase C step 6), rate it High, because total cost grows with the square of that caller's activity. Authentication and a per-user rate limit do not lower it: they slow how fast the data grows, not what each request reads. Retention limits it only to retention period × allowed rate; state that ceiling in the cost line. When a cap on the whole table or a `LIMIT` bounds the read, rate the path by the rules above for a fixed number of operations.
- **Credential-gated** paths are rated by the worst case if the credential leaks: Medium when one static secret unlocks a fan-out or bulk operation with no per-call cap (one call wakes every object or processes every row); Low when each call is capped at a fixed size or the damage is small, even when the only rate limit is per location and there is no total quota. Give the worst month for one leaked credential in the cost line.
- **One root cause, one finding.** When several problems belong to one loop or path (the loop, its error path, who can start it, what it writes), report one finding and list the contributing problems in its scenario. Separate findings are for paths that could be fixed independently.
- **Confidence** is about whether the path exists as described. If the path is fully traced but its size depends on data you cannot see (table sizes, indexes, traffic), keep confidence High and say what the size depends on.
- **Config-gated paths are rated as deployed.** When a path only exists behind a feature flag, environment variable or secret, rate it at the setting the repository config shows (for example a flag that is off in `wrangler.jsonc` usually makes the finding Low; keep it as a finding so the gated risk stays visible). Fill the finding's "Gated by" row with the setting, its value in the repository, and the severity if it flips, and say in the scenario what changes when it does. If the setting cannot be seen (a secret, a dashboard variable), rate as if it is on and set confidence to Medium; if the repository sets a value that a dashboard variable could override, rate at the repository value and note the override under evidence gaps. "Gated by" is for settings that switch a path on or off; an authentication credential is not a gate and belongs under Exposure (credential-gated). Overall risk uses the as-deployed severity. When the config has `env` blocks, a path that is on in any environment is live, because every environment bills the same account: rate it where it is on, name that environment in the scenario, and list the environments where it is off.
- Never rate a finding Critical with Low confidence. Rate it High at most and list the gap under "Unverified risks".
- A platform limit that caps one invocation (subrequests, the 16-call Worker loop limit, D1 queries per invocation, CPU time) bounds that invocation, not the number of invocations. It lowers severity only when nothing re-triggers the path.
- Present hypothetical concerns as risks, not confirmed vulnerabilities.

### Report

Fill in [assets/report-template.md](assets/report-template.md). Start with its "At a glance" block (overall risk, autonomous paths, the cost of the worst finding at a stated rate, and a table of the top three actions) so the answer is readable before the detail.

**Actions.** "Prioritized remediation" is one table of every action, most urgent first; its first three rows are the "At a glance" table, so the two never disagree. Each row names the action, the findings it fixes ("Global" when no finding covers it, such as a global safeguard listed without a finding or a dashboard check), where it belongs, and **When**:

- "Before enabling X": any finding whose path is off as deployed and becomes risky only when setting X flips. This wins over the rules below.
- "Now": a Critical or High finding that is live as deployed (every autonomous runaway path is one).
- "Before launch": a Medium finding that is live as deployed, or a protection that matters once real traffic or users arrive (budget alerts, closing `workers.dev`). Assume the code is deployed unless the repository says otherwise.
- "Later": Low findings, tidy-up and defense in depth.

With no findings, the table may hold "Global" actions, or a single row saying no action is needed. Severity says how bad a path is; When says how soon to act, and the two can differ (a path that would be High but sits behind a flag that is off is rated Low as deployed, with its action under "Before enabling X").

**Changes since the last run.** Only when the user provides a previous report (its JSON summary is enough), add the "Changes since" line to "At a glance" and the `changes_since` object to the JSON: new findings, fixed findings, re-rated findings (old → new severity, with the reason), and how many are unchanged (`unchanged` in the JSON). Match findings by file and title, not by CG number, since numbers shift between runs. If no previous report is given, leave both out; do not search for one. Drop sections that would be empty, except "At a glance", "Findings" (write "None" when there are none), "Before you change anything" and the machine-readable summary.

Show the report in the conversation. If the full report is long (more than about 150 lines) and you can write files, you may instead save it to a file **outside** the audited repository (for example in the system temporary directory) and say where; the conversation must still show "At a glance", a one-line list of findings, "Before you change anything" and the machine-readable summary. If writing the file fails, show the full report in the conversation instead. Never write into the audited repository unless the user names that location.

Every finding needs: severity, confidence, service(s), location(s) (file:line), trigger and exposure (autonomous, externally drivable, credential-gated, or n/a for a missing global safeguard; in the JSON these are `autonomous`, `external`, `credential` and `n/a`), what it is gated by (or "none"), scenario, existing safeguards, cost at a stated rate, and a recommendation. Recommendations name the missing safeguard and where it belongs (for example "cap retries at a fixed count and send exhausted messages to a dead letter queue in `src/consumer.ts:42`"). Do not write replacement code.

If no material problems are found, say so and list what was reviewed, without claiming the application is safe.

Keep the template's "Before you change anything" section word for word, and finish with the machine-readable summary (the JSON block from the template) so results can be compared between runs. In it, `autonomous_runaway_paths` is true only when at least one finding is autonomous and rated High or Critical, matching "At a glance". Name services with the names in the template's comment so runs compare cleanly.

### Before you deliver

Check the draft against the code once more, looking for wrong line numbers and guards you missed.

1. Re-open every location you cite. Confirm that the line shows the code the finding describes, and correct the number if it does not. Every finding in the JSON needs a real line number, never 0.
2. For each Critical or High finding, try to disprove it: follow the path once more looking for a guard you missed (a cap or `LIMIT`, a stop condition that the handler does move, an index, authentication with a per-user limit, a wrapper or middleware every caller goes through, a routing setup that stops a self-call from coming back). If you find one, re-rate the finding and say what bounds it.
3. For each line under "Reviewed and not flagged", check that it names the bound. "It looks bounded" is not a bound: if you cannot name one, it is a finding or an evidence gap.
4. Redo the arithmetic in each cost line: units per run × runs per month, millions against billions, and the allowance subtracted before the rate is applied.
5. Check that the summary matches the findings: overall risk is the highest severity reported ("None" with no findings), and `autonomous_runaway_paths` is true exactly when a finding is autonomous and rated High or Critical.

## After the audit

The audit is complete when the report is delivered. Do not offer to apply fixes as part of this skill.

If the user then asks you to implement fixes, that is separate work outside this audit. Before you start, tell them that fixes touch exactly the code paths that can generate cost, so every change needs careful human review and testing in a non-production account before deploy. After making changes, re-run this audit on the changed paths and point out anything that still needs review.

## Edge cases

- **Large monorepos:** audit autonomous entrypoints (alarms, crons, queue consumers, workflows) in every Worker first, then request handlers. If you cannot cover everything, say what you skipped.
- **Missing config:** if bindings are created in code or infrastructure-as-code (Terraform, Pulumi), audit those files the same way and note the uncertainty.
- **Pages Functions:** treat `functions/**` handlers and `_worker.js` like Worker `fetch` handlers.
- **Plan:** audit as if the account is on Workers Paid. The Free plan stops with errors at its daily limits instead of billing, so Paid is where these paths cost money. Do not ask which plan the account is on.
- **Third-party APIs:** flag loops that call metered external APIs (LLM providers, maps, email, SMS) even though Cloudflare does not bill them.
- **Generated or minified code:** do not audit it line by line; audit its source if present.
