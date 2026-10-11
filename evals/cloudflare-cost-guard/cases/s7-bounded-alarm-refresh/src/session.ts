// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import { CHECKPOINT_TTL_MS, MIN_ALARM_DELAY_MS, checkpointRefreshAt, newCheckpoint, type Checkpoint } from "./checkpoint";

export class TutorSession extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, content TEXT NOT NULL, at INTEGER NOT NULL)"
    );
  }

  async append(role: string, content: string) {
    const now = Date.now();
    this.sql.exec("INSERT INTO messages (role, content, at) VALUES (?, ?, ?)", role, content, now);

    let cp = await this.ctx.storage.get<Checkpoint>("checkpoint");
    if (!cp) {
      cp = newCheckpoint(now);
      await this.ctx.storage.put("checkpoint", cp);
      await this.scheduleRefresh(cp);
    }
    return { ok: true };
  }

  async alarm(): Promise<void> {
    const cp = await this.ctx.storage.get<Checkpoint>("checkpoint");
    if (!cp) return;

    const now = Date.now();
    if (now >= cp.expiresAt) {
      await this.ctx.storage.delete("checkpoint");
      return;
    }

    const lastSeq = this.sql.exec<{ seq: number | null }>("SELECT MAX(seq) AS seq FROM messages").one().seq ?? 0;
    if (now >= checkpointRefreshAt(cp) && lastSeq > cp.snapshotSeq) {
      await this.runAlarm(cp, lastSeq);
    }
    const latest = (await this.ctx.storage.get<Checkpoint>("checkpoint")) ?? cp;
    await this.scheduleRefresh(latest);
  }

  private async runAlarm(cp: Checkpoint, lastSeq: number): Promise<void> {
    const rows = this.sql.exec("SELECT seq, role, content, at FROM messages WHERE seq <= ? ORDER BY seq", lastSeq).toArray();
    const key = `snapshots/${this.ctx.id.toString()}/${Date.now()}.json`;
    await this.env.SNAPSHOTS.put(key, JSON.stringify(rows));
    if (cp.snapshotKey) await this.env.SNAPSHOTS.delete(cp.snapshotKey);
    const refreshedAt = Date.now();
    const next: Checkpoint = {
      ...cp,
      snapshotKey: key,
      snapshotSeq: lastSeq,
      refreshedAt,
      expiresAt: refreshedAt + CHECKPOINT_TTL_MS,
    };
    await this.ctx.storage.put("checkpoint", next);
  }

  private async scheduleRefresh(cp: Checkpoint): Promise<void> {
    const now = Date.now();
    const target = now < checkpointRefreshAt(cp) ? checkpointRefreshAt(cp) : cp.expiresAt;
    await this.ctx.storage.setAlarm(Math.max(target, now + MIN_ALARM_DELAY_MS));
  }
}
