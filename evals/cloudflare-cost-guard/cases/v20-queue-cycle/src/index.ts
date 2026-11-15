// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { handleIngest } from "./ingest";
import { handleEnrich } from "./enrich";

export interface DocJob {
  docId: string;
}

export interface Env {
  INGEST: Queue<DocJob>;
  ENRICH: Queue<DocJob>;
  DOCS: R2Bucket;
  DB: D1Database;
  UPLOAD_LIMITER: RateLimit;
  UPLOAD_TOKEN: string;
  ENRICH_API: string;
  ENRICH_KEY: string;
}

const DOC_ID = /^[a-z0-9-]{8,64}$/;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("authorization") !== `Bearer ${env.UPLOAD_TOKEN}`) {
      return new Response("unauthorized", { status: 401 });
    }
    const { success } = await env.UPLOAD_LIMITER.limit({ key: "upload" });
    if (!success) return new Response("slow down", { status: 429 });

    const url = new URL(request.url);
    const docId = url.pathname.startsWith("/docs/") ? url.pathname.slice("/docs/".length) : "";
    if (request.method !== "PUT" || !DOC_ID.test(docId)) {
      return new Response("not found", { status: 404 });
    }
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_UPLOAD_BYTES) return new Response("too large", { status: 413 });

    await env.DOCS.put(`raw/${docId}`, body);
    await env.INGEST.send({ docId });
    return Response.json({ docId }, { status: 202 });
  },

  async queue(batch: MessageBatch<DocJob>, env: Env): Promise<void> {
    if (batch.queue === "doc-ingest") return handleIngest(batch, env);
    if (batch.queue === "doc-enrich") return handleEnrich(batch, env);
  },
} satisfies ExportedHandler<Env, DocJob>;
