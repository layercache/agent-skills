# Account controls and the dashboard checklist

Code review cannot see account settings. Use this file to explain what the account can and cannot do, and to build the manual verification checklist in the report.

Sources: [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/), [Usage-based billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/). Checked 2026-10-10.

## What exists, and what it does not do

- **Workers Paid has a monthly minimum, not a cap.** Usage beyond included amounts is billed on the next invoice.
- **Budget alerts** email recipients when account-wide usage-based spend for the billing period crosses a dollar threshold. Cloudflare documents them as informational: they "do not pause or cap usage." They are available to pay-as-you-go accounts.
- **Billable usage notifications** track one product metric each, not total spend. Availability varies by product and plan.
- **No documented hard spending cap** exists for Workers Paid. Treat an alert as a notification only, never as a limit.
- **Free plan behavior differs by product.** KV, Workers AI and Hyperdrive return errors past their free daily limits. The docs do not state this for every product, so do not assume a Free account is fully protected.
- The docs do not say how quickly an alert fires after usage happens. Assume a fast loop can run up cost before any email arrives.

## Manual verification checklist (copy into the report, keep relevant rows)

Mark each row for the user to check in the Cloudflare dashboard:

- [ ] Which plan the account is on (Free or Workers Paid).
- [ ] Budget alerts exist at several thresholds of expected monthly spend (for example 25%, 50% and 75%), sent to a monitored inbox, so a loop surfaces within hours rather than at the invoice.
- [ ] Billable usage notifications for the products in the inventory, where offered.
- [ ] `limits.cpu_ms` and `limits.subrequests` for each Worker match the repository config (dashboard edits can override it).
- [ ] Queue consumer settings (`max_retries`, dead letter queue, concurrency) match the repository.
- [ ] Cron Triggers in the dashboard match `triggers.crons` in the repo; no stale crons on old Workers.
- [ ] No old or preview Workers, Durable Object namespaces or containers still deployed with the behavior found in this audit.
- [ ] Durable Object invocation counts and storage operations per namespace in the dashboard: a jump from thousands to hundreds of millions of invocations a day, or rows read and written with no matching user traffic, is the earliest sign of an alarm loop. Check after each change to a Durable Object.
- [ ] Queue backlog and retry counts; dead letter queue size.
- [ ] Workers AI, Browser Run and Containers usage graphs for steady consumption at night or weekends.
- [ ] AI Gateway rate limits and caching configured where AI calls go through a gateway.
- [ ] `workers.dev` and preview URLs are disabled for production Workers, or protected by Cloudflare Access. Zone WAF and rate-limiting rules do not apply to them, and a dashboard toggle is undone by the next deploy unless the Wrangler config sets `workers_dev = false`.
- [ ] Email Service sending volume and daily quota, if `send_email` is used.
- [ ] Workers Logs sampling (`head_sampling_rate`) and log volume.
- [ ] Who receives billing email, and whether someone acts on it.

## Phrasing for the report

- Say "budget alerts notify; they do not stop usage" whenever alerts are mentioned.
- Do not tell users that any account setting guarantees a maximum bill.
- When the plan is unknown, cover both: on Free, some limits fail closed with errors; on Paid, the same path is billed.
