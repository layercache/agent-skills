# Safeguards: what counts and how to verify it

Use this list in Phase D. A safeguard counts only when it is in code on the traced path, runs before the billable operation, and survives failures, restarts and concurrency. Comments, TODOs, README text and config values the code never reads do not count.

In the report, describe missing safeguards and where they belong. Do not write replacement code.

## Verification checklist

For each safeguard you find, answer all of these:

1. **On the path?** Is it on every route to the billable operation, or can another entrypoint skip it?
2. **Before the cost?** Does it run before the billable call, not after?
3. **Exception-safe?** If the handler throws midway, does the bound still hold? (A counter incremented after the risky call never increments when the call throws.)
4. **Restart-safe?** Is state kept in durable storage, not memory? Durable Objects are evicted; Workers isolates are not shared.
5. **Concurrency-safe?** Can two invocations both pass the check? (KV reads are eventually consistent; two cron runs can overlap; queue consumers run concurrently.)
6. **Reset-safe?** If the stored state is missing (new object, cleared storage, new environment), does the default fail closed or fail open?
7. **Hard ceiling?** If the limit comes from env vars, input or the database, is there a fixed upper bound in code?

## Safeguards by type

| Safeguard | Effective when | Watch for |
| --------- | -------------- | --------- |
| Maximum iterations or attempts | Fixed constant or clamped value; checked every iteration | Limit read from input with no ceiling; counter in memory across retries |
| Minimum scheduling interval | `Math.max(delay, MIN)` with a meaningful `MIN` on every `setAlarm`/re-send | Clamp on one call site only; `MIN` of 0 |
| Idle shutdown | Alarm or container stops when durable state shows no work; `deleteAlarm()` or no reschedule | "Work exists" check that stale data keeps true forever |
| Bounded queries | `LIMIT` with cursor; `WHERE` on indexed columns; fixed batch sizes | `LIMIT ?` bound to user input |
| Retry limits | Queue `max_retries` plus dead letter queue; `msg.attempts` checks; step `retries.limit` small | Manual re-send that resets attempts; DLQ consumer that re-sends to the source queue |
| Exponential backoff | Delay grows per attempt with a cap; `delaySeconds` on retries | Backoff computed but not awaited or passed |
| Idempotency | Unique key checked and written atomically before side effects (`INSERT ... ON CONFLICT DO NOTHING`, DO storage transaction) | Check-then-act across KV (eventually consistent); key written after the side effect |
| Concurrency limits | Queue `max_concurrency`; Durable Object as a single-writer lock; Workflow instance IDs for deduplication | Lock in KV; lock without expiry that deadlocks then gets removed by hand |
| Rate limiting | Workers Rate Limiting binding keyed by user, API key or tenant, or AI Gateway rate limits, checked before the billable work | Keyed by IP or applied per location: a partial bound that distributed clients avoid. The binding is per location and eventually consistent: a brake, not accounting. Zone rate-limiting rules do not cover `workers.dev` or preview URLs |
| Circuit breaker | Failure count and open-until time in durable storage, checked before calling the dependency | Breaker state in memory; breaker that opens but the caller still retries |
| Timeouts and cancellation | `AbortSignal.timeout()` on subrequests; Workflow step timeouts | Timeout that triggers a retry loop |
| Persistent kill switch | Flag in durable storage or a binding, read at the start of every autonomous handler, and stopping rescheduling too | Kill switch that stops work but still reschedules the alarm; KV flag with a long `cacheTtl` |
| Max depth for queues/workflows | Generation or depth field in the message/params, checked against a fixed max | Depth field not copied to child messages |
| Authentication | Expensive routes require auth before any billable call | Auth checked after parsing and enqueueing; free self sign-up (anyone can get a token); one static shared secret guarding bulk work (assume it can leak, so also require a per-call cap) |
| Library-provided protection | Library source (read for that one question) shows the limit applies on this path | Assumed from docs or defaults without reading the installed version; mark unknown if not installed |
| Retention and cleanup | Delete, TTL or lifecycle rules on data that grows with traffic | Cleanup job that is itself unbounded (full-table delete every minute) |
| Platform limits | Subrequest limit, 16-call loop limit, D1 queries per invocation, CPU limits | They bound one invocation, not repeated invocations |

## Classifying each protection in the report

- **Verified in code:** you read it on the path and it passed the checklist. Cite file:line.
- **Platform-enforced:** a documented Cloudflare limit applies. Cite the doc and say what it does not bound.
- **Account setting, verify manually:** for example budget alerts, `limits.cpu_ms` set in the dashboard, queue settings changed outside the repo.
- **Unknown:** you could not determine it from the repository.
