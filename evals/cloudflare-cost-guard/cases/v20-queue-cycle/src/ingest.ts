// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import type { DocJob, Env } from "./index";

const MAX_TEXT_CHARS = 20_000;

export async function handleIngest(batch: MessageBatch<DocJob>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    const object = await env.DOCS.get(`raw/${msg.body.docId}`);
    if (!object) {
      msg.ack();
      continue;
    }
    const text = (await object.text()).replace(/\s+/g, " ").slice(0, MAX_TEXT_CHARS);
    await env.DB.prepare(
      `INSERT INTO documents (id, text, parsed_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET text = excluded.text, parsed_at = excluded.parsed_at`
    )
      .bind(msg.body.docId, text, Date.now())
      .run();
    await env.ENRICH.send({ docId: msg.body.docId });
    msg.ack();
  }
}
