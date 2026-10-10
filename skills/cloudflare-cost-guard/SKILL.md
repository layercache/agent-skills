---
name: cloudflare-cost-guard
description: Read-only audit of a Cloudflare codebase for runaway usage and surprise billing risk. Finds self-rescheduling Durable Object alarms, queue re-enqueue loops, recursive Worker fetches, unbounded retries, D1/KV/R2 write amplification, Workers AI, Browser Run and email loops, unauthenticated cost amplification, and container lifecycle gaps, then reports evidence-backed findings with file and line references plus a dashboard checklist. Use when the user asks about Cloudflare costs, bills, overages, runaway Workers, Durable Object alarms, queue retries, or wants a cost, spend or billing-risk audit of a Workers, Pages, D1, R2, Queues or Workflows project. Never modifies code, deploys, or calls Cloudflare.
license: MIT
metadata:
  author: layercache
  version: "1.2.0"
---

# Cloudflare Cost Guard

Audit a codebase for execution paths that can generate uncontrolled billable usage on Cloudflare, especially on Workers Paid, where the monthly subscription is a minimum charge, not a spending limit. The audit works from source code alone and needs no Cloudflare credentials.

This skill reports. It does not fix.

## Ground rules (apply for the whole audit)

You are in read-only mode from the first step to the last. You must not:

- Edit, create or delete files in the audited repository (including formatting, lockfiles or "quick fixes").
- Run `wrangler` commands that deploy, publish, migrate, tail, or start dev servers; run project scripts, tests, builds, or package installs.
- Call production or preview endpoints, trigger cron/alarms/queues/workflows, or make any request that could incur Cloudflare or third-party charges.
- Open `.dev.vars`, `.env*`, or other secret files beyond noting that they exist. Never print secret values.
- Run Git commands that use the network (`fetch`, `pull`, `clone`, `ls-remote`) or that change the checkout (`checkout`, `switch`, `stash`, `reset`).

You may read source, configuration, dependency manifests and installed dependency source, use search tools, and run local read-only Git commands (`status`, `log`, `show`, `blame`, `diff`, `branch`). If network access is available, you may read public documentation at `developers.cloudflare.com` to confirm current pricing and limits; nothing else.

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

1. Find every Wrangler config: `wrangler.toml`, `wrangler.json`, `wrangler.jsonc` (including per-environment blocks under `env`). Also check `functions/` and `_worker.js` for Pages Functions, and framework adapters (`@cloudflare/next-on-pages`, `@opennextjs/cloudflare`, `@astrojs/cloudflare`, SvelteKit/Remix/Nuxt Cloudflare adapters).
2. From each config, record bindings and triggers: `durable_objects`, `migrations` (`new_sqlite_classes` vs `new_classes`), `d1_databases`, `kv_namespaces`, `r2_buckets`, `queues.producers`/`queues.consumers` (with `max_retries`, `dead_letter_queue`, `max_batch_size`, `retry_delay`), `workflows`, `triggers.crons`, `ai`, `browser`, `containers`, `hyperdrive`, `services`, `vectorize`, `ratelimits`, `send_email`, `limits` (`cpu_ms`, `subrequests`), `observability`, and public exposure: `routes`, `workers_dev`, `preview_urls`. `workers_dev` defaults to `true` when a config has no `routes`; a `workers.dev` URL or preview URL is reachable outside your zone, so zone WAF and rate-limiting rules do not cover it.
3. Find the handlers each Worker exports: `fetch`, `scheduled`, `queue`, `email`, `tail`, Durable Object classes (`alarm`, `webSocketMessage`, `fetch`, RPC methods), `WorkflowEntrypoint.run`, `WorkerEntrypoint` RPC methods, Container classes.
4. Check `package.json` (and `pyproject.toml`, `Cargo.toml` for Python and Rust Workers) for relevant SDKs: `agents`, `@cloudflare/puppeteer`, `@cloudflare/playwright`, `@cloudflare/containers`, `openai`, `@anthropic-ai/sdk`, ORMs (`drizzle-orm`, `kysely`, `prisma`), third-party metered APIs.

Produce the **service inventory**: each service, where it is configured, which handlers use it, whether it runs on user requests, on a schedule, or by itself, and which public hostnames (custom domains, routes, `workers.dev`, preview URLs) reach each Worker. See [references/services.md](references/services.md) for what to look for per service.

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

