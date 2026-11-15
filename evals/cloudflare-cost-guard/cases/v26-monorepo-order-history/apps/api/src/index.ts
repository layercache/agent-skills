// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import type { JobsEntrypoint } from "../../jobs/src/index";
import { authenticate } from "./auth";
import { createOrder, listOrders } from "./routes/orders";
import { listProducts } from "./routes/products";

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  JOBS: Service<JobsEntrypoint>;
  CUSTOMER_LIMITER: RateLimit;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/products") {
      return listProducts(url, env);
    }

    const customer = await authenticate(request, env);
    if (!customer) return new Response("unauthorized", { status: 401 });
    const { success } = await env.CUSTOMER_LIMITER.limit({ key: customer.id });
    if (!success) return new Response("slow down", { status: 429 });

    if (request.method === "GET" && url.pathname === "/orders") {
      return listOrders(customer, env);
    }
    if (request.method === "POST" && url.pathname === "/orders") {
      return createOrder(customer, request, env);
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
