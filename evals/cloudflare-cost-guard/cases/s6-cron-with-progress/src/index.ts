// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { authenticate } from "./auth";
import { harvest, embedPending } from "./jobs";

export interface Env {
  DB: D1Database;
  KEYS: KVNamespace;
  VECTORS: VectorizeIndex;
  AI: Ai;
  SEARCH_LIMITER: RateLimit;
  FEED_URL: string;
  LEGACY_KEY_SCAN: string;
}

export const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/search") return new Response("not found", { status: 404 });

    const client = await authenticate(request, env);
    if (!client) return new Response("unauthorized", { status: 401 });
    const { success } = await env.SEARCH_LIMITER.limit({ key: client.name });
    if (!success) return new Response("slow down", { status: 429 });

    const q = url.searchParams.get("q")?.slice(0, 200) ?? "";
    if (!q) return Response.json({ results: [] });

    const { data } = await env.AI.run(EMBED_MODEL, { text: [q] });
    const matches = await env.VECTORS.query(data[0], { topK: 10, returnMetadata: "all" });
    return Response.json({ client: client.name, results: matches.matches });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        await harvest(env);
        await embedPending(env);
      })()
    );
  },
} satisfies ExportedHandler<Env>;