A loop over a fixed or small collection, a one-off migration script, or a path whose every step is capped is not a finding. Say why you dismissed notable leads in the report's "Reviewed and not flagged" section.

### Phase D: Verify the safeguards

For each remaining path, check the safeguards listed in [references/safeguards.md](references/safeguards.md). A safeguard counts only if all of these hold:

- It is in code on the traced path and runs before the billable operation it protects.
- It still holds when the handler throws, the Durable Object restarts or is evicted, two invocations run concurrently, or stored state is reset or missing.
- It is not only a comment, a TODO, a README promise, or a config value that the code never reads.

Record which safeguards exist and where (file:line), and which are missing.

Then check the **global safeguards** that no single path shows. When a missing one is already part of a finding above (for example no rate limit on the route that finding is about), add it to that finding's recommendation instead of filing it again. Otherwise report it as its own finding, usually Low, with exposure `n/a` and `autonomous` false (a missing safeguard is not itself a runaway path). Record every global safeguard, present or missing, in the report's "Global safeguards" section; when one would protect nothing (for example `workers.dev` on a Worker with no `fetch` handler), list it there and file no finding.

- A kill switch that every autonomous handler (alarm, cron, queue consumer, workflow) reads before doing billable work, and that stops rescheduling.
- Retention or cleanup for tables, KV prefixes, R2 prefixes and Durable Object storage that grow with traffic (sessions, verification tokens, request logs, rate-limit counters, events). Growth makes every scan and every scheduled job more expensive over time.
- Protection for public hostnames that bypass the zone (`workers.dev`, preview URLs), and rate limits keyed by user or API key on expensive public routes.

### Phase E: Assess billing exposure

1. For each affected service, explain how it is billed (requests, duration, rows, operations, neurons, browser hours, vCPU and memory time) using [references/services.md](references/services.md).
2. Use [references/pricing-and-limits.md](references/pricing-and-limits.md) for numbers. It is a dated snapshot: if you can reach `developers.cloudflare.com`, confirm the figures you quote and say which source and date you used. Express exposure as operation counts (requests per day, rows written per run). Give each finding a **cost at a stated rate**: the operation count per stated volume (per 1M outside requests, per day, per run) times the documented rate, with the rate's source and date, for example "per 1M junk requests: ~2M D1 rows written ≈ $2 at $1.00 per million (snapshot 2026-10-10)". State the volume you assumed. When there is no documented per-call rate (Neurons for a specific model, a third-party API), give the operation counts and the unit rate, and say the dollar figure cannot be computed from the docs. Never add these up into a total bill or predict an invoice. When a figure is unverified or undocumented (for example whether a no-op `UPDATE` counts as a row written), describe the mechanism and list it as an evidence gap.
3. Classify every protection as one of: **verified in code**, **platform-enforced** (documented Cloudflare limit), **account setting to verify manually**, or **unknown**.
4. Read [references/account-controls.md](references/account-controls.md) and build the dashboard checklist. Budget alerts and usage notifications only send email; they do not stop usage. Workers Paid has no hard spending cap.

### Severity and confidence

| Severity | Use when |
| -------- | -------- |
| Critical | A demonstrable, effectively unbounded billable path that can keep running without user activity. |
| High | Strong evidence of substantial amplification with inadequate bounds. |
| Medium | Plausible amplification with partial safeguards or important unknowns. |
| Low | Limited exposure, a defensive improvement, or a monitoring gap. |

Confidence is **High** when you traced the full path in code, **Medium** when one link depends on runtime data or config you could not see, **Low** when the path is inferred.

Calibration rules:

