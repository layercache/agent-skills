// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

// Soak test against a local dev server: npx vitest run test/load.test.ts
import { describe, it } from "vitest";

const BASE = "http://127.0.0.1:8787";

describe("orders soak", () => {
  it("keeps placing orders until the run is stopped", async () => {
    let n = 0;
    while (true) {
      await fetch(`${BASE}/orders`, {
        method: "POST",
        headers: { authorization: "Bearer local-dev-session-token-0000000000000000", "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: `soak-${n++}-padding`, items: [{ productId: "sku-1", quantity: 1 }] }),
      });
    }
  });
});
