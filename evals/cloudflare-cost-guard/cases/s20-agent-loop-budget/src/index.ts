// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

interface Env {
  AI: Ai;
  KB: KVNamespace;
  API_KEYS: KVNamespace;
  KEY_LIMITER: RateLimit;
  DB: D1Database;
}

type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_STEPS = 4;
const MAX_QUESTION_CHARS = 1_000;
const MAX_ARTICLE_CHARS = 4_000;
const MAX_OUTPUT_TOKENS = 400;
const DAILY_QUESTIONS = 20;

const SYSTEM_PROMPT =
  "You are a support agent. To look something up, reply with SEARCH: <query>. " +
  "When you have a complete answer, reply with FINAL: <answer>.";

async function clientFor(request: Request, env: Env): Promise<string | null> {
  const key = request.headers.get("x-api-key");
  if (!key) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return env.API_KEYS.get(`key:${hash}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const client = await clientFor(request, env);
    if (!client) return new Response("unauthorized", { status: 401 });
    const { success } = await env.KEY_LIMITER.limit({ key: client });
    if (!success) return new Response("slow down", { status: 429 });

    const { question } = (await request.json()) as { question: string };
    if (typeof question !== "string" || question.length === 0 || question.length > MAX_QUESTION_CHARS) {
      return new Response("question must be 1 to 1000 characters", { status: 400 });
    }
    const day = new Date().toISOString().slice(0, 10);
    const counted = await env.DB.prepare(
      "INSERT INTO usage (client, day, questions) VALUES (?, ?, 1) " +
        "ON CONFLICT (client, day) DO UPDATE SET questions = questions + 1 WHERE questions < ? RETURNING questions"
    )
      .bind(client, day, DAILY_QUESTIONS)
      .first<{ questions: number }>();
    if (!counted) return new Response("daily question limit reached", { status: 429 });

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: question },
    ];

    for (let step = 0; step < MAX_STEPS; step++) {
      const result = (await env.AI.run(MODEL, { messages, max_tokens: MAX_OUTPUT_TOKENS })) as { response: string };
      const reply = result.response.trim();
      messages.push({ role: "assistant", content: reply });

      if (reply.startsWith("FINAL:")) {
        return Response.json({ answer: reply.slice(6).trim() });
      }

      const query = reply.startsWith("SEARCH:") ? reply.slice(7).trim() : reply;
      const article = (await env.KB.get(`article:${query.toLowerCase().slice(0, 120)}`)) ?? "No article found.";
      messages.push({ role: "tool", content: article.slice(0, MAX_ARTICLE_CHARS) });
    }
    return Response.json({ answer: "I could not find a complete answer. A person will follow up." });
  },
};
