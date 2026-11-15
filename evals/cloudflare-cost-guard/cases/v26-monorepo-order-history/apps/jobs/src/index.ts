// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { WorkerEntrypoint } from "cloudflare:workers";
import { pruneIdempotencyKeys } from "./cleanup";
import { handleReceipts, type ReceiptJob } from "./receipts";

export interface Env {
  DB: D1Database;
  RECEIPTS: Queue<ReceiptJob>;
}

export class JobsEntrypoint extends WorkerEntrypoint<Env> {
  async enqueueReceipt(orderId: string): Promise<void> {
    await this.env.RECEIPTS.send({ orderId });
  }
}

export default {
  async queue(batch: MessageBatch<ReceiptJob>, env: Env): Promise<void> {
    await handleReceipts(batch, env);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await pruneIdempotencyKeys(env);
  },
} satisfies ExportedHandler<Env, ReceiptJob>;
