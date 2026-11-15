// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { ExportWorkflow, type ExportParams } from "./export";
export { ExportWorkflow };

export interface Env {
  EXPORT_WORKFLOW: Workflow<ExportParams>;
  EXPORTS: R2Bucket;
  API_KEYS: KVNamespace;
  ACCOUNT_LIMITER: RateLimit;
  CRM_API: string;
  CRM_TOKEN: string;
}

async function accountFor(request: Request, env: Env): Promise<string | null> {
  const key = request.headers.get("x-api-key");
  if (!key) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return env.API_KEYS.get(`key:${hash}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const accountId = await accountFor(request, env);
    if (!accountId) return new Response("unauthorized", { status: 401 });
    const { success } = await env.ACCOUNT_LIMITER.limit({ key: accountId });
    if (!success) return new Response("slow down", { status: 429 });

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/exports") {
      const instance = await env.EXPORT_WORKFLOW.create({
        id: `${accountId}-${crypto.randomUUID()}`,
        params: { accountId, cursor: null },
      });
      return Response.json({ id: instance.id }, { status: 202 });
    }
    if (request.method === "GET" && url.pathname.startsWith("/exports/")) {
      const id = url.pathname.slice("/exports/".length);
      if (!id.startsWith(`${accountId}-`)) return new Response("not found", { status: 404 });
      const instance = await env.EXPORT_WORKFLOW.get(id);
      return Response.json(await instance.status());
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
