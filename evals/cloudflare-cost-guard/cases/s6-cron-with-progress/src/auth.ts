// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import type { Env } from "./index";

export interface Client {
  name: string;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function authenticate(request: Request, env: Env): Promise<Client | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : url(request).searchParams.get("key") ?? "";
  if (!token) return null;

  const byHash = await env.KEYS.get<Client>(`key:hash:${await sha256(token)}`, "json");
  if (byHash) return byHash;

  if (env.LEGACY_KEY_SCAN === "true") {
    const legacy = await env.KEYS.get<Client>(`key:legacy:${await sha256(token)}`, "json");
    if (legacy) return legacy;
  }
  return null;
}

function url(request: Request): URL {
  return new URL(request.url);
}
