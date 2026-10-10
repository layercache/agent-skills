// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { geocode } from "./geocode";

interface Env {
  GEOCODER_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const address = url.searchParams.get("address");
    if (!address) {
      return new Response("missing address", { status: 400 });
    }
    const coords = await geocode(address, env.GEOCODER_KEY);
    return Response.json(coords);
  },
};
