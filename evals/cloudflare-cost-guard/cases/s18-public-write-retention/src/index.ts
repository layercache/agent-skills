// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

interface Env {
  DB: D1Database;
  LINKS: KVNamespace;
}

const SLUG = /^[a-z0-9-]{1,40}$/;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const slug = new URL(request.url).pathname.slice(1);
    if (request.method !== "GET" || !SLUG.test(slug)) {
      return new Response("not found", { status: 404 });
    }
    const target = await env.LINKS.get(`link:${slug}`, { cacheTtl: 300 });
    if (!target) {
      return new Response("not found", { status: 404 });
    }

    await env.DB.prepare("INSERT INTO visits (slug, created_at) VALUES (?, ?)").bind(slug, Date.now()).run();
    return Response.redirect(target, 302);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await env.DB.prepare("DELETE FROM visits WHERE created_at < ?").bind(Date.now() - RETENTION_MS).run();
  },
};
