// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

interface Env {
  AI: Ai;
  KB: KVNamespace;
}

type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM_PROMPT =
  "You are a support agent. To look something up, reply with SEARCH: <query>. " +
  "When you have a complete answer, reply with FINAL: <answer>.";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { question } = (await request.json()) as { question: string };
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: question },
    ];

    while (true) {
      const result = (await env.AI.run(MODEL, { messages })) as { response: string };
      const reply = result.response.trim();
      messages.push({ role: "assistant", content: reply });

      if (reply.startsWith("FINAL:")) {
        return Response.json({ answer: reply.slice(6).trim() });
      }

      const query = reply.startsWith("SEARCH:") ? reply.slice(7).trim() : reply;
      const article = (await env.KB.get(`article:${query.toLowerCase()}`)) ?? "No article found.";
      messages.push({ role: "tool", content: article });
    }
  },
};
