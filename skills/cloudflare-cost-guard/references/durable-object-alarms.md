# Durable Object alarms

Alarms are the most common source of autonomous runaway cost on Cloudflare: once set, an alarm can keep a Durable Object running forever with no user traffic.

Source: [Durable Objects Alarms API](https://developers.cloudflare.com/durable-objects/api/alarms/) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), checked 2026-10-10.

## Semantics that matter for cost

- **One alarm per object.** Each Durable Object can have one alarm scheduled at a time.
- **`setAlarm()` overwrites.** Calling it while an alarm is scheduled replaces the existing alarm. Two code paths that both call `setAlarm()` do not create two alarms, but the last writer decides when the next run happens.
- **At-least-once execution.** An alarm can run more than once for the same scheduled time. Handlers must be idempotent.
- **Automatic retries.** If `alarm()` throws an uncaught exception, it is retried with exponential backoff starting at 2 seconds, up to 6 retries. `alarmInfo.retryCount` and `alarmInfo.isRetry` expose this.
- **Retry guarantee applies to the latest `setAlarm()` only.**
- **One `alarm()` runs at a time** per object.
- **`getAlarm()` inside a running handler** returns `null` unless `setAlarm()` was called since the handler started.
- **`deleteAlarm()` inside `alarm()`** may prevent retries, but only on a best-effort basis.
- **Constructor caution.** The constructor runs before `alarm()` on wake-up. A constructor that calls `setAlarm()` without checking `getAlarm()` first reschedules on every wake-up, including wake-ups caused by the alarm itself.
- **Cloudflare's own docs recommend** catching exceptions in `alarm()` and scheduling a new alarm before returning, so work continues past the 6-retry cap. This is correct for reliability and is also exactly how an alarm becomes unbounded if nothing else stops it.

## How alarms are billed

- Each alarm invocation counts as a **Durable Object request**.
- Each `setAlarm()` call is billed as **one row written**.
- The object accrues **duration** (wall-clock GB-seconds, at the full 128 MB allocation) while it is actively running. Pending I/O can keep an object in memory for up to 15 minutes per operation. Hibernating objects are not billed for duration.
- Storage operations inside the handler are billed separately (SQLite rows read/written, or request units on the legacy key-value backend).
- Subrequests, AI calls, queue sends and other bindings used by the handler are billed by their own products.

An alarm that reschedules every second costs roughly 86,400 requests per object per day, plus duration and storage, multiplied by the number of objects. Objects are often created per user, room, or document, so the object count grows with usage and never shrinks on its own.

**Loop rate to use.** An alarm set to `Date.now()` or a past time fires again at once. The Alarms API docs do not give a rate. In a public incident ([aiidelist write-up](https://aiidelist.com/blog/cloudflare-10811-bill-codex-durable-objects-alarm-loop), with Cloudflare support's reply [posted on X](https://x.com/shmily7/status/2108493941003972778)), Cloudflare support described such a loop as firing at roughly 600 invocations per second per object. When a finding has no clamp, state the cost at that rate (about 51.8M invocations per object per day), say it is an observed figure from one incident, not a documented limit, and give the per-run operation count so the reader can rescale.

**What drives the bill.** In that incident the cost was SQLite rows read and written by each run, not duration: an object that stays awake all month costs a few dollars of duration. Lead the cost line with rows read and written per run times the loop rate, then requests, then duration.

## What makes an alarm a finding

Look at every `setAlarm(` call and every `alarm(` handler and answer:

1. **Does `alarm()` reschedule itself?** Is the `setAlarm()` call unconditional, or does it depend on real pending work (connected sessions, unprocessed events, a deadline)?
2. **What is the minimum delay?** `Date.now()`, `Date.now() + 0`, a delay computed from config/input that can be zero or negative, or an absolute time read from storage that can already be in the past (an expiry or refresh time) means immediate re-runs. Look for a clamp such as a fixed minimum interval.
3. **Is there a stop condition, and does the handler move toward it?** An idle check, a maximum tick count persisted in storage, a deadline, or a `deleteAlarm()` when work is done. Confirm the handler writes the state the condition reads (the refresh time it schedules from, the counter it checks); a condition the handler never moves stays true on every run.
4. **What happens on error?** A `catch` that reschedules immediately turns every persistent failure into a tight loop. A `catch` with no reschedule plus automatic retries is bounded (6 retries).
5. **Is the stop state durable?** Counters held only in memory reset when the object is evicted. A stop flag must be in storage.
6. **Who creates objects?** If any request can create a new object ID (`idFromName(userInput)`, `newUniqueId()` per request) and its first `fetch` sets an alarm, the number of perpetual alarms is attacker-controlled.
7. **How much work per tick?** Unbounded storage scans, `list()` without `limit`, fan-out to other objects or external APIs.

## Typical severities

- `alarm()` always reschedules with no idle/stop condition: **Critical** (autonomous and unbounded).
- Reschedules from stored state that the handler never moves forward, so once a window opens every run re-arms at once until a deadline days away: **Critical** (autonomous, effectively unbounded), even though it is dormant until the window opens; say when it starts.
- Reschedules only while work exists, but the "work exists" check can stay true for a reason outside the handler (for example a stale session that never expires): **High** or **Medium** depending on evidence.
- Bounded by a durable tick limit, idle shutdown and a minimum interval: not a finding, or **Low** if monitoring is missing.

## Recommendation wording

For an alarm finding, recommend all of these, adapted to the code:

- A minimum delay floor on every `setAlarm()`: never `Date.now()` or a stored time without clamping it to at least `Date.now()` plus a fixed interval (one minute at the very least; 15 minutes or more is a reasonable floor for refresh or retry cycles).
- A retry or tick budget stored in Durable Object storage, checked before rescheduling, that stops rescheduling once exhausted. A counter held in memory resets when the object is evicted, so the loop survives restarts.
- The kill switch from the global safeguards, read before billable work and before rescheduling.
- A regression test that drives `alarm()` with a refresh or retry time already in the past and asserts the next alarm is at least the floor away.
