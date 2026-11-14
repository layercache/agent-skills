// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import type { Env } from "./index";

interface SupplierProduct {
  sku: string;
  title: string;
  brand: string;
  category: string;
  price_cents: number;
  in_stock: boolean;
}

interface CataloguePage {
  products: SupplierProduct[];
  next: string | null;
}

const PAGE_SIZE = 500;
const BATCH_SIZE = 100;

async function fetchCatalogue(env: Env): Promise<SupplierProduct[]> {
  const all: SupplierProduct[] = [];
  let next: string | null = `${env.CATALOGUE_URL}?per_page=${PAGE_SIZE}`;
  while (next) {
    const res = await fetch(next, { headers: { authorization: `Bearer ${env.SUPPLIER_TOKEN}` } });
    if (!res.ok) throw new Error(`supplier returned ${res.status}`);
    const page = (await res.json()) as CataloguePage;
    all.push(...page.products);
    next = page.next;
  }
  return all;
}

export async function syncCatalogue(env: Env): Promise<void> {
  const products = await fetchCatalogue(env);
  const now = Date.now();
  const upsert = env.DB.prepare(
    `INSERT INTO products (sku, title, brand, category, price_cents, in_stock, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sku) DO UPDATE SET
       title = excluded.title, brand = excluded.brand, category = excluded.category,
       price_cents = excluded.price_cents, in_stock = excluded.in_stock, synced_at = excluded.synced_at`
  );
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const chunk = products.slice(i, i + BATCH_SIZE);
    await env.DB.batch(
      chunk.map((p) =>
        upsert.bind(p.sku, p.title, p.brand, p.category, p.price_cents, p.in_stock ? 1 : 0, now)
      )
    );
  }
}
