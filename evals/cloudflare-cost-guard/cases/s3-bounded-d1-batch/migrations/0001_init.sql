-- ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
-- This is a deliberate counterexample for testing the cloudflare-cost-guard
-- skill. Cases in this folder contain code that can run up a Cloudflare bill
-- on purpose. Never deploy it, run it, or copy it into a real project.
-- ==== END OF TEST FIXTURE NOTICE ====

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX events_user_created ON events (user_id, created_at);
