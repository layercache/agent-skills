---
name: cloudflare-cost-guard
description: Read-only audit of a Cloudflare codebase for runaway usage and surprise billing risk. Finds self-rescheduling Durable Object alarms, queue re-enqueue loops, recursive Worker fetches, unbounded retries, D1/KV/R2 write amplification, Workers AI and Browser Run loops, and container lifecycle gaps, then reports evidence-backed findings with file and line references plus a dashboard checklist. Use when the user asks about Cloudflare costs, bills, overages, runaway Workers, Durable Object alarms, queue retries, or wants a cost, spend or billing-risk audit of a Workers, Pages, D1, R2, Queues or Workflows project. Never modifies code, deploys, or calls Cloudflare.
license: MIT
metadata:
  author: layercache
  version: "1.0.0"
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

You may read source, configuration, dependency manifests and local Git metadata (`git log`, `git blame`) and use search tools. If network access is available, you may read public documentation at `developers.cloudflare.com` to confirm current pricing and limits; nothing else.

If dynamic testing would help, list it under "Recommended follow-up" in the report as something the user can choose to do later in a non-production account. Do not do it.

## Scope

Search the whole repository, including every Worker in a monorepo. Skip:

- Dependencies and build output: `node_modules/`, `.wrangler/`, `dist/`, `build/`, `.next/`, `.open-next/`, `.svelte-kit/`, `.output/`, `vendor/`, `target/`, `coverage/`.
- Generated types such as `worker-configuration.d.ts`.
- Installed agent skills, including this one: `.claude/`, `.agents/`, `.codex/`, `.cursor/`, `.opencode/`, `.windsurf/`, and any folder whose root contains a `SKILL.md`.

State the exclusions you applied in the report.

## Procedure

Work through the phases in order. Keep notes of every file and line you rely on; every code-level finding must cite them.

### Phase A: Discover the infrastructure

1. Find every Wrangler config: `wrangler.toml`, `wrangler.json`, `wrangler.jsonc` (including per-environment blocks under `env`). Also check `functions/` and `_worker.js` for Pages Functions, and framework adapters (`@cloudflare/next-on-pages`, `@opennextjs/cloudflare`, `@astrojs/cloudflare`, SvelteKit/Remix/Nuxt Cloudflare adapters).
2. From each config, record bindings and triggers: `durable_objects`, `migrations` (`new_sqlite_classes` vs `new_classes`), `d1_databases`, `kv_namespaces`, `r2_buckets`, `queues.producers`/`queues.consumers` (with `max_retries`, `dead_letter_queue`, `max_batch_size`, `retry_delay`), `workflows`, `triggers.crons`, `ai`, `browser`, `containers`, `hyperdrive`, `services`, `vectorize`, `ratelimits`, `limits` (`cpu_ms`, `subrequests`), `observability`.
3. Find the handlers each Worker exports: `fetch`, `scheduled`, `queue`, `email`, `tail`, Durable Object classes (`alarm`, `webSocketMessage`, `fetch`, RPC methods), `WorkflowEntrypoint.run`, `WorkerEntrypoint` RPC methods, Container classes.
4. Check `package.json` (and `pyproject.toml`, `Cargo.toml` for Python and Rust Workers) for relevant SDKs: `agents`, `@cloudflare/puppeteer`, `@cloudflare/playwright`, `@cloudflare/containers`, `openai`, `@anthropic-ai/sdk`, ORMs (`drizzle-orm`, `kysely`, `prisma`), third-party metered APIs.

Produce the **service inventory**: each service, where it is configured, which handlers use it, and whether it runs on user requests, on a schedule, or by itself. See [references/services.md](references/services.md) for what to look for per service.

If no Cloudflare services are found, say so, list what you searched, and stop.

### Phase B: Find candidate runaway paths

For each service in the inventory, search for the patterns in [references/runaway-patterns.md](references/runaway-patterns.md). Prioritize anything that runs without a user request: alarms, crons, queue consumers, workflows, self-calls, containers and browser sessions that stay alive.

For Durable Object alarms, always read [references/durable-object-alarms.md](references/durable-object-alarms.md); the retry and overwrite semantics decide most alarm findings.

