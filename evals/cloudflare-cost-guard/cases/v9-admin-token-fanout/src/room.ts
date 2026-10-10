// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { DurableObject } from "cloudflare:workers";

export class GameRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/stats") {
      const rows = this.ctx.storage.sql.exec("SELECT COUNT(*) AS moves FROM moves").toArray();
      return Response.json(rows[0] ?? { moves: 0 });
    }
    return new Response("not found", { status: 404 });
  }
}
