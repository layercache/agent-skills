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
- P20 Scheduled rewrite of unchanged data
- P21 Durable Object kept awake
- P22 Work on every WebSocket message
- P23 Storage event that triggers itself
- P24 Caller-chosen image transformations
- P25 Clients and schedulers outside the Worker

---

## P1 Self-rescheduling alarm

- **Leads:** `setAlarm\(`, `async alarm\(`, `Date\.now\(\)\s*\)`, `Date\.now\(\)\s*\+\s*\d{1,4}\b`; `setAlarm\(` with a time computed from stored state (`expiresAt`, `refreshAt`, `nextRunAt`, `deadline` minus a window). The same loop written through a wrapper has no `setAlarm` to find: the Agents SDK (`this\.schedule\(`, `this\.scheduleEvery\(`, `scheduler\.set\(`, `scheduler\.every\(`, cron strings passed to them), PartyServer `onAlarm`, any helper that ends in an alarm.
- **Real when:** `alarm()` calls `setAlarm()` unconditionally, or under a condition that never becomes false; or a `catch` reschedules immediately; or it reschedules at a stored time that the handler never moves forward, so once that time passes every run re-arms in the past and fires again at once (SKILL.md, Phase C step 7). The last shape is often dormant for days or weeks after deploy, until a refresh window or expiry opens. With the Agents SDK: a scheduled callback that schedules itself again after a few seconds with no stop condition; a delayed schedule created on every request, which adds a job each time unless it is created with `idempotent: true`, so chains multiply; an interval of seconds on an agent that exists once per user or per name a caller chooses.
- **False positives:** reschedules only while durable state shows pending work, the handler itself moves that state toward done, and it deletes the alarm when idle; enforces a minimum interval and a persisted maximum tick count. A singleton or a fixed set of named objects that ticks forever at a fixed interval, with capped work per tick and no path that re-arms sooner, is a repeating path at a fixed rate, not a runaway.
- **Starting severity:** Critical when the loop has no rate limit: it can re-arm at `Date.now()` or a past time, any caller or new user adds another object that ticks forever, or the work per tick grows. An alarm that reschedules forever at a fixed interval on a fixed set of objects is rated by its steady volume (SKILL.md, repeating paths at a fixed rate), which is usually Low. See [durable-object-alarms.md](durable-object-alarms.md).

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

- **Leads:** queue consumers that call `send` on any queue; workflows that `create` workflows; Workers whose `queue` handler calls a service that enqueues; a dead letter queue consumer that sends back to the queue it drains.
- **Real when:** following sends across consumers returns to the starting queue (A → B → A) with no depth field in the message. Also real when a consumer calls an API route of its own system (by `fetch` or a service binding) that enqueues work, for example because a mode flag such as `async` defaults to queueing, so the call re-enters the queue; an idempotency key that eventually deduplicates bounds the loop but multiplies every message.
- **Starting severity:** High; Critical if every message produces at least one follow-up.

## P5 Recursive Worker fetch or service binding call

