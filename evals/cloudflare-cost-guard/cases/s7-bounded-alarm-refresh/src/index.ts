// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { TutorSession } from "./session";
export { TutorSession };

export interface Env {
  SESSIONS: DurableObjectNamespace<TutorSession>;
  SNAPSHOTS: R2Bucket;
  AUTH: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const userId = token ? await env.AUTH.get(`session:${token}`) : null;
    if (!userId) return new Response("unauthorized", { status: 401 });

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/sessions\/([a-z0-9-]{1,64})\/messages$/);
    if (!match || request.method !== "POST") return new Response("not found", { status: 404 });

    const stub = env.SESSIONS.get(env.SESSIONS.idFromName(`${userId}:${match[1]}`));
    const { role, content } = await request.json<{ role: string; content: string }>();
    return Response.json(await stub.append(role, content.slice(0, 8000)));
  },
} satisfies ExportedHandler<Env>;
