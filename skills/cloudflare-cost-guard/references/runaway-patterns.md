# Runaway patterns

A catalogue of code shapes that generate uncontrolled billable usage. Each entry gives search leads, what makes it real, the usual false positives, and a starting severity. Search leads are regular expressions for a code search tool; adapt them to the language in use.

A search hit is only a lead. Confirm every pattern by tracing the path (SKILL.md, Phase C) and checking safeguards ([safeguards.md](safeguards.md)). Starting severities are starting points: the calibration rules in SKILL.md decide the final rating and may raise or lower it. When several patterns describe one path (for example P1 with P14), report one finding at the highest applicable severity.

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
- P19 Hot query over data that grows outside a cap

---

## P1 Self-rescheduling alarm

- **Leads:** `setAlarm\(`, `async alarm\(`, `Date\.now\(\)\s*\)`, `Date\.now\(\)\s*\+\s*\d{1,4}\b`; `setAlarm\(` with a time computed from stored state (`expiresAt`, `refreshAt`, `nextRunAt`, `deadline` minus a window).
- **Real when:** `alarm()` calls `setAlarm()` unconditionally, or under a condition that never becomes false; or a `catch` reschedules immediately; or it reschedules at a stored time that the handler never moves forward, so once that time passes every run re-arms in the past and fires again at once (SKILL.md, Phase C step 7). The last shape is often dormant for days or weeks after deploy, until a refresh window or expiry opens.
- **False positives:** reschedules only while durable state shows pending work, the handler itself moves that state toward done, and it deletes the alarm when idle; enforces a minimum interval and a persisted maximum tick count.
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
- **Real when:** following sends across consumers returns to the starting queue (A → B → A) with no depth field in the message. Also real when a consumer calls an API route of its own system (by `fetch` or a service binding) that enqueues work, for example because a mode flag such as `async` defaults to queueing, so the call re-enters the queue; an idempotency key that eventually deduplicates bounds the loop but multiplies every message.
- **Starting severity:** High; Critical if every message produces at least one follow-up.

## P5 Recursive Worker fetch or service binding call

