// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

export interface Env {
  EMAIL: SendEmail;
  TOKENS: KVNamespace;
  PER_IP: RateLimit;
  APP_URL: string;
}

const EMAIL_ADDRESS = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/login") {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.PER_IP.limit({ key: ip });
      if (!success) return new Response("slow down", { status: 429 });

      const { email } = await request.json<{ email: string }>();
      if (typeof email !== "string" || !EMAIL_ADDRESS.test(email)) {
        return new Response("invalid email", { status: 400 });
      }

      const token = crypto.randomUUID();
      await env.TOKENS.put(`login:${token}`, email, { expirationTtl: 900 });
      await env.EMAIL.send({
        from: { email: "login@notebird.example", name: "Notebird" },
        to: email,
        subject: "Your sign-in link",
        text: `Open ${env.APP_URL}/verify?token=${token} to sign in. The link works for 15 minutes.`,
      });
      return Response.json({ sent: true });
    }

    if (request.method === "GET" && url.pathname === "/verify") {
      const token = url.searchParams.get("token") ?? "";
      const email = token ? await env.TOKENS.get(`login:${token}`) : null;
      if (!email) return new Response("link expired", { status: 401 });
      await env.TOKENS.delete(`login:${token}`);
      return Response.json({ email });
    }

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
