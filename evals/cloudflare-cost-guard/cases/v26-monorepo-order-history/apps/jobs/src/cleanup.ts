// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import type { Env } from "./index";

const KEEP_MS = 24 * 60 * 60 * 1000;
const BATCH = 5_000;

export async function pruneIdempotencyKeys(env: Env): Promise<void> {
  await env.DB.prepare(
    "DELETE FROM idempotency_keys WHERE key IN (SELECT key FROM idempotency_keys WHERE created_at < ? ORDER BY created_at LIMIT ?)"
  )
    .bind(Date.now() - KEEP_MS, BATCH)
    .run();
}
