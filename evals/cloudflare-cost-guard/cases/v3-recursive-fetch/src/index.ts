// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

interface Env {
  CATALOG: KVNamespace;
  SUPPLIER_API: string;
}

interface Page {
  items: { sku: string; price: number }[];
  next: string[];
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/sync") {
      return new Response("not found", { status: 404 });
    }

    const cursor = url.searchParams.get("cursor") ?? "root";
    const res = await fetch(`${env.SUPPLIER_API}/catalog?cursor=${cursor}`);
    const page = (await res.json()) as Page;

    for (const item of page.items) {
      await env.CATALOG.put(`sku:${item.sku}`, JSON.stringify(item));
    }

    for (const next of page.next) {
      const child = new URL("/sync", url.origin);
      child.searchParams.set("cursor", next);
      ctx.waitUntil(fetch(child.toString()));
    }

    return Response.json({ cursor, stored: page.items.length, children: page.next.length });
  },
};
