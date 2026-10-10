# Services: billing mechanisms and code signals

How each Cloudflare product is billed and what to look for in code. This file describes **mechanisms**, which change rarely. Numbers (included usage, rates, limits) are in [pricing-and-limits.md](pricing-and-limits.md), which is dated and must be treated as a snapshot.

Mechanisms summarized from Cloudflare's developer documentation, checked 2026-10-10. Links are at the end of each section.

## Workers (and Pages Functions)

- **Billed on:** requests and CPU time (Standard usage model). Wall-clock duration is not billed for Workers themselves. Service binding calls between Workers add no request fee. Static asset requests are free.
- **Config:** `main`, `routes`, `limits.cpu_ms`, `limits.subrequests`, `services`, `observability`, `compatibility_flags`.
- **Code signals:** `export default { fetch, scheduled, queue, email, tail }`, `ctx.waitUntil(`, `fetch(` to own hostname or `request.url`, `env.<SERVICE>.fetch(`, RPC calls on service bindings, Hono/itty-router route tables, `functions/**` and `_worker.js` for Pages.
- **Platform bounds:** per-invocation subrequest limit, CPU limit (configurable on Paid), 128 MB memory, a loop limit of 16 Worker-to-Worker calls in one chain (error 1019), `waitUntil` work cut off about 30 seconds after the response. These cap one invocation, not how many invocations happen.
- **Runaway shapes:** self-fetch recursion with fan-out, retry loops around subrequests, unauthenticated endpoints that trigger expensive downstream work, `waitUntil` fan-out per request.
- **Also billed:** Workers Logs events and Logpush; very chatty logging inside loops increases log volume.
- Docs: [pricing](https://developers.cloudflare.com/workers/platform/pricing/), [limits](https://developers.cloudflare.com/workers/platform/limits/), [errors](https://developers.cloudflare.com/workers/observability/errors/).

## Durable Objects

- **Billed on:** requests (HTTP, RPC sessions, WebSocket messages at a reduced ratio, **and alarms**), wall-clock duration in GB-seconds at the full 128 MB allocation while the object is actively running (hibernating objects are not billed for duration), plus storage. Each `setAlarm()` is also billed as one row written. SQLite-backed objects bill rows read, rows written and stored data; legacy key-value-backed objects bill read/write/delete request units and stored data.
- **Config:** `durable_objects.bindings`, `migrations` with `new_sqlite_classes` (SQLite) or `new_classes` (legacy key-value storage).
- **Code signals:** `extends DurableObject`, `ctx.storage.setAlarm`, `alarm(`, `ctx.storage.sql.exec`, `ctx.storage.put/get/list/delete`, `idFromName(`, `newUniqueId(`, `ctx.acceptWebSocket`, `setWebSocketAutoResponse`, `blockConcurrencyWhile`.
- **Runaway shapes:** self-rescheduling alarms (see [durable-object-alarms.md](durable-object-alarms.md)), objects kept awake by timers or polling, per-request object creation with alarms, `storage.list()` without `limit` on growing data, WebSocket broadcast loops that wake many objects.
- Docs: [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).

## D1

- **Billed on:** rows read (rows scanned, not rows returned), rows written (each write to an indexed column also writes an index row), and storage.
- **Config:** `d1_databases`.
- **Code signals:** `env.DB.prepare(`, `.bind(`, `.run()`, `.all()`, `.first()`, `.raw()`, `db.batch(`, `db.exec(`, ORM calls (`drizzle`, `kysely`), `meta.rows_read`.
- **Platform bounds:** queries per invocation, 30-second query duration, database size cap.
- **Runaway shapes:** queries inside loops (N+1), full-table `UPDATE`/`DELETE` without `WHERE` on a schedule, `SELECT *` scans without an index on hot paths, unbounded imports, writes triggered by background tasks that re-trigger themselves.
- Docs: [pricing](https://developers.cloudflare.com/d1/platform/pricing/), [limits](https://developers.cloudflare.com/d1/platform/limits/).

## Workers KV

- **Billed on:** reads, writes, deletes, list operations, and storage. Writes, deletes and lists cost more than reads.
- **Config:** `kv_namespaces`.
- **Code signals:** `env.<KV>.get/put/delete/list(`, `getWithMetadata`, `cacheTtl`.
- **Runaway shapes:** writes on every request (counters, "last seen" timestamps), `list()` pagination loops over a growing namespace, read-modify-write loops, KV used as a queue.
- On the Free plan, operations past the daily limit fail with an error rather than billing.
- Docs: [pricing](https://developers.cloudflare.com/kv/platform/pricing/).

## R2

- **Billed on:** storage (GB-month), Class A operations (writes and lists, such as `PutObject`, `ListObjects`, multipart uploads, `CopyObject`), Class B operations (reads, such as `GetObject`, `HeadObject`). Deletes are free. Egress is free. Infrequent Access storage adds a retrieval fee and has no free tier.
- **Config:** `r2_buckets`.
- **Code signals:** `env.<BUCKET>.put/get/head/list/delete(`, `createMultipartUpload`, S3 SDK clients pointed at R2.
- **Runaway shapes:** re-uploading the same object on every request or tick, `list()` loops over growing prefixes, unbounded user uploads with no size or count limit, writes amplified by retries.
- Docs: [pricing](https://developers.cloudflare.com/r2/pricing/).

## Queues

- **Billed on:** operations. Each 64 KB written, read or deleted is one operation, so a typical message costs about three operations. **Every retry is another read.** Messages sent to a dead letter queue incur a write.
- **Config:** `queues.producers`, `queues.consumers` with `max_retries` (default 3), `dead_letter_queue`, `max_batch_size`, `max_batch_timeout`, `retry_delay`, `max_concurrency`.
- **Code signals:** `env.<QUEUE>.send(`, `sendBatch(`, `async queue(batch, env)`, `msg.ack()`, `msg.retry(`, `batch.retryAll(`, `msg.attempts`.
- **Behavior:** a consumer that throws retries the whole batch, except messages already acknowledged. After `max_retries`, messages go to the dead letter queue if configured, otherwise they are deleted.
- **Runaway shapes:** a consumer that catches a failure and calls `send()` with the same message (resets the attempt count, bypasses `max_retries`), producer/consumer cycles (consumer A sends to queue B whose consumer sends back to A), consumers that enqueue more than one message per message processed with no depth limit, non-idempotent side effects repeated on retry.
- Docs: [pricing](https://developers.cloudflare.com/queues/platform/pricing/), [batching and retries](https://developers.cloudflare.com/queues/configuration/batching-retries/).

## Workflows

- **Billed on:** requests and CPU time like Workers, plus stored state and steps (step billing start is announced separately by Cloudflare).
- **Config:** `workflows` bindings.
- **Code signals:** `extends WorkflowEntrypoint`, `step.do(`, `step.sleep(`, `step.waitForEvent(`, `env.<WF>.create(`, `createBatch(`, `NonRetryableError`, step `retries` config.
- **Behavior:** steps without a config retry 5 times with exponential backoff from 10 seconds and a 10-minute timeout; up to 10,000 retries per step can be configured.
- **Runaway shapes:** a workflow that creates another instance of itself at the end ("loop by re-creation"), very high step retry limits on steps that call metered APIs, `create()` per incoming event with no deduplication (`id` not set), long `step.sleep` loops that never terminate.
- Docs: [sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/), [limits](https://developers.cloudflare.com/workflows/reference/limits/).

## Cron Triggers

- **Billed on:** each scheduled invocation is a Worker invocation (request + CPU) plus whatever it calls.
- **Config:** `triggers.crons` (UTC). Per-environment crons under `env.<name>.triggers`.
- **Code signals:** `async scheduled(controller, env, ctx)`, `controller.cron`, `controller.noRetry()`.
- **Runaway shapes:** every-minute schedules doing work proportional to total data (all users, all rows), crons that enqueue or create workflows with no cap, overlapping runs with no lock when a run takes longer than the interval.
- Docs: [cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## Workers AI and AI Gateway

- **Workers AI is billed on** Neurons; the rate per token differs per model. On the Free plan, usage past the daily allocation fails with an error.
- **AI Gateway** core features (analytics, caching, rate limiting) are free; provider tokens are billed by the provider (or through Unified Billing). Logs have storage limits and may move to Workers Logs pricing.
- **Config:** `ai` binding; AI Gateway IDs in code (`gateway: { id }`) or gateway URLs.
- **Code signals:** `env.AI.run(`, `gateway:` options, `@cf/` model IDs, `openai`/`@anthropic-ai/sdk` clients, `agents` SDK (`Agent`, `AIChatAgent`), tool-calling loops.
- **Runaway shapes:** agent loops with no maximum iteration count or token budget, re-summarizing all data on a schedule, retries on model errors without a cap, AI calls per item in a growing list, no `max_tokens`.
- Docs: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/), [AI Gateway rate limiting](https://developers.cloudflare.com/ai-gateway/features/rate-limiting/).

## Browser Run (formerly Browser Rendering)

- **Billed on:** browser hours for all methods, plus concurrent browsers (averaged monthly) for Browser Sessions (Puppeteer, Playwright, CDP). Quick Actions (REST endpoints) are billed on browser hours only.
- **Config:** `browser` binding.
- **Code signals:** `puppeteer.launch(env.BROWSER`, `@cloudflare/playwright`, `keep_alive`, `browser.close()`, `puppeteer.connect`, `sessions()`, Quick Actions REST calls (`/browser-rendering/` or `/browser-run/` endpoints).
- **Behavior:** a browser closes after 60 seconds of inactivity by default; `keep_alive` extends this to at most 10 minutes. Sessions keep running while active.
- **Runaway shapes:** `launch()` without `close()` in a `finally`, keeping sessions alive from alarms, crawling without a page cap, launching a browser per item in a loop.
- Docs: [Browser Run](https://developers.cloudflare.com/browser-run/), [pricing](https://developers.cloudflare.com/browser-run/pricing/), [limits](https://developers.cloudflare.com/browser-run/limits/).

## Containers

- **Billed on:** every 10 ms a container instance is running: memory and disk on the provisioned instance type, CPU on active use, plus egress. Each container also has a Durable Object, billed separately. Workers Paid only.
- **Config:** `containers` (class, image, `instance_type`, `max_instances`), Durable Object binding for the container class.
- **Code signals:** `extends Container`, `sleepAfter`, `renewActivityTimeout()`, `getContainer(`, `getRandom(`, `startAndWaitForPorts(`, `onStart`/`onStop`/`onError`.
- **Behavior:** an instance runs until `sleepAfter` elapses with no activity (default 10 minutes in the `@cloudflare/containers` package) or until it is stopped. Incoming requests and `renewActivityTimeout()` reset the timer. Scaling is manual (by instance ID).
- **Runaway shapes:** very long `sleepAfter`, `renewActivityTimeout()` called from a timer or alarm, health-check pings that keep instances awake, `onError` restarting in a loop, instance IDs derived from user input (unbounded instance count), large instance types for light work.
- Docs: [pricing](https://developers.cloudflare.com/containers/pricing/), [Container package](https://developers.cloudflare.com/containers/container-package/), [scaling and routing](https://developers.cloudflare.com/containers/platform-details/scaling-and-routing/).

## Hyperdrive

- **Billed on:** no per-query charge on Workers Paid; the Free plan has a daily query limit after which queries fail. Cost risk is on the **origin database** (its own provider's billing, connection limits and egress), not Hyperdrive itself.
- **Config:** `hyperdrive`.
- **Code signals:** `env.HYPERDRIVE.connectionString`, `postgres(`, `pg`, `mysql2`.
- **Runaway shapes:** query loops that hammer a metered origin database (serverless Postgres billed per compute time), connection churn per request.
- Docs: [pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/).

## Vectorize

- **Billed on:** queried vector dimensions and stored vector dimensions.
- **Code signals:** `env.<INDEX>.query(`, `upsert(`, `insert(`.
- **Runaway shapes:** re-embedding and re-upserting the whole corpus on a schedule, query per item in loops.
- Docs: [Workers pricing page, Vectorize section](https://developers.cloudflare.com/workers/platform/pricing/).

## Third-party metered APIs

Cloudflare does not bill these, but Workers code often amplifies them: LLM providers, maps and geocoding, email and SMS senders, payment APIs, search APIs. Treat any loop, retry or fan-out that calls them like a billable Cloudflare operation and name the provider in the finding.
