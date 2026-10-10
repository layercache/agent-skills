# Pricing and limits snapshot

> **Time-sensitive.** Figures below were copied from Cloudflare's documentation on **2026-10-10** and will change. Before quoting a number in a report, confirm it at the linked source if you have network access, and always state the date of the figure you used. If you cannot confirm it, say "per Cloudflare docs as of 2026-10-10" or describe the mechanism without a number. Dollar figures appear only as a "cost at a stated rate" (an operation count at a stated volume times a documented rate, with its date), never as a total bill or anything the user could mistake for a quote.

All prices in USD. "Paid" means the Workers Paid plan, which has a $5/month account minimum. That minimum is **not** a spending cap: usage beyond the included amounts is billed.

## Workers

Source: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (page updated 2026-10-02), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (page updated 2026-10-08).

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
| Workers Logs | 200,000 events/day | 20M events/month, then $0.60/M (moves to Observability pricing from 2026-12-01) |

## Durable Objects

Source: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/). Duration is billed at 128 MB per object regardless of memory used; each `setAlarm()` is billed as one row written.

| Item | Free | Paid |
| ---- | ---- | ---- |
| Requests (incl. alarms, RPC, WebSocket messages at 20:1) | 100,000/day | 1M/month, then $0.15/M |
| Duration | 13,000 GB-s/day | 400,000 GB-s/month, then $12.50/M GB-s |
| SQLite rows read | 5M/day | 25B/month, then $0.001/M |
| SQLite rows written | 100,000/day | 50M/month, then $1.00/M |
| SQLite storage | 5 GB total | 5 GB-month, then $0.20/GB-month |
| Legacy KV-backed storage (Paid only) | n/a | reads 1M units then $0.20/M; writes and deletes 1M then $1.00/M; 1 GB then $0.20/GB-month (1 unit = 4 KB) |

Alarm retries: exponential backoff from 2 s, up to 6 retries ([alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)).

## D1

Source: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) (pages updated 2026-04-21).

| Item | Free | Paid |
| ---- | ---- | ---- |
| Rows read | 5M/day | 25B/month, then $0.001/M |
| Rows written | 100,000/day | 50M/month, then $1.00/M |
| Storage | 5 GB total | 5 GB, then $0.75/GB-month |
| Queries per Worker invocation | 50 | 1,000 |
| Max database size | 500 MB | 10 GB |
| Query duration | 30 s | 30 s |

