interface Delivery {
  id: string;
  endpoint: string;
  payload: unknown;
}

interface Env {
  DELIVERIES: Queue<Delivery>;
  DB: D1Database;
}

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
    const delivery = (await request.json()) as Delivery;
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
