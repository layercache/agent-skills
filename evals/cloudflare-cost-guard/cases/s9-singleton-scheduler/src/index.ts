// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { Scheduler } from "./scheduler";
export { Scheduler };

export interface Env {
  SCHEDULER: DurableObjectNamespace<Scheduler>;
  ADMIN_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("authorization") !== `Bearer ${env.ADMIN_TOKEN}`) {
      return new Response("unauthorized", { status: 401 });
    }
    const url = new URL(request.url);
    const stub = env.SCHEDULER.get(env.SCHEDULER.idFromName("scheduler"));

    if (request.method === "PUT" && url.pathname.startsWith("/jobs/")) {
      const { target, everyMinutes } = await request.json<{ target: string; everyMinutes: number }>();
      return Response.json(await stub.upsertJob(url.pathname.slice("/jobs/".length), target, everyMinutes));
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/jobs/")) {
      return Response.json(await stub.removeJob(url.pathname.slice("/jobs/".length)));
    }
    if (request.method === "GET" && url.pathname === "/jobs") {
      return Response.json(await stub.listJobs());
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
