// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { EMBED_MODEL, type Env } from "./index";

interface FeedItem {
  id: string;
  title: string;
  body: string;
}

const EMBED_BATCH = 50;

export async function harvest(env: Env): Promise<void> {
  const res = await fetch(env.FEED_URL, { headers: { accept: "application/json" } });
  if (!res.ok) return;
  const { items } = await res.json<{ items: FeedItem[] }>();
  const now = Date.now();
  const insert = env.DB.prepare(
    "INSERT INTO articles (source_id, title, body, fetched_at) VALUES (?, ?, ?, ?)"
  );
  await env.DB.batch(items.map((item) => insert.bind(item.id, item.title, item.body, now)));
}

export async function embedPending(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT id, source_id, title, body FROM articles WHERE embedded_at IS NULL ORDER BY id LIMIT ?"
  )
    .bind(EMBED_BATCH)
    .all<{ id: number; source_id: string; title: string; body: string }>();
  if (results.length === 0) return;

  const { data } = await env.AI.run(EMBED_MODEL, { text: results.map((r) => `${r.title}\n\n${r.body}`) });
  await env.VECTORS.upsert(
    results.map((r, i) => ({ id: r.source_id, values: data[i], metadata: { title: r.title } }))
  );

  const now = Date.now();
  await env.DB.batch(
    results.flatMap((r) => [
      env.DB.prepare("INSERT INTO embeddings (article_id, model, created_at) VALUES (?, ?, ?)").bind(r.id, EMBED_MODEL, now),
      env.DB.prepare("UPDATE articles SET embedded_at = ? WHERE source_id = ?").bind(now, r.id),
    ])
  );
}
