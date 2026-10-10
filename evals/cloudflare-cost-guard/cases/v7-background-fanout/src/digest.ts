export interface Env {
  AI: Ai;
  DB: D1Database;
  PREFS: KVNamespace;
  DIGESTS: R2Bucket;
  EMAILS: Queue<{ userId: string; key: string }>;
}

interface User {
  id: string;
  email: string;
}

export async function buildDigests(env: Env): Promise<void> {
  const { results: users } = await env.DB.prepare("SELECT id, email FROM users").all<User>();

  await Promise.all(
    users.map(async (user) => {
      const prefs = (await env.PREFS.get(`prefs:${user.id}`, "json")) ?? {};
      const { results: activity } = await env.DB.prepare(
        "SELECT * FROM activity WHERE user_id = ? ORDER BY created_at DESC"
      )
        .bind(user.id)
        .all();

      const summary = (await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt: `Summarize this activity for a digest: ${JSON.stringify({ prefs, activity })}`,
      })) as { response: string };

      const key = `digests/${user.id}/${Date.now()}.txt`;
      await env.DIGESTS.put(key, summary.response);
      await env.DB.prepare("INSERT INTO digest_log (user_id, r2_key, created_at) VALUES (?, ?, ?)")
        .bind(user.id, key, Date.now())
        .run();
      await env.EMAILS.send({ userId: user.id, key });
    })
  );
}
