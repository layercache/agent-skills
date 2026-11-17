// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { geocode } from "./geocode";

interface Env {
  API_KEYS: KVNamespace;
  KEY_LIMITER: RateLimit;
  DB: D1Database;
  GEOCODER_KEY: string;
}

const DAILY_LOOKUPS = 1_000;

async function clientFor(request: Request, env: Env): Promise<string | null> {
  const key = request.headers.get("x-api-key");
  if (!key) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return env.API_KEYS.get(`key:${hash}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const client = await clientFor(request, env);
    if (!client) return new Response("unauthorized", { status: 401 });
    const { success } = await env.KEY_LIMITER.limit({ key: client });
    if (!success) return new Response("slow down", { status: 429 });

    const address = new URL(request.url).searchParams.get("address")?.slice(0, 200);
    if (!address) {
      return new Response("missing address", { status: 400 });
    }
    const day = new Date().toISOString().slice(0, 10);
    const counted = await env.DB.prepare(
      "INSERT INTO lookups (client, day, used) VALUES (?, ?, 1) " +
        "ON CONFLICT (client, day) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used"
    )
      .bind(client, day, DAILY_LOOKUPS)
      .first<{ used: number }>();
    if (!counted) return new Response("daily lookup limit reached", { status: 429 });

    const coords = await geocode(address, env.GEOCODER_KEY);
    if (!coords) return new Response("lookup failed", { status: 502 });
    return Response.json(coords);
  },
};
