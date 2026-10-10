// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { PresenceRoom } from "./room";

export { PresenceRoom };

interface Env {
  PRESENCE: DurableObjectNamespace<PresenceRoom>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const roomName = url.searchParams.get("room") ?? "lobby";
    const stub = env.PRESENCE.get(env.PRESENCE.idFromName(roomName));
    return stub.fetch(request);
  },
};
