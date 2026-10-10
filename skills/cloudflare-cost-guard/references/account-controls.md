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
- [ ] Budget alerts exist, with thresholds well below what would hurt, sent to a monitored inbox.
- [ ] Billable usage notifications for the products in the inventory, where offered.
- [ ] `limits.cpu_ms` and `limits.subrequests` for each Worker match the repository config (dashboard edits can override it).
- [ ] Queue consumer settings (`max_retries`, dead letter queue, concurrency) match the repository.
- [ ] Cron Triggers in the dashboard match `triggers.crons` in the repo; no stale crons on old Workers.
- [ ] No old or preview Workers, Durable Object namespaces or containers still deployed with the behavior found in this audit.
- [ ] Durable Object usage per class in the dashboard: look for request or duration counts with no matching user traffic (a sign of alarm loops).
- [ ] Queue backlog and retry counts; dead letter queue size.
- [ ] Workers AI, Browser Run and Containers usage graphs for steady consumption at night or weekends.
- [ ] AI Gateway rate limits and caching configured where AI calls go through a gateway.
- [ ] Workers Logs sampling (`head_sampling_rate`) and log volume.
- [ ] Who receives billing email, and whether someone acts on it.

## Phrasing for the report

- Say "budget alerts notify; they do not stop usage" whenever alerts are mentioned.
- Do not tell users that any account setting guarantees a maximum bill.
- When the plan is unknown, cover both: on Free, some limits fail closed with errors; on Paid, the same path is billed.
