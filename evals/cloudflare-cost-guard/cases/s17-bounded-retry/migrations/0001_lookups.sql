-- ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
-- This is a deliberate counterexample for testing the cloudflare-cost-guard
-- skill. Cases in this folder contain code that can run up a Cloudflare bill
-- on purpose. Never deploy it, run it, or copy it into a real project.
-- ==== END OF TEST FIXTURE NOTICE ====

CREATE TABLE lookups (
  client TEXT NOT NULL,
  day TEXT NOT NULL,
  used INTEGER NOT NULL,
  PRIMARY KEY (client, day)
);
