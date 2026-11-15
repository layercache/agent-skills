-- ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
-- This is a deliberate counterexample for testing the cloudflare-cost-guard
-- skill. Cases in this folder contain code that can run up a Cloudflare bill
-- on purpose. Never deploy it, run it, or copy it into a real project.
-- ==== END OF TEST FIXTURE NOTICE ====

CREATE TABLE visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX visits_created ON visits (created_at);
