// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { routeAgentRequest } from "agents";
import { InboxAgent } from "./inbox-agent";
export { InboxAgent };

export interface Env {
  InboxAgent: DurableObjectNamespace<InboxAgent>;
  MAIL_API: string;
  MAIL_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routeAgentRequest(request, env)) ?? new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
