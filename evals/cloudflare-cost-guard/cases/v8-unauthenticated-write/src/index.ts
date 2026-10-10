// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

interface Env {
  DB: D1Database;
  LINKS: KVNamespace;
  PER_IP: RateLimit;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.PER_IP.limit({ key: ip });
    if (!success) {
      return new Response("slow down", { status: 429 });
    }

    const url = new URL(request.url);
    const slug = url.pathname.slice(1);

    await env.DB.prepare(
      "INSERT INTO request_log (slug, ip, user_agent, referrer, created_at) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(slug, ip, request.headers.get("user-agent"), request.headers.get("referer"), Date.now())
      .run();
    await env.LINKS.put(`last-visit:${slug}`, String(Date.now()));

    const target = await env.LINKS.get(`link:${slug}`);
    if (!target) {
      return new Response("not found", { status: 404 });
    }
    return Response.redirect(target, 302);
  },
};
