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
  ADMIN_LIMITER: RateLimit;
  ADMIN_TOKEN: string;
}

const PAGE_SIZE = 50;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/admin/stats") {
      if (request.headers.get("x-admin-token") !== env.ADMIN_TOKEN) {
        return new Response("forbidden", { status: 403 });
      }
      const { success } = await env.ADMIN_LIMITER.limit({ key: "admin" });
      if (!success) return new Response("slow down", { status: 429 });

      const after = url.searchParams.get("after") ?? "";
      const { results: rooms } = await env.DB.prepare("SELECT name FROM rooms WHERE name > ? ORDER BY name LIMIT ?")
        .bind(after, PAGE_SIZE)
        .all<{ name: string }>();
      const stats = await Promise.all(
        rooms.map(async ({ name }) => {
          const stub = env.ROOMS.get(env.ROOMS.idFromName(name));
          return { name, ...(await stub.stats()) };
        })
      );
      const next = rooms.length === PAGE_SIZE ? rooms[rooms.length - 1].name : null;
      return Response.json({ stats, next });
    }

    return new Response("not found", { status: 404 });
  },
};
