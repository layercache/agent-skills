import { DurableObject } from "cloudflare:workers";

const HEARTBEAT_MS = 1000;

export class PresenceRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const user = request.headers.get("x-user-id") ?? "anonymous";
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, last_seen INTEGER)"
    );
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO members (id, last_seen) VALUES (?, ?)",
      user,
      Date.now()
    );
    await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
    return Response.json({ ok: true });
  }

  async alarm(): Promise<void> {
    try {
      const members = this.ctx.storage.sql
        .exec("SELECT id, last_seen FROM members")
        .toArray();
      for (const member of members) {
        this.ctx.storage.sql.exec(
          "UPDATE members SET last_seen = last_seen WHERE id = ?",
          member.id
        );
      }
      await this.broadcastPresence(members.length);
    } catch (err) {
      console.error("presence tick failed", err);
      await this.ctx.storage.setAlarm(Date.now());
      return;
    }
    await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
  }

  private async broadcastPresence(count: number): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      ws.send(JSON.stringify({ type: "presence", count }));
    }
  }
}
