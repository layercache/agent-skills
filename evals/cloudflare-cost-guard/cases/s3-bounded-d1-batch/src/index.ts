// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

interface Env {
  DB: D1Database;
  IMPORT_LIMITER: RateLimit;
  IMPORT_TOKEN: string;
}

interface EventRow {
  userId: string;
  kind: string;
}

const MAX_ROWS_PER_REQUEST = 500;
const CHUNK_SIZE = 100;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    if (request.headers.get("authorization") !== `Bearer ${env.IMPORT_TOKEN}`) {
      return new Response("unauthorized", { status: 401 });
    }
    const { success } = await env.IMPORT_LIMITER.limit({ key: "import" });
    if (!success) {
      return new Response("rate limited", { status: 429 });
    }

    const rows = (await request.json()) as EventRow[];
    if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_REQUEST) {
      return new Response(`send at most ${MAX_ROWS_PER_REQUEST} rows`, { status: 413 });
    }

    const insert = env.DB.prepare(
      "INSERT INTO events (user_id, kind, created_at) VALUES (?, ?, ?)"
    );
    const now = Date.now();
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      await env.DB.batch(chunk.map((row) => insert.bind(row.userId, row.kind, now)));
    }
    return Response.json({ inserted: rows.length });
  },
};
