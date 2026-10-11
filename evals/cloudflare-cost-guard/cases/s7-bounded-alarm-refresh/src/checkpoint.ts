// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

export interface Checkpoint {
  snapshotKey: string | null;
  createdAt: number;
  expiresAt: number;
  refreshedAt: number | null;
  snapshotSeq: number;
}

export const CHECKPOINT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_ALARM_DELAY_MS = 15 * 60 * 1000;

export function newCheckpoint(now: number): Checkpoint {
  return { snapshotKey: null, createdAt: now, expiresAt: now + CHECKPOINT_TTL_MS, refreshedAt: null, snapshotSeq: 0 };
}

export function checkpointRefreshAt(cp: Checkpoint): number {
  return cp.expiresAt - REFRESH_WINDOW_MS;
}
