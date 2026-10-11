// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS deliveries (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     state TEXT NOT NULL,
     payload TEXT NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS deliveries_user_created ON deliveries (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS local_saves (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     body TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS devices (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     push_token TEXT NOT NULL,
     label TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
];

export const WAITING_STATES = ["queued", "sending", "retry"] as const;
export const MAX_WAITING_PER_ACCOUNT = 100;
export const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ALARM_INTERVAL_MS = 30_000;
export const MAX_ATTEMPTS = 5;
export const DELIVERY_BATCH = 10;