A keyword hit is a lead, not a finding. Move to Phase C for each lead.

### Phase C: Trace the amplification

For each lead:

1. Trace from the entrypoint (handler) through every function it calls to each billable operation. Follow service bindings, RPC calls, queue sends, workflow creation and `fetch` calls into other Workers in the repo.
2. Write down the chain, for example: `scheduled` (every minute) → `syncAll()` → for each row in `users` (no LIMIT) → `env.AI.run()` + `env.BUCKET.put()`.
3. Estimate the multiplier qualitatively: fan-out per step × retries × depth × frequency. Note what it grows with (time, data size, number of users, failures).
4. Decide whether the path can **continue without user activity** (self-rescheduling, re-enqueueing, crons, retries) and whether it is **bounded** (fixed counts, platform limits, data that stops growing).

A loop over a fixed or small collection, a one-off migration script, or a path whose every step is capped is not a finding. Say why you dismissed notable leads in the report's "Reviewed and not flagged" section.

### Phase D: Verify the safeguards

For each remaining path, check the safeguards listed in [references/safeguards.md](references/safeguards.md). A safeguard counts only if all of these hold:

- It is in code on the traced path and runs before the billable operation it protects.
- It still holds when the handler throws, the Durable Object restarts or is evicted, two invocations run concurrently, or stored state is reset or missing.
- It is not only a comment, a TODO, a README promise, or a config value that the code never reads.

Record which safeguards exist and where (file:line), and which are missing.

### Phase E: Assess billing exposure

1. For each affected service, explain how it is billed (requests, duration, rows, operations, neurons, browser hours, vCPU and memory time) using [references/services.md](references/services.md).
2. Use [references/pricing-and-limits.md](references/pricing-and-limits.md) for numbers. It is a dated snapshot: if you can reach `developers.cloudflare.com`, confirm the figures you quote and say which source and date you used. Never invent a monetary estimate; when a figure is unverified, describe the mechanism instead.
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

- Never rate a finding Critical with Low confidence. Rate it High at most and list the gap under "Unverified risks".
- A platform limit that caps one invocation (subrequests, the 16-call Worker loop limit, D1 queries per invocation, CPU time) bounds that invocation, not the number of invocations. It lowers severity only when nothing re-triggers the path.
- Present hypothetical concerns as risks, not confirmed vulnerabilities.

### Report

Fill in [assets/report-template.md](assets/report-template.md). Show the report in the conversation. Write it to a file only if the user gives a path; never write it into the audited repository unless the user names that location.

Every finding needs: severity, confidence, service, location (file:line), trigger, scenario, existing safeguards, and a recommendation. Recommendations name the missing safeguard and where it belongs (for example "cap retries at a fixed count and send exhausted messages to a dead letter queue in `src/consumer.ts:42`"). Do not write replacement code.

If no material problems are found, say so and list what was reviewed, without claiming the application is safe.

Keep the template's "Before you change anything" section word for word, and finish with the machine-readable summary (a JSON block listing each finding's severity, confidence, service, file and line) so results can be compared between runs.

## After the audit

The audit is complete when the report is delivered. Do not offer to apply fixes as part of this skill.

If the user then asks you to implement fixes, that is separate work outside this audit. Before you start, tell them that fixes touch exactly the code paths that can generate cost, so every change needs careful human review and testing in a non-production account before deploy. After making changes, re-run this audit on the changed paths and point out anything that still needs review.

## Edge cases

- **Large monorepos:** audit autonomous entrypoints (alarms, crons, queue consumers, workflows) in every Worker first, then request handlers. If you cannot cover everything, say what you skipped.
- **Missing config:** if bindings are created in code or infrastructure-as-code (Terraform, Pulumi), audit those files the same way and note the uncertainty.
- **Pages Functions:** treat `functions/**` handlers and `_worker.js` like Worker `fetch` handlers.
- **Free plan:** several products return errors instead of billing when a free daily limit is reached. Note the plan as unknown unless the code or docs in the repo state it, and cover both cases.
- **Third-party APIs:** flag loops that call metered external APIs (LLM providers, maps, email, SMS) even though Cloudflare does not bill them.
- **Generated or minified code:** do not audit it line by line; audit its source if present.
