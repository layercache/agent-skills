# Runaway patterns

A catalogue of code shapes that generate uncontrolled billable usage. Each entry gives search leads, what makes it real, the usual false positives, and a starting severity. Search leads are regular expressions for a code search tool; adapt them to the language in use.

A search hit is only a lead. Confirm every pattern by tracing the path (SKILL.md, Phase C) and checking safeguards ([safeguards.md](safeguards.md)).

## Contents

- P1 Self-rescheduling alarm
- P2 Alarm set on every wake-up or request
- P3 Queue re-enqueue loop
- P4 Producer/consumer cycle
- P5 Recursive Worker fetch or service binding call
- P6 Unbounded retry loop
- P7 Schedule-driven work proportional to total data
- P8 Unbounded fan-out per request
- P9 Database operations in loops (N+1) and full-table writes
- P10 Write on every request
- P11 Workflow re-creation and unlimited step retries
- P12 AI or agent loop without a budget
- P13 Browser session or container left running
- P14 Attacker-controlled object or instance count
- P15 Failure path that does more billable work
- P16 Public hostname that bypasses zone protections
- P17 Data that grows without cleanup
- P18 One credential unlocks a large fan-out

---

## P1 Self-rescheduling alarm

- **Leads:** `setAlarm\(`, `async alarm\(`, `Date\.now\(\)\s*\)`, `Date\.now\(\)\s*\+\s*\d{1,4}\b`
- **Real when:** `alarm()` calls `setAlarm()` unconditionally, or under a condition that never becomes false; or a `catch` reschedules immediately.
- **False positives:** reschedules only while durable state shows pending work and deletes the alarm when idle; enforces a minimum interval and a persisted maximum tick count.
- **Starting severity:** Critical when unconditional (autonomous, unbounded). See [durable-object-alarms.md](durable-object-alarms.md).

## P2 Alarm set on every wake-up or request

- **Leads:** `setAlarm\(` inside `constructor` or `fetch(` without a preceding `getAlarm\(`.
- **Real when:** every request or wake-up pushes the alarm forward or re-arms it, so an object that should go idle never does; combined with P1 it becomes perpetual.
- **False positives:** `if (await this.ctx.storage.getAlarm() === null)` guard before setting.
- **Starting severity:** Medium alone, High when the alarm handler also reschedules.

## P3 Queue re-enqueue loop

- **Leads:** `\.send\(` or `\.sendBatch\(` inside `async queue\(`, especially in `catch` blocks; `msg\.retry\(` without `msg\.attempts`.
- **Real when:** a consumer sends the same (or a derived) message back to its own queue on failure or "not ready yet", with no attempt counter in the message body. Re-sending creates a new message, so `max_retries` and the dead letter queue never apply. A single permanently failing message loops forever.
- **False positives:** an attempt counter carried in the body and checked against a fixed maximum; delayed re-sends with a hard stop; sending to a *different* queue that terminates.
- **Starting severity:** Critical when unconditional on failure (autonomous after one bad message).

## P4 Producer/consumer cycle

- **Leads:** queue consumers that call `send` on any queue; workflows that `create` workflows; Workers whose `queue` handler calls a service that enqueues.
- **Real when:** following sends across consumers returns to the starting queue (A → B → A) with no depth field in the message.
- **Starting severity:** High; Critical if every message produces at least one follow-up.

## P5 Recursive Worker fetch or service binding call