- **Leads:** `fetch\(\s*request\.url`, `fetch\(\s*new URL\(.*request\.url`, `url\.origin`, own hostname string literals, `env\.\w+\.fetch\(` pointing at the same Worker (`services` entry whose `service` equals the Worker's own `name`), `this\.env\.SELF`.
- **Real when:** a handler calls itself (directly or via another Worker) for pagination, fan-out or "background" work, and the call does come back to a Worker. That depends on how the Worker is reached, so read the routing config first:
  - A `fetch()` to its own hostname re-enters the Worker when the hostname is a Custom Domain (`custom_domain: true`), or when the `global_fetch_strictly_public` compatibility flag is set.
  - On a plain route (`routes` with a `pattern` and no `custom_domain`), without that flag, a same-zone `fetch()` goes to the zone's origin server and skips every Worker, so it does not recurse. On a `workers.dev` hostname it fails with error 1042.
  - A service binding or RPC call to itself (`services` entry naming its own Worker, `ctx.exports`) always re-enters.

  Where it does re-enter, Cloudflare stops a single chain after 16 calls from a Worker to itself or another Worker (error 1019, tracked by the `CF-EW-Via` header), but fan-out multiplies: two calls per level is up to 2^16 invocations from one external request.
- **False positives:** calls to a *different* Worker that does not call back; one-level proxies; a self-fetch from a Worker served only on a plain route with no `global_fetch_strictly_public` flag. For that last one, file it Low at most, put the routing setting under "Gated by" with the severity it would have on a Custom Domain, and say that the calls reach the origin server instead.
- **Starting severity:** High. When a cron or alarm restarts the chain every run, rate the repeat by the SKILL.md rules for repeating paths: Critical when the fan-out grows with data, otherwise by its steady volume.

## P6 Unbounded retry loop

- **Leads:** `while\s*\(\s*true\s*\)`, `for\s*\(\s*;\s*;\s*\)`, `retry`, `attempt`, recursive `return fn\(` in `catch`, `do \{` … `\} while \(!ok\)`.
- **Real when:** retries around a billable call (subrequest, AI, D1, R2, third-party API) have no maximum count, or the maximum comes from input or config without a ceiling, or there is no delay between attempts.
- **False positives:** fixed small max attempts with backoff; retry loops that only retry on specific transient errors and stop on 4xx.
- **Starting severity:** High when around a metered call; Medium when only CPU/subrequests in a user-triggered request.

## P7 Schedule-driven work proportional to total data

- **Leads:** `scheduled\(`, `triggers.*crons`, `SELECT .* FROM \w+\s*(;|"|'|`)` without `LIMIT`, `\.list\(\)` in cron code.
- **Real when:** each run touches every user, row, object or file, and the data grows without limit; or runs overlap without a lock; or each run re-inserts rows it already has (no unique key on the source's identifier, no `ON CONFLICT` or `INSERT OR IGNORE`), so the table grows on every run. Cost grows every day with no change in code.
- **False positives:** cursor-based batches with a fixed `LIMIT` per run, incremental processing (`WHERE updated_at > ?`), but only when the job moves the cursor or marks rows processed where the next run's query reads it (SKILL.md, Phase C step 7). A cursor or flag that never advances makes every run repeat the same batch forever; rate it by that batch's steady volume (SKILL.md, repeating paths at a fixed rate), or Critical when the repeated batch grows. A unique key with `ON CONFLICT DO UPDATE` or `INSERT OR REPLACE` stops the growth but still writes every row on every run: see P20.
- **Starting severity:** High when every row triggers a billable operation (AI, R2, external API); Medium for reads only.

## P8 Unbounded fan-out per request

- **Leads:** `Promise\.all\(\s*\w+\.map\(`, `for \(const .* of` around binding calls, `ctx\.waitUntil\(` inside loops, `sendBatch\(` with request-sized arrays.
- **Real when:** the size of the fan-out comes from user input, request body or database size, with no cap.
- **Starting severity:** Medium; High if unauthenticated or each item calls an expensive service.

## P9 Database operations in loops (N+1) and full-table writes

- **Leads:** `\.prepare\(` or ORM calls inside `for`/`map`; `UPDATE \w+ SET` without `WHERE`; `DELETE FROM \w+` without `WHERE`; `sql\.exec\(` in loops; `storage\.list\(\)` without `limit`. With an ORM the same shapes are `db\.select\(\)\.from\(`, `findMany\(`, `\.where\(`, `\.orderBy\(`, `\.offset\(` and `db\.update\(` with no `.limit(` or `.where(`, and the schema is in code (Drizzle `sqliteTable\(`, `index\(`, `uniqueIndex\(`; Prisma `@@index`): read the indexes from there.
- **Real when:** row count is unbounded and the path runs often (for a fixed row count rewritten on a schedule, see P20). D1 and Durable Object SQLite bill rows scanned, so an unindexed filter on a hot path also counts; when the table keeps growing, see P19.
- **Starting severity:** Medium; High when scheduled and over the whole table.

## P10 Write on every request

- **Leads:** `\.put\(` (KV, R2, DO storage) or `INSERT`/`UPDATE` in middleware or the main `fetch` path; analytics counters; "last seen" timestamps; middleware that also runs for static files because the config sets `assets.run_worker_first`; `tail\(` handlers (`tail_consumers`), which run once for every invocation of the Worker they observe.
- **Real when:** every request (including bots and static-looking routes) causes a write, and writes are the expensive operation for that product (KV writes, D1 rows written). Static asset requests are free only while they skip the Worker: with `run_worker_first`, every image, script and stylesheet a page loads is a billed request that runs the middleware.
- **Starting severity:** rate by amplification (see the calibration rules in SKILL.md). Medium when anyone can cause a few cheap writes per request and the data has no retention or a scheduled job scans it. Low when it is about one cheap write per request with retention in place, or the route is authenticated with a per-user cap; mention that under global safeguards rather than as a finding. High only when one request writes many rows or objects, or the path also calls an expensive service (then it is usually P8 or P12 as well).

## P11 Workflow re-creation and unlimited step retries

- **Leads:** `\.create\(` on a workflow binding inside `run(`; `retries:\s*\{\s*limit:\s*\d{3,}`; `create\(` without `id`.
- **Real when:** a workflow starts a new instance of itself at the end with no generation counter, or a step calling a metered API has a very high retry limit, or instances are created per event with no deduplication.
- **Starting severity:** High for self-recreation without a stop; Critical when every start (a request, an event, a cron run) adds another chain that never ends (SKILL.md, Critical needs a cost rate with no limit). Medium for high retry limits.

## P12 AI or agent loop without a budget

- **Leads:** `env\.AI\.run\(` or LLM client calls inside `while`/`for`; `tool_calls`; `max_tokens` absent; `agents` SDK `onChatMessage` loops; `maxSteps`.
- **Real when:** the loop ends only when the model says so, with no maximum iterations, token or cost budget; or AI runs per item over growing data on a schedule.
- **Starting severity:** High. When a schedule or alarm starts it with no users, rate it by the SKILL.md rules for repeating paths: Critical when the work per run grows with data (an AI call per row of a growing table), otherwise by its steady volume.

## P13 Browser session or container left running

- **Leads:** `puppeteer\.launch\(`, `launch\(env\.BROWSER`, `keep_alive`, `browser\.close\(`, `ctx\.container`, `container\.start\(`, `setInactivityTimeout\(`, and for the deprecated `@cloudflare/containers` package `extends Container`, `sleepAfter`, `renewActivityTimeout\(`; for the Sandbox SDK `@cloudflare/sandbox`, `getSandbox\(`, `keepAlive`, `setKeepAlive\(`, `\.destroy\(\)`.
- **Real when:** `launch()` has no `close()` in `finally`; sessions are reused across alarms to stay warm, or a command is sent inside every `keep_alive` window; `setInactivityTimeout()` or `sleepAfter` is hours; `renewActivityTimeout()` runs on a timer; an alarm, timer or health check keeps the container's Durable Object active so the container never stops; a sandbox is created with `keepAlive: true` (it pings its container every 30 seconds and never times out) and some path does not reach `destroy()`; sandbox, container or browser-session names come from a user or a request, so each new name starts another instance.
- **Starting severity:** Medium; High if driven by an alarm or cron. Critical when every caller or user gets an instance that is kept alive with no stop (`keepAlive: true` with no `destroy()`, or an inactivity timeout that something keeps renewing), because each new name adds an instance that runs until someone removes it. A fixed number of instances is a repeating path at a fixed rate: price memory and disk at the provisioned size for every second they run.

## P14 Attacker-controlled object or instance count

- **Leads:** `idFromName\(` with request data, `newUniqueId\(\)` per request, `getContainer\(.*,\s*\w+` with request data, R2 keys from request data.
- **Real when:** each new name creates a new Durable Object or container that sets alarms or stays alive, or each request stores a new object, and the route is unauthenticated or unthrottled.
- **Starting severity:** Medium; High when combined with P1 or P13.

## P15 Failure path that does more billable work

- **Leads:** `catch` blocks that call `fetch`, `send`, `put`, `AI.run`, `setAlarm(Date.now())`; logging full payloads on every error; error reporting per item in loops. In scheduled batch jobs: `AI.run`, a metered `fetch` or a Browser Run session that runs before the step that marks rows done (`UPDATE ... SET done_at`, `processed = 1`), with no attempts column or retry count on the rows. In queue consumers: `max_retries` set high (the maximum is 100) on a handler that pays for a call before it can fail; `msg\.retry\(` or `batch\.retryAll\(` with no `delaySeconds`.
- **Real when:** a persistent failure (bad credentials, downstream outage, poison message) makes each attempt cost more than success, and attempts repeat. A repeating batch job that pays for a step before it records progress, and keeps no attempt count per item, is the same shape: one item that keeps failing in a later step (a vector or database write that rejects it, an ID or field over a size limit) stops the whole batch from being marked done, so every run selects the same items and pays for them again, forever. In a queue consumer the multiplier is fixed: a message that always fails pays for the step `max_retries` + 1 times.
- **False positives:** an attempt count per item saved before the paid step, with items over a fixed limit moved out of the pending set; progress saved before the paid step; per-item error handling that lets the rest of the batch finish and parks the failing item.
- **Starting severity:** Medium; raise it if the failure path re-triggers itself. For a paid batch step with no attempt limit, rate what the repeated batch bills per month once an item keeps failing (SKILL.md, repeating paths at a fixed rate), and say in the scenario that it needs a persistent failure to start.

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

- **Leads:** `COUNT(*)`, `MIN(`, `MAX(`, `SUM(`, `NOT IN (`, `ORDER BY` without `LIMIT`, and `DELETE ... WHERE <timestamp> <= ?` in request handlers, alarms or crons; `\.list\(` on KV, R2 or Durable Object storage in request paths, especially in sign-in, API-key or lookup fallbacks, and paginated `cursor` loops around it; a cap check such as `>= MAX_` before an insert; retention constants (`RETENTION`, `TTL`, `30 * 24 * 60 * 60`) on tables that keep finished or cancelled rows; tables with no `CREATE INDEX` on the columns these queries filter; `OFFSET`, page or offset parameters taken from the request; `LIKE '%` and other search-as-you-type queries.
- **Real when:** a query that runs per request, per alarm or per cron run reads rows that keep accumulating, and nothing bounds what it reads: no `LIMIT` it can stop at, no index that skips the accumulated rows, no cap on the whole table. A `list()` loop over a growing KV, R2 or storage prefix on a request path is the same shape: each request pays one list operation per page, and when unauthenticated requests reach it (a fallback that runs when a key lookup misses), anyone sets the volume. The usual shape is a cap on waiting or active rows while finished, cancelled or delivered rows are kept as history, so the queue looks bounded and the table is not. Check the data growth inventory (SKILL.md, Phase A) for what adds and removes the rows, and the schema for which index the filter can use. An index on a different column order (for example `(owner_id, created_at)` for a filter on `owner_id` and `status`) still reads every row for that user.
- **Judging index use** (D1 and Durable Object SQLite plan queries the way SQLite does; you cannot run the planner, so apply these):
  - An index helps only when the filter uses its leading column or columns with `=`, `IN` or a range. `NOT IN`, `!=`, `OR` across different columns, a function or arithmetic on the column, and `LIKE` with a leading `%` read every row the other conditions leave.
  - An index on `(a, b)` does nothing for a filter on `b` alone.
  - `ORDER BY ... LIMIT n` stops early only when an index supplies that order after the equality filters. Otherwise SQLite reads every matching row, sorts, then cuts.
  - `OFFSET n` reads and throws away `n` rows. With a caller-set offset or page number, one request reads as much as the caller asks for.
  - `COUNT(*)`, `SUM` and `GROUP BY` read every row the filter matches. `MIN` or `MAX` of an indexed column with no other filter reads one row; with a filter the index does not cover, it reads them all.
- **False positives:** an index whose leading columns match the filter so the query reads only the capped rows; a cap on the whole table (all states) that keeps it small; a `LIMIT` the query can stop at, such as `ORDER BY` on an indexed column; data that only the operator writes.
- **Starting severity:** High when the caller can add the rows the query reads (see the calibration rule for cost that grows with the caller's own data); Medium when only time or ordinary use grows them; raise to Critical only with P1 or P7, when an autonomous path reads the data and nothing stops the growth.

## P20 Scheduled rewrite of unchanged data

- **Leads:** `INSERT OR REPLACE`, `REPLACE INTO`, `ON CONFLICT\s*\(.*\)\s*DO UPDATE SET` with no `WHERE` after the `SET` list, ORM upserts (`onConflictDoUpdate(`, `\.upsert\(`, `\.onConflict\(.*\)\.merge\(`), `UPDATE \w+ SET` per item of a fetched list, `db\.batch\(` over a whole feed or catalogue, and KV, R2 or Durable Object `put(` of every key in a snapshot, inside `scheduled`, `alarm`, queue consumers or functions named `sync`, `refresh`, `mirror`, `import` or `reconcile`. Look for what is missing: no `ETag`, `If-None-Match` or `If-Modified-Since` on the upstream fetch, no stored hash or version compared before writing, no `WHERE updated_at > ?` cursor on the source.
- **Real when:** a repeating path writes every row or key of a dataset on each run whether or not its values changed, and the schedule makes the steady volume large (SKILL.md, Phase C step 8). The table does not need to grow: a fixed dataset of a few thousand rows rewritten every minute costs the same every month, and indexes multiply it. In SQLite, `INSERT OR REPLACE` deletes the conflicting row and inserts a new one, so every index is updated for both; `ON CONFLICT DO UPDATE` with no `WHERE` rewrites the row even when every value is the same. How D1 bills those cases is not documented ([pricing-and-limits.md](pricing-and-limits.md)); describe the mechanism, treat the rewrite as billed and list measuring it as follow-up. Reads add up the same way when each run also loads the whole dataset to compare it.
- **False positives:** a conditional upsert (`DO UPDATE SET ... WHERE excluded.col IS NOT col`, or a stored content hash compared first); a conditional fetch that skips the run when the source returns 304 or the same `ETag`; an incremental sync on the source's change time with the cursor saved where the next run reads it; `ON CONFLICT DO NOTHING` on an append-only feed, which writes only new items; a schedule rare enough that the steady volume stays well inside the included allowance.
- **Starting severity:** by what the rewrite bills per month over the included allowance at the stated dataset size (SKILL.md, repeating paths at a fixed rate): Low under about $5, Medium above that, High at about $100 or more, or when the schedule runs every few minutes or faster and the dataset size cannot be seen. When the dataset also grows, combine with P7 and rate by P7.

## P21 Durable Object kept awake

- **Leads:** `\.accept\(\)` on a WebSocket inside a Durable Object (`server.accept()`, `ws.accept()`) where `ctx\.acceptWebSocket\(` would do; `addEventListener\("message"` on a server socket; `setInterval\(` or a `setTimeout\(` that re-arms itself in a Durable Object class; an outbound WebSocket, stream or long `fetch` held open from an object; Server-Sent Events served from an object.
- **Real when:** an object stays in memory, billed for duration at 128 MB, for as long as a client stays connected or a timer keeps running. A socket accepted with `accept()` bills duration for the whole connection, however quiet it is; the Hibernation API does not. A pending `setTimeout` or `setInterval` stops hibernation even in an object that uses the Hibernation API, and each pending timer or I/O call also stops eviction for up to 15 minutes, which the next tick renews. One object awake for an hour is about 461 GB-s (about $0.006 over the allowance); awake all month it is about 332,000 GB-s (about $4). That is small for a singleton and large with one object per room, document or user.
- **False positives:** `ctx.acceptWebSocket()` with `webSocketMessage` and `webSocketClose` handlers and no timers; pings answered by `setWebSocketAutoResponse()`; periodic work done by an alarm, which does not hold the object in memory between runs; a timer that is cleared when the last client leaves.
- **Starting severity:** Medium. High when callers who are not authenticated can open sockets to objects they name, or when there is one object per user, room or document and clients stay connected for hours (dashboards, presence, collaborative editors). Critical only when a timer that does I/O on every tick keeps each object awake with no client connected and callers can create objects: every new name then adds an object that is billed until someone stops it. Give the cost as objects × hours awake × 461 GB-s.

## P22 Work on every WebSocket message

- **Leads:** `webSocketMessage\(`, `addEventListener\("message"`, `onMessage\(` (Agents SDK, PartyServer) with a storage write (`sql\.exec`, `storage\.put`), `env\.AI\.run`, `fetch\(` or a queue send inside; broadcasts that loop over `getWebSockets\(\)` and write once per recipient.
- **Real when:** each incoming message does billable work and nothing limits messages per connection. A connected client can send as many messages as it likes: zone rate-limiting and WAF rules see only the upgrade request, incoming messages are billed as Durable Object requests at 20 to 1, and a Durable Objects spending limit does not block messages on sockets that are already open. The amplification is what one message bills.
- **False positives:** a message budget per connection (a count per interval kept in the socket attachment or in storage) checked before the work; messages that are only relayed to other sockets, since outgoing messages are not billed; writes collected in memory and flushed by an alarm.
- **Starting severity:** rate it like an externally drivable path, per message instead of per request (SKILL.md): High when one message calls Workers AI or another metered service, or writes many rows; Medium for one cheap write per message that is kept; Low when messages are only relayed. Authentication with a per-connection limit lowers it by one.

## P23 Storage event that triggers itself

- **Leads:** queue consumers whose messages look like R2 event notifications (`body\.object\.key`, `body\.bucket`, `body\.action`, `PutObject`, `CopyObject`, `CompleteMultipartUpload`) and that call `\.put\(`, a copy or a multipart upload on an R2 bucket; `wrangler r2 bucket notification create` in scripts, CI or docs; a dead letter queue consumer that sends to the queue it drains; an `email\(` handler that replies or forwards to an address routed back to the same Worker.
- **Real when:** handling an event writes something that raises the same event. The usual case: an `object-create` rule on a bucket feeds a queue, and the consumer writes its output (a thumbnail, a converted file, a sidecar) into the same bucket under a key the rule also matches, so every object creates another, forever. Rules are created with Wrangler commands or in the dashboard, never in the Wrangler config, so the repository often cannot show which prefix or suffix a rule covers.
- **False positives:** output written to a different bucket that has no rule; a rule with a `--prefix` or `--suffix` that the output key cannot match (check the command and how the output key is built); a consumer that returns early for keys it wrote itself.
- **Starting severity:** Critical when the repository shows the rule and the output key matches it: one upload starts a chain that never ends. High with Medium confidence when the consumer writes into the bucket it is notified about and no rule can be seen; say which rule to check in the dashboard.

## P24 Caller-chosen image transformations

- **Leads:** `cf:\s*\{\s*image:`, `/cdn-cgi/image/`, `env\.IMAGES\.input\(`, `\.transform\(\{`, with `width`, `height`, `fit`, `blur`, `rotate` or similar taken from `searchParams`, the path or the request body.
- **Real when:** an image route passes sizes or options from the request straight into a transformation. Images bills each new combination of source image and parameters as one unique transformation per calendar month (`format` and `quality` do not count), so a caller who walks through widths one pixel at a time makes every request a new billable transformation, and a cache cannot help because every URL is new.
- **False positives:** options picked from a fixed list of presets, or clamped to a few allowed sizes, before the call; signed URLs; a route that serves only stored variants.
- **Starting severity:** High when the route is public and the parameters are free-form, with Medium confidence: transformations bill only on the Images Paid plan, which the repository cannot show. On the Images Free plan the same path makes new transformations fail with error 9422 once the monthly allowance is used, which is an outage, not a bill. List the Images plan as an account setting to verify. Medium behind authentication.

## P25 Clients and schedulers outside the Worker

- **Leads:** in web or mobile client code in the repository: `setInterval\(` around `fetch\(`, `refetchInterval`, `refreshInterval`, `pollInterval`, reconnect loops for `WebSocket` or `EventSource` with no backoff. In CI and deploy files: `schedule:` with `cron:` in `.github/workflows/*.yml`, cron entries in other pipeline files, uptime pings that call a route.
- **Real when:** the project's own clients or schedulers call a route on a timer, and that route writes, wakes a Durable Object or calls a paid service. Client volume is polls per client per hour × clients with the page open, so it grows with ordinary use and with tabs left open. A scheduler outside Cloudflare behaves like a Cron Trigger that the Wrangler config does not show.
- **False positives:** polling a route served from cache or static assets; an interval of minutes on a read-only route; polling that stops when the tab is hidden and backs off on errors.
- **Starting severity:** Medium when each poll writes or wakes a Durable Object every few seconds; High when each poll calls an expensive service or reads data that grows with the caller (P19); Low for a read on a slow interval. Give the cost per 1,000 clients with the page open for an hour. Rate an outside scheduler like a cron, by its steady volume.