- **Leads:** `fetch\(\s*request\.url`, `fetch\(\s*new URL\(.*request\.url`, `url\.origin`, own hostname string literals, `env\.\w+\.fetch\(` pointing at the same Worker (`services` entry whose `service` equals the Worker's own `name`), `this\.env\.SELF`.
- **Real when:** a handler calls itself (directly or via another Worker) for pagination, fan-out or "background" work. Cloudflare stops a single chain after 16 calls from a Worker to itself or another Worker, including `fetch` to its own hostname (error 1019, tracked by the `CF-EW-Via` header), but fan-out multiplies: two calls per level is up to 2^16 invocations from one external request.
- **False positives:** calls to a *different* Worker that does not call back; one-level proxies.
- **Starting severity:** High; Critical if the chain is started by a cron or alarm and re-started every run.

## P6 Unbounded retry loop

- **Leads:** `while\s*\(\s*true\s*\)`, `for\s*\(\s*;\s*;\s*\)`, `retry`, `attempt`, recursive `return fn\(` in `catch`, `do \{` … `\} while \(!ok\)`.
- **Real when:** retries around a billable call (subrequest, AI, D1, R2, third-party API) have no maximum count, or the maximum comes from input or config without a ceiling, or there is no delay between attempts.
- **False positives:** fixed small max attempts with backoff; retry loops that only retry on specific transient errors and stop on 4xx.
- **Starting severity:** High when around a metered call; Medium when only CPU/subrequests in a user-triggered request.

## P7 Schedule-driven work proportional to total data

- **Leads:** `scheduled\(`, `triggers.*crons`, `SELECT .* FROM \w+\s*(;|"|'|`)` without `LIMIT`, `\.list\(\)` in cron code.
- **Real when:** each run touches every user, row, object or file, and the data grows without limit; or runs overlap without a lock; or each run re-inserts rows it already has (no unique key on the source's identifier, no `ON CONFLICT` or `INSERT OR IGNORE`), so the table grows on every run. Cost grows every day with no change in code.
- **False positives:** cursor-based batches with a fixed `LIMIT` per run, incremental processing (`WHERE updated_at > ?`), but only when the job moves the cursor or marks rows processed where the next run's query reads it (SKILL.md, Phase C step 7). A cursor or flag that never advances makes every run repeat the same batch forever; rate that as autonomous and unbounded.
- **Starting severity:** High when every row triggers a billable operation (AI, R2, external API); Medium for reads only.

## P8 Unbounded fan-out per request

- **Leads:** `Promise\.all\(\s*\w+\.map\(`, `for \(const .* of` around binding calls, `ctx\.waitUntil\(` inside loops, `sendBatch\(` with request-sized arrays.
- **Real when:** the size of the fan-out comes from user input, request body or database size, with no cap.
- **Starting severity:** Medium; High if unauthenticated or each item calls an expensive service.

## P9 Database operations in loops (N+1) and full-table writes

- **Leads:** `\.prepare\(` or ORM calls inside `for`/`map`; `UPDATE \w+ SET` without `WHERE`; `DELETE FROM \w+` without `WHERE`; `sql\.exec\(` in loops; `storage\.list\(\)` without `limit`.
- **Real when:** row count is unbounded and the path runs often. D1 and Durable Object SQLite bill rows scanned, so an unindexed filter on a hot path also counts; when the table keeps growing, see P19.
- **Starting severity:** Medium; High when scheduled and over the whole table.

## P10 Write on every request

- **Leads:** `\.put\(` (KV, R2, DO storage) or `INSERT`/`UPDATE` in middleware or the main `fetch` path; analytics counters; "last seen" timestamps.
- **Real when:** every request (including bots and static-looking routes) causes a write, and writes are the expensive operation for that product (KV writes, D1 rows written).
- **Starting severity:** rate by amplification (see the calibration rules in SKILL.md). Medium when anyone can cause a few cheap writes per request and the data has no retention or a scheduled job scans it. Low when it is about one cheap write per request with retention in place, or the route is authenticated with a per-user cap; mention that under global safeguards rather than as a finding. High only when one request writes many rows or objects, or the path also calls an expensive service (then it is usually P8 or P12 as well).

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

- **Leads:** tables or prefixes written per request or per sign-in (`sessions`, `verification`, `tokens`, `request_log`, `rate_limit`, `events`, `audit`) with no `DELETE`, TTL (`expirationTtl`), R2 lifecycle rule, or cleanup cron anywhere in the repo; `INSERT INTO` in cron, consumer or sync code with no unique constraint or conflict clause on the source's identifier.
- **Real when:** a scheduled job or hot query scans that data, or storage is billed, so cost grows every day with no code change.
- **Starting severity:** Low; Medium when a scheduled job scans the growing data; raise further when combined with P7 or P9. When a per-request or per-alarm query reads the growing data, see P19.

## P18 One credential unlocks a large fan-out

- **Leads:** admin, debug, metrics or maintenance routes (`/admin`, `/dev`, `/internal`, `/metrics`, `/backfill`) checked with a single static secret (`env.ADMIN_TOKEN`, a shared header), especially routes that loop over Durable Objects, rows or objects.
- **Real when:** the route does bulk work per call (touches many objects, re-processes data, calls AI) with no per-call cap, so a leaked or misused token makes each call expensive and repeatable.
- **False positives:** per-call caps independent of auth, per-user credentials with their own limits, routes not deployed to production.
- **Starting severity:** Medium; High if the route is also on a hostname without other protection and the per-call work is large.

## P19 Hot query over data that grows outside a cap

- **Leads:** `COUNT(*)`, `MIN(`, `MAX(`, `SUM(`, `NOT IN (`, `ORDER BY` without `LIMIT`, and `DELETE ... WHERE <timestamp> <= ?` in request handlers, alarms or crons; `\.list\(` on KV, R2 or Durable Object storage in request paths, especially in sign-in, API-key or lookup fallbacks, and paginated `cursor` loops around it; a cap check such as `>= MAX_` before an insert; retention constants (`RETENTION`, `TTL`, `30 * 24 * 60 * 60`) on tables that keep finished or cancelled rows; tables with no `CREATE INDEX` on the columns these queries filter.
- **Real when:** a query that runs per request, per alarm or per cron run reads rows that keep accumulating, and nothing bounds what it reads: no `LIMIT` it can stop at, no index that skips the accumulated rows, no cap on the whole table. A `list()` loop over a growing KV, R2 or storage prefix on a request path is the same shape: each request pays one list operation per page, and when unauthenticated requests reach it (a fallback that runs when a key lookup misses), anyone sets the volume. The usual shape is a cap on waiting or active rows while finished, cancelled or delivered rows are kept as history, so the queue looks bounded and the table is not. Check the data growth inventory (SKILL.md, Phase A) for what adds and removes the rows, and the schema for which index the filter can use. An index on a different column order (for example `(owner_id, created_at)` for a filter on `owner_id` and `status`) still reads every row for that user.
- **False positives:** an index whose leading columns match the filter so the query reads only the capped rows; a cap on the whole table (all states) that keeps it small; a `LIMIT` the query can stop at, such as `ORDER BY` on an indexed column; data that only the operator writes.
- **Starting severity:** High when the caller can add the rows the query reads (see the calibration rule for cost that grows with the caller's own data); Medium when only time or ordinary use grows them; raise to Critical only with P1 or P7, when an autonomous path reads the data and nothing stops the growth.
