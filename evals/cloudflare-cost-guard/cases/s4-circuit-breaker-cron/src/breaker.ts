const FAILURE_THRESHOLD = 5;
const OPEN_FOR_MS = 60 * 60_000;

export interface BreakerState {
  failures: number;
  openUntil: number;
  disabled: number;
}

export async function readBreaker(db: D1Database): Promise<BreakerState> {
  const row = await db
    .prepare("SELECT failures, open_until AS openUntil, disabled FROM breaker WHERE name = 'pricing'")
    .first<BreakerState>();
  // A missing row is treated as open so a reset database does not start calling the API.
  return row ?? { failures: FAILURE_THRESHOLD, openUntil: Number.MAX_SAFE_INTEGER, disabled: 1 };
}

export function isOpen(state: BreakerState, now: number): boolean {
  return state.disabled === 1 || state.openUntil > now;
}

export async function recordResult(db: D1Database, ok: boolean, now: number): Promise<void> {
  if (ok) {
    await db.prepare("UPDATE breaker SET failures = 0 WHERE name = 'pricing'").run();
    return;
  }
  await db
    .prepare(
      `UPDATE breaker
         SET failures = failures + 1,
             open_until = CASE WHEN failures + 1 >= ? THEN ? ELSE open_until END
       WHERE name = 'pricing'`
    )
    .bind(FAILURE_THRESHOLD, now + OPEN_FOR_MS)
    .run();
}
