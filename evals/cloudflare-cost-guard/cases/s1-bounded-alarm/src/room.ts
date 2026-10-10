// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { DurableObject } from "cloudflare:workers";

const MIN_INTERVAL_MS = 30_000;
const MEMBER_TTL_MS = 5 * 60_000;
const MAX_TICKS_WITHOUT_ACTIVITY = 20;
const MAX_CONSECUTIVE_FAILURES = 3;

export class PresenceRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const user = request.headers.get("x-user-id") ?? "anonymous";
    this.ensureSchema();
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO members (id, last_seen) VALUES (?, ?)",
      user,
      Date.now()
    );
    await this.ctx.storage.put("idleTicks", 0);
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + MIN_INTERVAL_MS);
    }
    return Response.json({ ok: true });
  }

  async alarm(): Promise<void> {
    this.ensureSchema();
    const failures = (await this.ctx.storage.get<number>("failures")) ?? 0;
    const idleTicks = ((await this.ctx.storage.get<number>("idleTicks")) ?? 0) + 1;

    if (failures >= MAX_CONSECUTIVE_FAILURES || idleTicks > MAX_TICKS_WITHOUT_ACTIVITY) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    try {
      this.ctx.storage.sql.exec(
        "DELETE FROM members WHERE last_seen < ?",
        Date.now() - MEMBER_TTL_MS
      );
      const [{ active }] = this.ctx.storage.sql
        .exec<{ active: number }>("SELECT COUNT(*) AS active FROM members")
        .toArray();
      if (active === 0) {
        await this.ctx.storage.deleteAlarm();
        return;
      }
      for (const ws of this.ctx.getWebSockets()) {
        ws.send(JSON.stringify({ type: "presence", count: active }));
      }
      await this.ctx.storage.put({ failures: 0, idleTicks });
    } catch (err) {
      console.error("presence tick failed", err);
      await this.ctx.storage.put("failures", failures + 1);
    }

    await this.ctx.storage.setAlarm(Date.now() + MIN_INTERVAL_MS);
  }

  private ensureSchema(): void {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, last_seen INTEGER)"
    );
  }
}
