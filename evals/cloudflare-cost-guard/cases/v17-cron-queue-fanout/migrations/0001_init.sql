-- ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
-- This is a deliberate counterexample for testing the cloudflare-cost-guard
-- skill. Cases in this folder contain code that can run up a Cloudflare bill
-- on purpose. Never deploy it, run it, or copy it into a real project.
-- ==== END OF TEST FIXTURE NOTICE ====

CREATE TABLE target_state (
  target TEXT NOT NULL,
  region TEXT NOT NULL,
  kind TEXT NOT NULL,
  up INTEGER NOT NULL DEFAULT 1,
  changed_at INTEGER NOT NULL,
  PRIMARY KEY (target, region, kind)
);
