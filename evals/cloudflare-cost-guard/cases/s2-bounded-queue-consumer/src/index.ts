// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

interface Delivery {
  id: string;
  endpoint: string;
  payload: unknown;
}

interface Env {
  DELIVERIES: Queue<Delivery>;
  DB: D1Database;
  ENQUEUE_LIMITER: RateLimit;
  RELAY_TOKEN: string;
}

const ALLOWED_HOSTS = new Set(["hooks.partner-one.example", "hooks.partner-two.example"]);
const MAX_PAYLOAD_BYTES = 64_000;

const BASE_DELAY_SECONDS = 30;
const MAX_DELAY_SECONDS = 3600;

function backoff(attempts: number): number {
  return Math.min(BASE_DELAY_SECONDS * 2 ** (attempts - 1), MAX_DELAY_SECONDS);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    if (request.headers.get("authorization") !== `Bearer ${env.RELAY_TOKEN}`) {
      return new Response("unauthorized", { status: 401 });
    }
    const { success } = await env.ENQUEUE_LIMITER.limit({ key: "enqueue" });
    if (!success) {
      return new Response("rate limited", { status: 429 });
    }
    const body = await request.text();
    if (body.length > MAX_PAYLOAD_BYTES) {
      return new Response("payload too large", { status: 413 });
    }
    const delivery = JSON.parse(body) as Delivery;
    if (!ALLOWED_HOSTS.has(new URL(delivery.endpoint).hostname)) {
      return new Response("endpoint not allowed", { status: 400 });
    }
    await env.DELIVERIES.send(delivery);
    return new Response("queued", { status: 202 });
  },

  async queue(batch: MessageBatch<Delivery>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const claimed = await env.DB.prepare(
        "INSERT INTO delivered (id, delivered_at) VALUES (?, ?) ON CONFLICT (id) DO NOTHING"
      )
        .bind(msg.body.id, Date.now())
        .run();
      if (claimed.meta.changes === 0) {
        msg.ack();
        continue;
      }

      const res = await fetch(msg.body.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": msg.body.id },
        body: JSON.stringify(msg.body.payload),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);

      if (res?.ok) {
        msg.ack();
        continue;
      }

      await env.DB.prepare("DELETE FROM delivered WHERE id = ?").bind(msg.body.id).run();
      if (res && res.status >= 400 && res.status < 500 && res.status !== 429) {
        console.warn(`permanent failure ${res.status} for ${msg.body.id}`);
        msg.ack();
        continue;
      }
      msg.retry({ delaySeconds: backoff(msg.attempts) });
    }
  },
};
