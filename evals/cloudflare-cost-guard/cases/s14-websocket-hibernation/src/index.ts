// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { Room } from "./room";
export { Room };

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  SESSIONS: KVNamespace;
}

interface Session {
  userId: string;
  rooms: string[];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/rooms\/([a-z0-9-]{1,64})\/ws$/);
    if (!match) return new Response("not found", { status: 404 });
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("expected a websocket", { status: 426 });
    }

    const token = request.headers.get("sec-websocket-protocol") ?? "";
    const session = /^[A-Za-z0-9_-]{32,128}$/.test(token)
      ? await env.SESSIONS.get<Session>(`session:${token}`, "json")
      : null;
    if (!session) return new Response("unauthorized", { status: 401 });
    if (!session.rooms.includes(match[1])) return new Response("not a member of this room", { status: 403 });

    const forwarded = new Request(request, { headers: new Headers(request.headers) });
    forwarded.headers.set("x-user-id", session.userId);
    return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(forwarded);
  },
} satisfies ExportedHandler<Env>;
