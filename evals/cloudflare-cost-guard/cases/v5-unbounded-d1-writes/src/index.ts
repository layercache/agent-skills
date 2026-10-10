interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    const { userId, kind } = (await request.json()) as { userId: string; kind: string };
    await env.DB.prepare("INSERT INTO events (user_id, kind, created_at) VALUES (?, ?, ?)")
      .bind(userId, kind, Date.now())
      .run();
    return new Response(null, { status: 204 });
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    // Decay every event's score so recent activity ranks higher.
    await env.DB.prepare("UPDATE events SET score = score * 0.99").run();
  },
};
