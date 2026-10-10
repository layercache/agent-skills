// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { isOpen, readBreaker, recordResult } from "./breaker";

interface Env {
  DB: D1Database;
  PRICING_API: string;
}

const BATCH_SIZE = 50;

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const now = Date.now();
    const breaker = await readBreaker(env.DB);
    if (isOpen(breaker, now)) {
      console.log("pricing refresh skipped: breaker open or disabled");
      return;
    }

    const { results: stale } = await env.DB.prepare(
      "SELECT sku FROM products WHERE refreshed_at < ? ORDER BY refreshed_at LIMIT ?"
    )
      .bind(now - 24 * 60 * 60_000, BATCH_SIZE)
      .all<{ sku: string }>();
    if (stale.length === 0) {
      return;
    }

    const res = await fetch(`${env.PRICING_API}/prices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skus: stale.map((row) => row.sku) }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);

    if (!res?.ok) {
      await recordResult(env.DB, false, now);
      return;
    }

    const prices = (await res.json()) as { sku: string; price: number }[];
    const update = env.DB.prepare("UPDATE products SET price = ?, refreshed_at = ? WHERE sku = ?");
    await env.DB.batch(prices.slice(0, BATCH_SIZE).map((p) => update.bind(p.price, now, p.sku)));
    await recordResult(env.DB, true, now);
  },
};