- **Leads:** `fetch\(\s*request\.url`, `fetch\(\s*new URL\(.*request\.url`, `url\.origin`, own hostname string literals, `env\.\w+\.fetch\(` pointing at the same Worker (`services` entry whose `service` equals the Worker's own `name`), `this\.env\.SELF`.
- **Real when:** a handler calls itself (directly or via another Worker) for pagination, fan-out or "background" work. Cloudflare stops a single chain after 16 Worker-to-Worker calls (error 1019), but fan-out multiplies: two calls per level is up to 2^16 invocations from one external request.
- **False positives:** calls to a *different* Worker that does not call back; one-level proxies.
- **Starting severity:** High; Critical if the chain is started by a cron or alarm and re-started every run.

## P6 Unbounded retry loop

- **Leads:** `while\s*\(\s*true\s*\)`, `for\s*\(\s*;\s*;\s*\)`, `retry`, `attempt`, recursive `return fn\(` in `catch`, `do \{` … `\} while \(!ok\)`.
- **Real when:** retries around a billable call (subrequest, AI, D1, R2, third-party API) have no maximum count, or the maximum comes from input or config without a ceiling, or there is no delay between attempts.
- **False positives:** fixed small max attempts with backoff; retry loops that only retry on specific transient errors and stop on 4xx.
- **Starting severity:** High when around a metered call; Medium when only CPU/subrequests in a user-triggered request.

## P7 Schedule-driven work proportional to total data

- **Leads:** `scheduled\(`, `triggers.*crons`, `SELECT .* FROM \w+\s*(;|"|'|`)` without `LIMIT`, `\.list\(\)` in cron code.
- **Real when:** each run touches every user, row, object or file, and the data grows without limit; or runs overlap without a lock. Cost grows every day with no change in code.
- **False positives:** cursor-based batches with a fixed `LIMIT` per run, incremental processing (`WHERE updated_at > ?`).
- **Starting severity:** High when every row triggers a billable operation (AI, R2, external API); Medium for reads only.

## P8 Unbounded fan-out per request

- **Leads:** `Promise\.all\(\s*\w+\.map\(`, `for \(const .* of` around binding calls, `ctx\.waitUntil\(` inside loops, `sendBatch\(` with request-sized arrays.
- **Real when:** the size of the fan-out comes from user input, request body or database size, with no cap.
- **Starting severity:** Medium; High if unauthenticated or each item calls an expensive service.

## P9 Database operations in loops (N+1) and full-table writes

- **Leads:** `\.prepare\(` or ORM calls inside `for`/`map`; `UPDATE \w+ SET` without `WHERE`; `DELETE FROM \w+` without `WHERE`; `sql\.exec\(` in loops; `storage\.list\(\)` without `limit`.
- **Real when:** row count is unbounded and the path runs often. D1 bills rows scanned, so an unindexed filter on a hot path also counts.
- **Starting severity:** Medium; High when scheduled and over the whole table.

## P10 Write on every request

- **Leads:** `\.put\(` (KV, R2, DO storage) or `INSERT`/`UPDATE` in middleware or the main `fetch` path; analytics counters; "last seen" timestamps.
- **Real when:** every request (including bots and static-looking routes) causes a write, and writes are the expensive operation for that product (KV writes, D1 rows written).
- **Starting severity:** High when unauthenticated requests cause the write and the only bound is a per-IP or per-location rate limit, or none (anyone sets the volume; see the calibration rules in SKILL.md). Medium when authenticated or capped per user. Low when the write is rare or on an internal route.

## P11 Workflow re-creation and unlimited step retries

- **Leads:** `\.create\(` on a workflow binding inside `run(`; `retries:\s*\{\s*limit:\s*\d{3,}`; `create\(` without `id`.
- **Real when:** a workflow starts a new instance of itself at the end with no generation counter, or a step calling a metered API has a very high retry limit, or instances are created per event with no deduplication.
- **Starting severity:** High for self-recreation without a stop; Medium for high retry limits.

## P12 AI or agent loop without a budget

- **Leads:** `env\.AI\.run\(` or LLM client calls inside `while`/`for`; `tool_calls`; `max_tokens` absent; `agents` SDK `onChatMessage` loops; `maxSteps`.
- **Real when:** the loop ends only when the model says so, with no maximum iterations, token or cost budget; or AI runs per item over growing data on a schedule.
- **Starting severity:** High; Critical if started by a schedule or alarm and continuing without users.

## P13 Browser session or container left running

- **Leads:** `puppeteer\.launch\(`, `launch\(env\.BROWSER`, `keep_alive`, `browser\.close\(`, `extends Container`, `sleepAfter`, `renewActivityTimeout\(`.
- **Real when:** `launch()` has no `close()` in `finally`; sessions are reused across alarms to stay warm; `sleepAfter` is hours or days; `renewActivityTimeout()` runs on a timer; health checks keep instances awake.
- **Starting severity:** Medium; High if driven by an alarm or cron.

## P14 Attacker-controlled object or instance count

- **Leads:** `idFromName\(` with request data, `newUniqueId\(\)` per request, `getContainer\(.*,\s*\w+` with request data, R2 keys from request data.
- **Real when:** each new name creates a new Durable Object or container that sets alarms or stays alive, or each request stores a new object, and the route is unauthenticated or unthrottled.
- **Starting severity:** Medium; High when combined with P1 or P13.

## P15 Failure path that does more billable work

- **Leads:** `catch` blocks that call `fetch`, `send`, `put`, `AI.run`, `setAlarm(Date.now())`; logging full payloads on every error; error reporting per item in loops.
- **Real when:** a persistent failure (bad credentials, downstream outage, poison message) makes each attempt cost more than success, and attempts repeat.
- **Starting severity:** Medium; raise it if the failure path re-triggers itself.

## P16 Public hostname that bypasses zone protections

- **Leads:** a Wrangler config with no `routes` and no `workers_dev`, or `workers_dev: true`; `preview_urls: true`; recommendations or docs in the repo that rely on WAF or zone rate-limiting rules.
- **Real when:** an expensive route is protected only by zone rules (WAF, rate-limiting rules, bot settings) while the same Worker answers on `workers.dev` or a preview URL, where those rules do not apply.
- **False positives:** `workers_dev: false` and `preview_urls: false` set in config; protection implemented in the Worker itself; Cloudflare Access on those hostnames (an account setting to verify).
- **Starting severity:** raises an existing externally drivable finding by one level when its only protection is a zone rule; on its own, Low with a dashboard checklist item.

## P17 Data that grows without cleanup

- **Leads:** tables or prefixes written per request or per sign-in (`sessions`, `verification`, `tokens`, `request_log`, `rate_limit`, `events`, `audit`) with no `DELETE`, TTL (`expirationTtl`), R2 lifecycle rule, or cleanup cron anywhere in the repo.
- **Real when:** a scheduled job or hot query scans that data, or storage is billed, so cost grows every day with no code change.
- **Starting severity:** Low; Medium when a scheduled job scans the growing data; raise further when combined with P7 or P9.

## P18 One credential unlocks a large fan-out

- **Leads:** admin, debug, metrics or maintenance routes (`/admin`, `/dev`, `/internal`, `/metrics`, `/backfill`) checked with a single static secret (`env.ADMIN_TOKEN`, a shared header), especially routes that loop over Durable Objects, rows or objects.
- **Real when:** the route does bulk work per call (touches many objects, re-processes data, calls AI) with no per-call cap, so a leaked or misused token makes each call expensive and repeatable.
- **False positives:** per-call caps independent of auth, per-user credentials with their own limits, routes not deployed to production.
- **Starting severity:** Medium; High if the route is also on a hostname without other protection and the per-call work is large.
