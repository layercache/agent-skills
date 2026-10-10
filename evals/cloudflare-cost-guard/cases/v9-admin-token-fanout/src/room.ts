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
