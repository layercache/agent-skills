// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import type { DocJob, Env } from "./index";

interface EnrichResult {
  status: "ok" | "needs_reparse";
  entities: { type: string; value: string }[];
}

export async function handleEnrich(batch: MessageBatch<DocJob>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    const row = await env.DB.prepare("SELECT text FROM documents WHERE id = ?")
      .bind(msg.body.docId)
      .first<{ text: string }>();
    if (!row) {
      msg.ack();
      continue;
    }

    const res = await fetch(env.ENRICH_API, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.ENRICH_KEY}` },
      body: JSON.stringify({ text: row.text }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!res?.ok) {
      msg.retry({ delaySeconds: 60 });
      continue;
    }

    const result = (await res.json()) as EnrichResult;
    if (result.status === "needs_reparse") {
      await env.INGEST.send({ docId: msg.body.docId });
      msg.ack();
      continue;
    }

    await env.DB.prepare("UPDATE documents SET entities = ?, enriched_at = ? WHERE id = ?")
      .bind(JSON.stringify(result.entities), Date.now(), msg.body.docId)
      .run();
    msg.ack();
  }
}
