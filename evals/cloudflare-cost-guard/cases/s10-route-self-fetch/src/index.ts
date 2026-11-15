// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

interface Env {
  PAGES: KVNamespace;
}

interface Page {
  title: string;
  html: string;
  related: string[];
}

const SLUG = /^[a-z0-9-]{1,80}$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/docs\/([a-z0-9-]{1,80})$/);
    if (request.method !== "GET" || !match) {
      return new Response("not found", { status: 404 });
    }

    const page = await env.PAGES.get<Page>(`page:${match[1]}`, { type: "json", cacheTtl: 300 });
    if (!page) {
      return new Response("not found", { status: 404 });
    }

    // Warm the pages this one links to, so the next click is fast.
    for (const slug of page.related) {
      if (SLUG.test(slug)) {
        ctx.waitUntil(fetch(new URL(`/docs/${slug}`, url.origin).toString()));
      }
    }

    return new Response(render(page), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  },
} satisfies ExportedHandler<Env>;

function render(page: Page): string {
  const links = page.related
    .filter((slug) => SLUG.test(slug))
    .map((slug) => `<li><a href="/docs/${slug}">${slug}</a></li>`)
    .join("");
  return `<!doctype html><title>${page.title}</title><main>${page.html}</main><ul>${links}</ul>`;
}
