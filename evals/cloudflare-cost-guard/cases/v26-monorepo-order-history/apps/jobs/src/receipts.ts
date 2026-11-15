// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import type { Env } from "./index";

export interface ReceiptJob {
  orderId: string;
}

export async function handleReceipts(batch: MessageBatch<ReceiptJob>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await env.DB.prepare("INSERT INTO receipts (order_id, issued_at) VALUES (?, ?) ON CONFLICT(order_id) DO NOTHING")
        .bind(msg.body.orderId, Date.now())
        .run();
      msg.ack();
    } catch (err) {
      console.error(`receipt failed for ${msg.body.orderId}`, err);
      msg.retry({ delaySeconds: 30 });
    }
  }
}
