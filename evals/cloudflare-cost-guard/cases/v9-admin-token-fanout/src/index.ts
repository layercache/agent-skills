// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { GameRoom } from "./room";

export { GameRoom };

interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>;
  DB: D1Database;
  ADMIN_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/admin/stats") {
      if (request.headers.get("x-admin-token") !== env.ADMIN_TOKEN) {
        return new Response("forbidden", { status: 403 });
      }
      const { results: rooms } = await env.DB.prepare("SELECT name FROM rooms").all<{ name: string }>();
      const stats = await Promise.all(
        rooms.map(async ({ name }) => {
          const stub = env.ROOMS.get(env.ROOMS.idFromName(name));
          const res = await stub.fetch("https://room/stats");
          return { name, ...((await res.json()) as object) };
        })
      );
      return Response.json(stats);
    }

    return new Response("not found", { status: 404 });
  },
};
