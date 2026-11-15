// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import type { Env } from "./index";

export interface Customer {
  id: string;
}

export async function authenticate(request: Request, env: Env): Promise<Customer | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  return env.SESSIONS.get<Customer>(`session:${token}`, "json");
}
