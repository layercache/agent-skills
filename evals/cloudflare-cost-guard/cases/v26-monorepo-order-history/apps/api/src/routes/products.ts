// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { products } from "../db/schema";
import type { Env } from "../index";

export async function listProducts(url: URL, env: Env): Promise<Response> {
  const category = url.searchParams.get("category")?.slice(0, 40) ?? "featured";
  const rows = await drizzle(env.DB)
    .select()
    .from(products)
    .where(eq(products.category, category))
    .orderBy(products.priceCents)
    .limit(50);
  return Response.json({ products: rows }, { headers: { "cache-control": "public, max-age=60" } });
}