**What counts as a row written** (D1 pricing page and [FAQ](https://developers.cloudflare.com/d1/reference/faq/), checked 2026-10-10):

- `INSERT`, `UPDATE` and `DELETE` are all write operations, so deleted rows count as rows written.
- Writing to a column that an index covers adds at least one more row written per index. Indexes are updated on insert, update and delete; the docs do not say explicitly that index rows are billed on `DELETE`, so treat that as likely but undocumented.
- Tables and indexes both count toward storage.

**Not documented** (describe the mechanism and list it as an evidence gap; never state a number):

- Whether `INSERT … ON CONFLICT DO NOTHING` or `INSERT OR IGNORE` that changes nothing counts as a row written.
- Whether `AUTOINCREMENT` (the `sqlite_sequence` update) adds a row written.
- Whether an `UPDATE` that sets a value to what it already was counts.

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

## R2

Source: [R2 pricing](https://developers.cloudflare.com/r2/pricing/) (page updated 2026-10-01).

| Item | Standard | Infrequent Access |
| ---- | ---- | ---- |
| Storage | $0.015/GB-month (10 GB-month free) | $0.01/GB-month |
| Class A (writes, lists) | $4.50/M (1M/month free) | $9.00/M |
| Class B (reads) | $0.36/M (10M/month free) | $0.90/M |
| Retrieval | free | $0.01/GB |
| Deletes, egress | free | free |

## Queues

Source: [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), [batching and retries](https://developers.cloudflare.com/queues/configuration/batching-retries/).

- Free: 10,000 operations/day. Paid: 1M operations/month, then $0.40/M.
- One operation per 64 KB written, read or deleted; about 3 per delivered message; each retry adds a read.
- Default `max_retries` is 3. Delays (`delaySeconds`) up to 24 hours.

## Workflows

Source: [Workers pricing, Workflows section](https://developers.cloudflare.com/workers/platform/pricing/), [Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/), [sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/).

- Requests and CPU billed like Workers. Paid adds storage (1 GB-month included, then $0.20/GB-month) and steps (500,000/month included, then $0.80 per 100,000); step and storage billing start on a date Cloudflare announces separately.
- Default step retries: 5, starting at 10 s, exponential, 10-minute timeout. Max 10,000 retries per step.
- Paid: 10,000 steps per instance by default (up to 25,000); 50,000 concurrent running instances; instance creation limited to 300/s per account and 100/s per Workflow.

## Workers AI

Source: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) (page updated 2026-10-09).

- 10,000 Neurons/day free. Paid: $0.011 per 1,000 Neurons beyond that. Per-model Neuron rates vary.
- Free plan cannot exceed the daily allocation; further calls fail.

## AI Gateway

Source: [AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/).

- Core features (analytics, caching, rate limiting) are free. Provider tokens are billed at provider rates; Unified Billing adds a 5% fee on credit purchases.
- Gateways created from 2026-09-24 use Workers Logs pricing for logs.

## Browser Run

Source: [Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/), [limits](https://developers.cloudflare.com/browser-run/limits/).

| Item | Free | Paid |
| ---- | ---- | ---- |
| Browser hours | 10 min/day | 10 h/month, then $0.09/h |
| Concurrent browsers (Sessions) | 3 | 10 (monthly average) included, then $2.00 each; limit 200 per account |
| New browsers (Sessions) | 1 per 20 s | 3 per second |
| Inactivity timeout | 60 s default, `keep_alive` up to 10 min | same |

## Containers

Source: [Containers pricing](https://developers.cloudflare.com/containers/pricing/). Paid only. Billed per 10 ms while running.

| Item | Included per month | Then |
| ---- | ---- | ---- |
| Memory | 25 GiB-hours | $0.0000025 per GiB-second |
| CPU (active) | 375 vCPU-minutes | $0.000020 per vCPU-second |
| Disk | 200 GB-hours | $0.00000007 per GB-second |
| Egress | 1 TB (NA/EU) or 500 GB (other regions) | $0.025–$0.05/GB by region |

Default `sleepAfter` in `@cloudflare/containers`: 10 minutes.

## Hyperdrive

Source: [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/). Free: 100,000 queries/day, then errors. Paid: no per-query charge. Origin database costs are separate.

## Vectorize

Source: [Workers pricing, Vectorize section](https://developers.cloudflare.com/workers/platform/pricing/). Paid: 50M queried dimensions/month then $0.01/M; 10M stored dimensions then $0.05 per 100M.

## Email Service

Source: [Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/) (page updated 2026-06-09), [limits](https://developers.cloudflare.com/email-service/platform/limits/).

- Free: sending to arbitrary recipients not available. Paid: 3,000 emails/month included, then $0.35 per 1,000.
- Sends to verified destination addresses are free and do not count. Hard bounces count; API rejections do not.
- Up to 50 recipients per email (to + cc + bcc). New accounts get a conservative daily quota that Cloudflare adjusts; no fixed number is published.
- Inbound Email Routing: no per-email charge; Email Workers billed as Workers.

## Workers Rate Limiting binding

Source: [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). `period` must be 10 or 60 seconds. Counters are per location and eventually consistent. The page does not document pricing.

## Account-level controls

Source: [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/), [usage-based billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/) (pages updated 2026-05-29).

- Budget alerts email when account-wide usage-based spend crosses a dollar threshold. They "do not pause or cap usage." Pay-as-you-go accounts only.
- Billable usage notifications track a single product metric, not dollars.
- No documented hard spending cap for Workers Paid.
