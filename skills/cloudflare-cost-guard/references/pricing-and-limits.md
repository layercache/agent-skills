# Pricing and limits snapshot

<!-- snapshot: 2026-11-15 -->

> **Time-sensitive.** Figures below were checked against Cloudflare's documentation on **2026-11-15** (the Workers AI model rates on **2026-11-14**) and will change. Before quoting a number in a report, confirm it at the linked source if you have network access, and always state the date of the figure you used. If you cannot confirm it, say "per Cloudflare docs as of 2026-11-15" or describe the mechanism without a number. Dollar figures appear only as a "cost at a stated rate" (an operation count at a stated volume times a documented rate, with its date), never as a total bill or anything the user could mistake for a quote.

All prices in USD. "Paid" means the Workers Paid plan, which has a $5/month account minimum. That minimum is **not** a spending cap: usage beyond the included amounts is billed. Optional spending limits exist for Workers and Durable Objects only; see "Account-level controls" at the end.

## Workers

Source: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (page updated 2026-11-13), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (page updated 2026-11-13), [Observability pricing](https://developers.cloudflare.com/observability/pricing/) (page updated 2026-11-11).

| Item | Free | Paid |
| ---- | ---- | ---- |
| Requests | 100,000/day | 10M/month included, then $0.30/M |
| CPU time | 10 ms per invocation | 30M CPU-ms/month included, then $0.02/M CPU-ms |
| CPU limit per HTTP request | 10 ms | default 30 s, configurable up to 5 min (`limits.cpu_ms`) |
| CPU limit per Cron Trigger | 10 ms | 30 s (interval under 1 hour); 15 min (interval 1 hour or more) |
| Subrequests per invocation | 50 | 10,000 default, configurable up to 10M |
| Worker-to-Worker loop limit | 16 calls per chain (error 1019) | same |
| Duration limit for Cron, DO alarm, Queue consumer | 15 min | 15 min |
| `waitUntil()` after response | ~30 s | ~30 s |
| Cron Triggers per account | 5 | 250 |
| Workers Logs, until 2026-11-30 | 200,000 events/day | 20M events/month, then $0.60/M |
| Workers Logs, from 2026-12-01 | 0.5 GB ingested/day, then ingestion stops | 50 GB ingested and 10 GB-month stored per billing cycle, then $0.25/GB ingested and $0.10/GB-month stored |

Workers Logs moves to Cloudflare Observability pricing on 2026-12-01: it is billed by the uncompressed size of the events, not their count, and the included amounts are shared with traces, Containers logs and AI Gateway logs. Logs are kept seven days, so each GB ingested adds about 0.23 GB-month of storage. Use the row that applies on the date of the report, and say which one you used.

## Durable Objects

Source: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) (page updated 2026-11-13), [limits](https://developers.cloudflare.com/durable-objects/platform/limits/). Duration is billed at 128 MB per object regardless of memory used; each `setAlarm()` is billed as one row written. Billable usage is rounded up to the next billable unit before the rate applies (500,000 GB-s over the allowance is billed as 1M GB-s).

| Item | Free | Paid |
| ---- | ---- | ---- |
| Requests (incl. alarms, RPC, WebSocket messages at 20:1) | 100,000/day | 1M/month, then $0.15/M |
| Duration | 13,000 GB-s/day | 400,000 GB-s/month, then $12.50/M GB-s |
| SQLite rows read | 5M/day | 25B/month, then $0.001/M |
| SQLite rows written | 100,000/day | 50M/month, then $1.00/M |
| SQLite storage | 5 GB total | 5 GB-month, then $0.20/GB-month |
| Legacy KV-backed storage (Paid only) | n/a | reads 1M units then $0.20/M; writes and deletes 1M then $1.00/M; 1 GB then $0.20/GB-month (1 unit = 4 KB) |

Duration by state ([lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)): an object that can hibernate does so after 10 seconds idle and is not billed while idle, even before it hibernates; one that cannot (a socket accepted with `accept()`, a pending timer) stays billed, and is evicted only after 70 to 140 seconds with no events and nothing pending. Each pending timer or I/O call holds it in memory for up to 15 minutes. One object awake for an hour is about 461 GB-s, about $0.006 over the allowance; for a month, about 332,000 GB-s, about $4.

Alarm retries: exponential backoff from 2 s, up to 6 retries ([alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)). One object has a soft limit of 1,000 requests per second; the number of objects in a namespace is unlimited.

Storage ([limits](https://developers.cloudflare.com/durable-objects/platform/limits/), checked 2026-11-17): one SQLite-backed object holds at most 10 GB, and at that size writes fail with `SQLITE_FULL` while reads and deletes still work. Storage per account is unlimited, so the 10 GB limit bounds data kept in one object, not data spread over objects created as it grows. One string, BLOB or row holds at most 8 MB.

## D1

Source: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) (pages updated 2026-10-30).

| Item | Free | Paid |
| ---- | ---- | ---- |
| Rows read | 5M/day | 25B/month, then $0.001/M |
| Rows written | 100,000/day | 50M/month, then $1.00/M |
| Storage | 5 GB total | 5 GB, then $0.75/GB-month |
| Queries per Worker invocation | 50 | 1,000 |
| Max database size | 500 MB | 10 GB, which cannot be increased |
| Databases per account | not checked | 1,000,000 (checked 2026-11-17) |
| Query duration | 30 s | 30 s |

A `db.batch()` call counts as one query against the per-invocation limit, however many statements it holds.

The 10 GB limit stops one database from growing, so storage for a full database is at most 5 GB over the included 5 GB, about $3.75 a month. It does not bound data spread over databases created as it grows, and the 1 TB limit on total storage per account can be raised on request (checked 2026-11-17).

**What counts as a row written** (D1 pricing page and [FAQ](https://developers.cloudflare.com/d1/reference/faq/), checked 2026-11-15):

- `INSERT`, `UPDATE` and `DELETE` are all write operations, so deleted rows count as rows written.
- Writing to a column that an index covers adds at least one more row written per index. Indexes are updated on insert, update and delete; the docs do not say explicitly that index rows are billed on `DELETE`, so treat that as likely but undocumented.
- Tables and indexes both count toward storage.

**Not documented** (describe the mechanism and list it as an evidence gap; never state a number):

- Whether `INSERT … ON CONFLICT DO NOTHING` or `INSERT OR IGNORE` that changes nothing counts as a row written.
- Whether `AUTOINCREMENT` (the `sqlite_sequence` update) adds a row written.
- Whether an `UPDATE` that sets a value to what it already was counts.
- How `INSERT OR REPLACE` is billed. SQLite runs it as a delete of the conflicting row followed by an insert, updating every index for both, so it can cost more than an `UPDATE` of the same row.

Until these are measured, treat a write that changes nothing as billed: a scheduled sync that rewrites unchanged rows ([runaway-patterns.md](runaway-patterns.md), P20) pays its full volume every run.

Each query result's `meta.rows_read` and `meta.rows_written` report the real counts, and the dashboard shows them under Metrics. Suggest measuring an uncertain path that way under "Recommended follow-up", in a non-production database.

## Workers KV

Source: [Workers pricing, KV section](https://developers.cloudflare.com/workers/platform/pricing/). On Free, operations past the daily limit fail with an error.

| Item | Free (daily) | Paid (monthly, then overage) |
| ---- | ---- | ---- |
| Reads | 100,000 | 10M, then $0.50/M |
| Writes | 1,000 | 1M, then $5.00/M |
| Deletes | 1,000 | 1M, then $5.00/M |
| Lists | 1,000 | 1M, then $5.00/M |
| Storage | 1 GB | 1 GB, then $0.50/GB-month |

[KV limits](https://developers.cloudflare.com/kv/platform/limits/) (checked 2026-11-17): no limit on storage per namespace or account on Paid; one write per second to the same key; values up to 25 MiB.

## R2

Source: [R2 pricing](https://developers.cloudflare.com/r2/pricing/) (page updated 2026-10-30).

| Item | Standard | Infrequent Access |
| ---- | ---- | ---- |
| Storage | $0.015/GB-month (10 GB-month free) | $0.01/GB-month |
| Class A (writes, lists) | $4.50/M (1M/month free) | $9.00/M |
| Class B (reads) | $0.36/M (10M/month free) | $0.90/M |
| Retrieval | free | $0.01/GB |
| Deletes, egress | free | free |

[R2 limits](https://developers.cloudflare.com/r2/platform/limits/) (checked 2026-11-17): no limit on storage or objects per bucket. Listings are strongly consistent, so a count taken from a listing holds across locations.

## Queues

Source: [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), [batching and retries](https://developers.cloudflare.com/queues/configuration/batching-retries/).

- Free: 10,000 operations/day. Paid: 1M operations/month, then $0.40/M.
- One operation per 64 KB written, read or deleted (1 KB is 1,000 bytes); about 3 per delivered message, 6 for a message over 64,000 bytes; each retry adds a read. A message holds at most 128 KB.
- Default `max_retries` is 3; the maximum is 100. Delays (`delaySeconds`) up to 24 hours.
- With `max_concurrency` unset, consumer invocations scale up to the platform maximum of 250. Maximum batch size is 100 messages.
- A dead letter queue with no consumer keeps messages for 4 days, then deletes them.

## Workflows

Source: [Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/) (page updated 2026-11-04), [Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/), [sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/).

- Requests and CPU billed like Workers, on the same allowance. Paid adds storage (1 GB-month included, then $0.20/GB-month) and steps (500,000/month included, then $0.80 per 100,000). Step and storage billing applies from 2026-08-10. Free: 3,000 steps/day.
- A request is one new instance, not one step. Retries and rollback handlers do not count as steps. A sleeping or waiting instance uses no CPU time but its state is stored (kept 7 days after it ends by default on Paid, up to 30).
- Default step retries: 5, starting at 10 s, exponential, 10-minute timeout. Max 10,000 retries per step.
- Paid: 10,000 steps per instance by default (up to 25,000); 50,000 concurrent running instances; instance creation limited to 300/s per account and 100/s per Workflow.

## Workers AI

Source: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) (page updated 2026-11-12, checked 2026-11-14), [bge-base-en-v1.5 model page](https://developers.cloudflare.com/workers-ai/models/bge-base-en-v1.5/) (checked 2026-11-14).

- 10,000 Neurons/day free, reset daily at 00:00 UTC. Paid: $0.011 per 1,000 Neurons beyond that. Over a 30-day month the free allocation is about 300,000 Neurons; use that as the included allowance when you compare a steady volume.
- Free plan cannot exceed the daily allocation; further calls fail.
- Rates for common models (the pricing page lists more). The price per million tokens is the Neuron figure × $0.011 / 1,000.

| Model | Input, per million tokens | Output, per million tokens |
| ----- | ------------------------- | -------------------------- |
| `@cf/baai/bge-small-en-v1.5` | $0.020 (1,841 Neurons) | n/a |
| `@cf/baai/bge-base-en-v1.5` | $0.067 (6,058 Neurons) | n/a |
| `@cf/baai/bge-large-en-v1.5` | $0.204 (18,582 Neurons) | n/a |
| `@cf/baai/bge-m3` | $0.012 (1,075 Neurons) | n/a |
| `@cf/meta/llama-3.1-8b-instruct` | $0.282 (25,608 Neurons) | $0.827 (75,147 Neurons) |
| `@cf/meta/llama-3.1-8b-instruct-fp8` | $0.152 (13,778 Neurons) | $0.287 (26,128 Neurons) |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | $0.293 (26,668 Neurons) | $2.253 (204,805 Neurons) |

- `bge-base-en-v1.5` takes at most 512 input tokens per text. When the text length cannot be seen, assume each text uses the model's maximum and say so.
- For a model not listed here, give the token counts and the Neuron price, and say that the dollar figure needs the model's rate.

## AI Gateway

Source: [AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/).

- Core features (analytics, caching, rate limiting) are free. Provider tokens are billed at provider rates; Unified Billing adds a 5% fee on credit purchases.
- Accounts that created their first gateway on or after 2026-09-24 store gateway logs in Workers Logs, at Workers Logs pricing.
- Guardrails run a Workers AI model on each prompt and response and are billed as Workers AI inference.
- [Spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/): dollar budgets per gateway, scoped by provider, model or request metadata. Requests over budget get a 429 until the window resets. Up to 20 rules per gateway; eventually consistent.

## Browser Run

Source: [Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/), [limits](https://developers.cloudflare.com/browser-run/limits/).

| Item | Free | Paid |
| ---- | ---- | ---- |
| Browser hours | 10 min/day | 10 h/month, then $0.09/h |
| Concurrent browsers (Sessions) | 3 | 10 (monthly average) included, then $2.00 each; limit 200 per account |
| New browsers (Sessions) | 1 per 20 s | 3 per second |
| Inactivity timeout | 60 s default, `keep_alive` up to 20 min | same |

A session has no maximum lifetime while it stays active: any command inside the inactivity window keeps it open and billing.

## Containers

Source: [Containers pricing](https://developers.cloudflare.com/containers/pricing/) (page updated 2026-11-13), [Durable Object Container API](https://developers.cloudflare.com/containers/api/durable-object-container/), [migration guide](https://developers.cloudflare.com/containers/guides/migrate-to-durable-object-container-api/). Paid only. Billed per 10 ms while running. Memory and disk are billed as provisioned; CPU on active use.

| Item | Included per month | Then |
| ---- | ---- | ---- |
| Memory | 25 GiB-hours | $0.0000025 per GiB-second |
| CPU (active) | 375 vCPU-minutes | $0.000020 per vCPU-second |
| Disk | 200 GB-hours | $0.00000007 per GB-second |
| Egress | 1 TB (NA/EU) or 500 GB (other regions) | $0.025–$0.05/GB by region |

How long a container runs:

- With the Durable Object Container API (`this.ctx.container`), Cloudflare stops the container shortly after its Durable Object becomes inactive. `setInactivityTimeout()` extends that by up to 6 hours, and any request the Durable Object handles inside the timeout keeps the same container running.
- The `@cloudflare/containers` package and its `Container` class are deprecated. Projects that still use it keep a container running until `sleepAfter` passes with no activity. Its default was 10 minutes when last documented (2026-10-10); the current docs no longer state it, so read the installed package for the value.

## Images

Source: [Images pricing](https://developers.cloudflare.com/images/pricing/) (page updated 2026-10-19). The Images plan is separate from the Workers plan.

- Images Free: 5,000 unique transformations a month; after that, new transformations fail with error 9422 and nothing is charged.
- Images Paid: 5,000 unique transformations a month included, then $0.50 per 1,000. Stored images $5 per 100,000 a month; delivered images $1 per 100,000 a month.
- A unique transformation is one combination of source image and parameters, counted once per calendar month. `format` and `quality` do not count toward uniqueness. The Images binding and transformations of images stored outside Images are billed as transformations.

## Hyperdrive

Source: [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/). Free: 100,000 queries/day, then errors. Paid: no per-query charge. Origin database costs are separate. A PlanetScale database created from the Cloudflare dashboard is billed on the Cloudflare invoice at PlanetScale's rates.

## Vectorize

Source: [Workers pricing, Vectorize section](https://developers.cloudflare.com/workers/platform/pricing/). Paid: 50M queried dimensions/month then $0.01/M; 10M stored dimensions then $0.05 per 100M. Free: 30M queried dimensions/month and 5M stored dimensions. The [Vectorize pricing](https://developers.cloudflare.com/vectorize/platform/pricing/) page (checked 2026-11-17) counts queried dimensions as (queried vectors + stored vectors) × dimensions, so one query of a 768-dimension vector adds 768.

## Email Service

Source: [Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/) (page updated 2026-06-09), [limits](https://developers.cloudflare.com/email-service/platform/limits/).

- Free: sending to arbitrary recipients not available. Paid: 3,000 emails/month included, then $0.35 per 1,000.
- Sends to verified destination addresses are free and do not count. Hard bounces count; API rejections do not.
- Up to 50 recipients per email (to + cc + bcc). New accounts get a conservative daily quota that Cloudflare adjusts; no fixed number is published.
- Inbound Email Routing: no per-email charge; Email Workers billed as Workers.

## Workers Rate Limiting binding

Source: [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). `period` must be 10 or 60 seconds. The limit is approximate and applies separately in each Cloudflare location: the counts do not combine into one limit, and they are eventually consistent within a location. For a strict limit the page recommends a Durable Object. The page does not document pricing (checked 2026-11-17).

## Account-level controls

Source: [Spending limits and alerts](https://developers.cloudflare.com/billing/manage/spend-management/), [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/), [usage-based billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/) (pages updated 2026-11-13). Details and wording for reports are in [account-controls.md](account-controls.md).

- Spending limits exist for Workers (request and CPU charges) and Durable Objects (requests, duration, SQLite rows, key-value storage operations), announced 2026-11-13. Each is account-wide, set by the account owner, and blocks that product's new invocations or requests once it takes effect. A limit "does not guarantee a maximum invoice amount", and no limit covers D1, KV, R2, Queues, Workers AI, Browser Run, Containers or email.
- Budget alerts email when account-wide usage-based spend crosses a dollar threshold. They "do not pause or limit usage." Pay-as-you-go accounts only.
- Billable usage notifications track a single product metric, not dollars.
