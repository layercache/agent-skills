# ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
# This is a deliberate counterexample for testing the cloudflare-cost-guard
# skill. Cases in this folder contain code that can run up a Cloudflare bill
# on purpose. Never deploy it, run it, or copy it into a real project.
# ==== END OF TEST FIXTURE NOTICE ====

#!/usr/bin/env bash
# One-time resource setup for a new environment.
set -euo pipefail

npx wrangler r2 bucket create clipshare-media
npx wrangler queues create media-events
npx wrangler queues create media-events-dlq
npx wrangler r2 bucket notification create clipshare-media --event-type object-create --queue media-events
