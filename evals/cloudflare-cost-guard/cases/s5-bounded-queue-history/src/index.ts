// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { SaveQueue } from "./save-queue";
export { SaveQueue };

export interface Env {
  DB: D1Database;
  SAVE_QUEUE: DurableObjectNamespace<SaveQueue>;
  ACCOUNT_LIMITER: RateLimit;
  WEBHOOK_URL: string;
}

async function authenticate(request: Request, env: Env): Promise<{ accountId: string; userId: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(header.slice(7)));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const row = await env.DB.prepare(
    "SELECT account_id, user_id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL"
  )
    .bind(hash)
    .first<{ account_id: string; user_id: string }>();
  return row ? { accountId: row.account_id, userId: row.user_id } : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const auth = await authenticate(request, env);
    if (!auth) return new Response("unauthorized", { status: 401 });

    const { success } = await env.ACCOUNT_LIMITER.limit({ key: auth.accountId });
    if (!success) return new Response("slow down", { status: 429 });

    const stub = env.SAVE_QUEUE.get(env.SAVE_QUEUE.idFromName(auth.accountId));
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/saves") {
      return Response.json(await stub.enqueue(auth.userId, await request.text()));
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/saves/")) {
      return Response.json(await stub.cancel(auth.userId, url.pathname.slice("/saves/".length)));
    }
    if (request.method === "GET" && url.pathname === "/saves") {
      return Response.json(await stub.list(auth.userId));
    }
    if (request.method === "POST" && url.pathname === "/devices") {
      const { pushToken, label } = await request.json<{ pushToken: string; label: string }>();
      return Response.json(await stub.registerDevice(auth.userId, pushToken, label));
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
