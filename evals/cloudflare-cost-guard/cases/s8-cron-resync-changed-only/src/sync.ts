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
  updated_at: string;
}

interface CataloguePage {
  products: SupplierProduct[];
  next: string | null;
}

const PAGE_SIZE = 500;
const BATCH_SIZE = 100;
const MAX_PAGES_PER_RUN = 20;
const FETCH_TIMEOUT_MS = 10_000;
const CURSOR_NAME = "catalogue";

async function fetchPage(env: Env, url: string): Promise<CataloguePage> {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${env.SUPPLIER_TOKEN}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`supplier returned ${res.status}`);
  return (await res.json()) as CataloguePage;
}

export async function syncCatalogue(env: Env): Promise<void> {
  const state = await env.DB.prepare("SELECT cursor FROM sync_state WHERE name = ?")
    .bind(CURSOR_NAME)
    .first<{ cursor: string }>();
  let cursor = state?.cursor ?? "1970-01-01T00:00:00Z|";

  const upsert = env.DB.prepare(
    `INSERT INTO products (sku, title, brand, category, price_cents, in_stock, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sku) DO UPDATE SET
       title = excluded.title, brand = excluded.brand, category = excluded.category,
       price_cents = excluded.price_cents, in_stock = excluded.in_stock, synced_at = excluded.synced_at
     WHERE products.title IS NOT excluded.title OR products.brand IS NOT excluded.brand
       OR products.category IS NOT excluded.category OR products.price_cents IS NOT excluded.price_cents
       OR products.in_stock IS NOT excluded.in_stock`
  );
  const saveCursor = env.DB.prepare(
    "INSERT INTO sync_state (name, cursor) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET cursor = excluded.cursor"
  );

  let next: string | null =
    `${env.CATALOGUE_URL}?per_page=${PAGE_SIZE}&sort=updated_at,sku&after=${encodeURIComponent(cursor)}`;
  for (let pages = 0; next && pages < MAX_PAGES_PER_RUN; pages++) {
    const page = await fetchPage(env, next);
    if (page.products.length === 0) break;
    const now = Date.now();
    for (let i = 0; i < page.products.length; i += BATCH_SIZE) {
      const chunk = page.products.slice(i, i + BATCH_SIZE);
      await env.DB.batch(
        chunk.map((p) =>
          upsert.bind(p.sku, p.title, p.brand, p.category, p.price_cents, p.in_stock ? 1 : 0, now)
        )
      );
    }
    const last = page.products[page.products.length - 1];
    cursor = `${last.updated_at}|${last.sku}`;
    await saveCursor.bind(CURSOR_NAME, cursor).run();
    next = page.next;
  }
}
