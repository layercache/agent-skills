// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

interface Delivery {
  endpoint: string;
  payload: unknown;
}

interface Env {
  DELIVERIES: Queue<Delivery>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    const delivery = (await request.json()) as Delivery;
    await env.DELIVERIES.send(delivery);
    return new Response("queued", { status: 202 });
  },

  async queue(batch: MessageBatch<Delivery>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const res = await fetch(msg.body.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(msg.body.payload),
        });
        if (!res.ok) {
          throw new Error(`endpoint returned ${res.status}`);
        }
      } catch (err) {
        console.warn("delivery failed, requeueing", err);
        await env.DELIVERIES.send(msg.body);
      }
      msg.ack();
    }
  },
};
