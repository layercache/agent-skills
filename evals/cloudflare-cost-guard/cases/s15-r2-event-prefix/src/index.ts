// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

export interface Env {
  MEDIA: R2Bucket;
  SESSIONS: KVNamespace;
  UPLOAD_LIMITER: RateLimit;
}

interface ObjectEvent {
  account: string;
  action: string;
  bucket: string;
  object: { key: string; size?: number; eTag?: string };
  eventTime: string;
}

const CLIP_NAME = /^[a-z0-9][a-z0-9._-]{0,80}$/;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const userId = token ? await env.SESSIONS.get(`session:${token}`) : null;
    if (!userId) return new Response("unauthorized", { status: 401 });
    const { success } = await env.UPLOAD_LIMITER.limit({ key: userId });
    if (!success) return new Response("slow down", { status: 429 });

    const url = new URL(request.url);
    const name = url.pathname.startsWith("/clips/") ? url.pathname.slice("/clips/".length) : "";
    if (request.method !== "PUT" || !CLIP_NAME.test(name)) {
      return new Response("not found", { status: 404 });
    }
    if (Number(request.headers.get("content-length") ?? "0") > MAX_UPLOAD_BYTES) {
      return new Response("too large", { status: 413 });
    }
    await env.MEDIA.put(`uploads/${userId}/${name}`, request.body, {
      httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" },
    });
    return Response.json({ name }, { status: 201 });
  },

  async queue(batch: MessageBatch<ObjectEvent>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { key } = msg.body.object;
      if (!key.startsWith("uploads/")) {
        msg.ack();
        continue;
      }
      const object = await env.MEDIA.head(key);
      if (!object) {
        msg.ack();
        continue;
      }
      const summary = {
        key,
        size: object.size,
        etag: object.etag,
        contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
        uploadedAt: object.uploaded.toISOString(),
        indexedAt: new Date().toISOString(),
      };
      await env.MEDIA.put(`meta/${key.slice("uploads/".length)}.json`, JSON.stringify(summary), {
        httpMetadata: { contentType: "application/json" },
      });
      msg.ack();
    }
  },
} satisfies ExportedHandler<Env, ObjectEvent>;
