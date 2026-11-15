# Account controls and the dashboard checklist

Code review cannot see account settings. Use this file to explain what the account can and cannot do, and to build the manual verification checklist in the report.

Sources: [Spending limits and alerts](https://developers.cloudflare.com/billing/manage/spend-management/), [Workers spending limits](https://developers.cloudflare.com/workers/platform/spend-management/), [Durable Objects spending limits](https://developers.cloudflare.com/durable-objects/platform/spend-management/), [AI Gateway spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/), [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/), [Usage-based billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/). Checked 2026-11-15.

Spending limits were announced on 2026-11-13 for Workers and Durable Objects, with more products to follow. If you can reach `developers.cloudflare.com`, check which products they cover now before you write the checklist.

## What exists, and what it does not do

- **Workers Paid has a monthly minimum, not a cap.** Usage beyond included amounts is billed on the next invoice. Nothing blocks usage unless someone has set a spending limit.
- **Spending limits** block a product at a dollar threshold. They exist for two products, each with its own limit, and only once someone sets one (dashboard: Billing > Spend Management, or the `cf` CLI):
  - **Workers:** counts request and CPU charges after included usage, across every Worker in the account. Once it takes effect, Cloudflare rejects new invocations: HTTP requests (error 1103), Cron Triggers, queue consumers, Email Workers, and calls from other Workers or Durable Objects. Static assets served without running the Worker keep working.
  - **Durable Objects:** counts requests, duration, SQLite rows read and written, and key-value storage operations after included usage. Once it takes effect, Cloudflare rejects new requests through a stub, SQL reads and writes, storage growth and new `setAlarm()` calls. Pending alarms are held until the block ends; an alarm scheduled more than seven days ago is deleted while held.
  - A block lasts until someone raises the limit, turns it off or removes it, or until the next billing period starts.
- **What a spending limit does not do:**
  - It is not a maximum bill. Cloudflare says a limit "does not guarantee a maximum invoice amount": usage reporting and blocking take time, so spend can pass the threshold before the block applies.
  - It counts only its own product's charges. No limit exists for D1, KV, R2, Queues, Workers AI, Browser Run, Containers or email. A Worker that drives those adds almost nothing to the Workers limit: a cheap cron that writes millions of D1 rows never reaches it.
  - It cannot target one Worker, one Durable Object namespace or one metric. It is account-wide, so a test Worker that reaches the limit also blocks production Workers in the same account. A limit trades a bill for an outage.
  - The Durable Objects limit does not block requests that are already running (duration keeps accruing), messages on WebSockets that are already open, or key-value operations in legacy key-value-backed objects. Stored data keeps billing during a block.
- **Email alerts per product** (Workers or Durable Objects) send mail at 80% and 100% of a threshold without blocking anything. A spending limit created in the dashboard has no email recipient until one is added.
- **AI Gateway spend limits** are dollar budgets on one gateway, scoped by provider, model or request metadata such as a user ID. Requests over budget get a 429 until the window resets. They apply only to requests routed through that gateway, are eventually consistent (a burst can pass the budget), and cost tracking is an estimate.
- **Budget alerts** email recipients when account-wide usage-based spend for the billing period crosses a dollar threshold. Cloudflare documents them as informational: they "do not pause or limit usage." They are available to pay-as-you-go accounts.
- **Billable usage notifications** track one product metric each, not total spend. Availability varies by product and plan.
- The docs do not say how quickly an alert fires or a limit takes effect after usage happens. Assume a fast loop can run up cost before either one acts.

## Using these in findings

The fix for a finding is in code. An account control is a backstop that limits the damage if the fix is missed or regresses. In each finding's recommendation, after the code fix, say which backstop applies:

- **Cost in Durable Objects** (requests, duration, SQLite rows, alarms): a Durable Objects spending limit stops the path once it takes effect, because it rejects new `setAlarm()` calls and SQL. Say so, and add the checklist row.
- **Cost in Worker requests and CPU:** a Workers spending limit stops new invocations, at the price of blocking every Worker in the account.
- **Cost in Workers AI or another LLM routed through AI Gateway:** an AI Gateway spend limit caps it per gateway, user or model. A direct `env.AI.run()` call with no gateway has no such limit.
- **Cost anywhere else** (D1, KV, R2, Queues, Browser Run, Containers, email, a third-party API): say that no spending limit covers it today, so only the code fix and alerts apply.

## Manual verification checklist (copy into the report, keep relevant rows)

Mark each row for the user to check in the Cloudflare dashboard:

- [ ] A Durable Objects spending limit is set under Billing > Spend Management, with a notification email, at an amount above normal monthly usage. It is the only account control that stops an alarm loop. Keep this row whenever the inventory has Durable Objects.
- [ ] A Workers spending limit is set, or there is a recorded decision not to set one. When it is reached it blocks every Worker in the account, including production.
- [ ] Product email alerts for Workers and Durable Objects at a threshold below each spending limit, so someone hears before anything is blocked.
- [ ] Budget alerts exist at several thresholds of expected monthly spend (for example 25%, 50% and 75%), sent to a monitored inbox, so a loop surfaces within hours rather than at the invoice.
- [ ] Billable usage notifications for the products in the inventory, where offered.
- [ ] `limits.cpu_ms` and `limits.subrequests` for each Worker match the repository config (dashboard edits can override it).
- [ ] Queue consumer settings (`max_retries`, dead letter queue, concurrency) match the repository.
- [ ] Cron Triggers in the dashboard match `triggers.crons` in the repo; no stale crons on old Workers.
- [ ] No old or preview Workers, Durable Object namespaces or containers still deployed with the behavior found in this audit.
- [ ] Durable Object invocation counts and storage operations per namespace in the dashboard: a jump from thousands to hundreds of millions of invocations a day, or rows read and written with no matching user traffic, is the earliest sign of an alarm loop. Check after each change to a Durable Object.
- [ ] Queue backlog and retry counts; dead letter queue size.
- [ ] Workers AI, Browser Run and Containers usage graphs for steady consumption at night or weekends.
- [ ] AI Gateway spend limits, rate limits and caching configured where AI calls go through a gateway.
- [ ] `workers.dev` and preview URLs are disabled for production Workers, or protected by Cloudflare Access. Zone WAF and rate-limiting rules do not apply to them, and a dashboard toggle is undone by the next deploy unless the Wrangler config sets `workers_dev = false`.
- [ ] R2 event notification rules for each bucket (Settings > Event notifications): which prefix and suffix each rule covers, and that no consumer writes into a bucket and prefix a rule matches.
- [ ] The Images plan (Free or Paid) and this month's unique transformations, if the code transforms images.
- [ ] Email Service sending volume and daily quota, if `send_email` is used.
- [ ] Workers Logs sampling (`head_sampling_rate`) and log volume.
- [ ] Who receives billing email, and whether someone acts on it.

## Phrasing for the report

- Say "budget alerts notify; they do not stop usage" whenever alerts are mentioned.
- Say "a spending limit is a backstop, not a maximum bill" whenever a limit is mentioned, and name the product it covers.
- Never present a spending limit as the fix for a finding, and never lower a finding's severity because a limit might be set: the repository cannot show whether it is.
- Do not tell users that any account setting guarantees a maximum bill.
