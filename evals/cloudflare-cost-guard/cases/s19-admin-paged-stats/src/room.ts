// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { DurableObject } from "cloudflare:workers";

export class GameRoom extends DurableObject {
  async stats(): Promise<{ moves: number }> {
    return { moves: (await this.ctx.storage.get<number>("moveCount")) ?? 0 };
  }
}