- **Autonomous and unbounded** paths are the only ones that start at Critical. A scheduled or self-repeating path whose cost per run grows with data or time, with nothing that stops the growth, counts as unbounded even when each single run is capped by a platform limit.
- **Externally drivable** paths are rated by amplification: how many billable operations one outside request causes, and what each one costs. Almost every public API writes something, so a write alone is not High.
  - **High:** one request causes fan-out (many rows, many objects, many subrequests, a loop), or calls an expensive or reputational service (Workers AI or another LLM, Browser Run, a container, email or SMS to an address the caller chooses, a metered third-party API), and nothing caps total volume beyond a per-IP or per-location limit.
  - **Medium:** a small fixed number of cheap operations per request (a few D1 rows, a KV write) and the data persists or compounds (no retention, or a scheduled job scans it later).
  - **Low:** about one cheap operation per request with retention in place. This is the linear cost of being public: mention it under the global safeguards (budget alerts, `workers.dev`, zone rate limiting) instead of filing it as a finding.
  - Per-IP and per-location limits (including the Workers Rate Limiting binding keyed by IP) are partial bounds that a distributed client avoids; they do not lower the level. Authentication combined with a per-user cap lowers it by one.
  - Free self sign-up counts as "anyone", but rate the path by what one account unlocks, not by the fact that accounts can be created.
- **Credential-gated** paths are rated by the worst case if the credential leaks: Medium when one static secret unlocks a large fan-out or bulk operation with no per-call cap, Low when each call is capped or the damage is small.
- **One root cause, one finding.** When several problems belong to one loop or path (the loop, its error path, who can start it, what it writes), report one finding and list the contributing problems in its scenario. Separate findings are for paths that could be fixed independently.
- **Confidence** is about whether the path exists as described. If the path is fully traced but its size depends on data you cannot see (table sizes, indexes, traffic), keep confidence High and say what the size depends on.
- Never rate a finding Critical with Low confidence. Rate it High at most and list the gap under "Unverified risks".
- A platform limit that caps one invocation (subrequests, the 16-call Worker loop limit, D1 queries per invocation, CPU time) bounds that invocation, not the number of invocations. It lowers severity only when nothing re-triggers the path.
- Present hypothetical concerns as risks, not confirmed vulnerabilities.

### Report

Fill in [assets/report-template.md](assets/report-template.md). Start with its "At a glance" block (at most five lines: overall risk, the top actions, and the cost of the worst finding at a stated rate) so the answer is readable before the detail. Drop sections that would be empty, except "At a glance", "Findings" (write "None" when there are none), "Before you change anything" and the machine-readable summary.

Show the report in the conversation. If the full report is long (more than about 150 lines) and you can write files, you may instead save it to a file **outside** the audited repository (for example in the system temporary directory) and say where; the conversation must still show "At a glance", a one-line list of findings, "Before you change anything" and the machine-readable summary. Never write into the audited repository unless the user names that location.

Every finding needs: severity, confidence, service(s), location(s) (file:line), trigger and exposure (autonomous, externally drivable, credential-gated, or n/a for a missing global safeguard), scenario, existing safeguards, cost at a stated rate, and a recommendation. Recommendations name the missing safeguard and where it belongs (for example "cap retries at a fixed count and send exhausted messages to a dead letter queue in `src/consumer.ts:42`"). Do not write replacement code.

If no material problems are found, say so and list what was reviewed, without claiming the application is safe.

Keep the template's "Before you change anything" section word for word, and finish with the machine-readable summary (the JSON block from the template) so results can be compared between runs. In it, `autonomous_runaway_paths` is true only when at least one finding is autonomous and rated High or Critical, matching "At a glance". Name services with the names in the template's comment so runs compare cleanly.

## After the audit

The audit is complete when the report is delivered. Do not offer to apply fixes as part of this skill.

If the user then asks you to implement fixes, that is separate work outside this audit. Before you start, tell them that fixes touch exactly the code paths that can generate cost, so every change needs careful human review and testing in a non-production account before deploy. After making changes, re-run this audit on the changed paths and point out anything that still needs review.

## Edge cases

- **Large monorepos:** audit autonomous entrypoints (alarms, crons, queue consumers, workflows) in every Worker first, then request handlers. If you cannot cover everything, say what you skipped.
- **Missing config:** if bindings are created in code or infrastructure-as-code (Terraform, Pulumi), audit those files the same way and note the uncertainty.
- **Pages Functions:** treat `functions/**` handlers and `_worker.js` like Worker `fetch` handlers.
- **Free plan:** several products return errors instead of billing when a free daily limit is reached. Note the plan as unknown unless the code or docs in the repo state it, and use the report's "Plan assumptions" section to say how findings differ on Free and Paid.
- **Third-party APIs:** flag loops that call metered external APIs (LLM providers, maps, email, SMS) even though Cloudflare does not bill them.
- **Generated or minified code:** do not audit it line by line; audit its source if present.
