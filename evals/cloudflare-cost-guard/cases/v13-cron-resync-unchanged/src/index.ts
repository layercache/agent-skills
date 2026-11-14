// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { syncCatalogue } from "./sync";

export interface Env {
  DB: D1Database;
  CATALOGUE_URL: string;
  SUPPLIER_TOKEN: string;
  READ_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("authorization") !== `Bearer ${env.READ_TOKEN}`) {
      return new Response("unauthorized", { status: 401 });
    }
    const url = new URL(request.url);
    if (url.pathname !== "/products") return new Response("not found", { status: 404 });

    const category = url.searchParams.get("category") ?? "";
    const { results } = await env.DB.prepare(
      "SELECT sku, title, brand, price_cents, in_stock FROM products WHERE category = ? ORDER BY price_cents LIMIT 50"
    )
      .bind(category)
      .all();
    return Response.json({ products: results });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(syncCatalogue(env));
  },
} satisfies ExportedHandler<Env>;
