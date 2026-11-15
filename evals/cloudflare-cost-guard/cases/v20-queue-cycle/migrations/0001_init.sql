-- ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
-- This is a deliberate counterexample for testing the cloudflare-cost-guard
-- skill. Cases in this folder contain code that can run up a Cloudflare bill
-- on purpose. Never deploy it, run it, or copy it into a real project.
-- ==== END OF TEST FIXTURE NOTICE ====

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  parsed_at INTEGER NOT NULL,
  entities TEXT,
  enriched_at INTEGER
);
