// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import {
  ALARM_INTERVAL_MS,
  DELIVERY_BATCH,
  HISTORY_RETENTION_MS,
  MAX_ATTEMPTS,
  MAX_WAITING_PER_ACCOUNT,
  SCHEMA,
  WAITING_STATES,
} from "./schema";

const WAITING_LIST = WAITING_STATES.map((s) => `'${s}'`).join(", ");

export class SaveQueue extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      for (const statement of SCHEMA) this.sql.exec(statement);
    });
  }

  async enqueue(userId: string, body: string): Promise<{ id: string } | { error: string }> {
    this.pruneHistory();
    const waiting = this.waitingCount(userId);
    if (waiting >= MAX_WAITING_PER_ACCOUNT) return { error: "queue full" };

    const id = crypto.randomUUID();
    const now = Date.now();
    this.sql.exec(
      "INSERT INTO deliveries (id, user_id, state, payload, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?, ?)",
      id, userId, body, now, now
    );
    this.sql.exec(
      "INSERT OR REPLACE INTO local_saves (id, user_id, body, updated_at) VALUES (?, ?, ?, ?)",
      id, userId, body, now
    );
    await this.ensureAlarm();
    return { id };
  }

  async cancel(userId: string, id: string): Promise<{ ok: boolean }> {
    this.pruneHistory();
    const cursor = this.sql.exec(
      `UPDATE deliveries SET state = 'cancelled', updated_at = ? WHERE id = ? AND user_id = ? AND state IN (${WAITING_LIST})`,
      Date.now(), id, userId
    );
    return { ok: cursor.rowsWritten > 0 };
  }

  async list(userId: string) {
    this.pruneHistory();
    return {
      waiting: this.waitingCount(userId),
      items: this.sql
        .exec(
          "SELECT id, state, created_at FROM deliveries WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
          userId
        )
        .toArray(),
    };
  }

  async registerDevice(userId: string, pushToken: string, label: string) {
    const id = crypto.randomUUID();
    this.sql.exec(
      "INSERT INTO devices (id, user_id, push_token, label, created_at) VALUES (?, ?, ?, ?, ?)",
      id, userId, pushToken, label, Date.now()
    );
    return { id };
  }

  async alarm(): Promise<void> {
    this.pruneHistory();
    const batch = this.sql
      .exec<{ id: string; user_id: string; payload: string; attempts: number }>(
        `SELECT id, user_id, payload, attempts FROM deliveries WHERE state IN (${WAITING_LIST}) ORDER BY created_at LIMIT ?`,
        DELIVERY_BATCH
      )
      .toArray();

    for (const item of batch) {
      const devices = this.sql
        .exec<{ push_token: string }>("SELECT push_token FROM devices WHERE user_id = ?", item.user_id)
        .toArray();
      const res = await fetch(this.env.WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, payload: item.payload, devices: devices.map((d) => d.push_token) }),
      });
      const now = Date.now();
      if (res.ok) {
        this.sql.exec("UPDATE deliveries SET state = 'delivered', updated_at = ? WHERE id = ?", now, item.id);
      } else if (item.attempts + 1 >= MAX_ATTEMPTS) {
        this.sql.exec("UPDATE deliveries SET state = 'failed', updated_at = ? WHERE id = ?", now, item.id);
      } else {
        this.sql.exec(
          "UPDATE deliveries SET state = 'retry', attempts = attempts + 1, updated_at = ? WHERE id = ?",
          now, item.id
        );
      }
    }

    const [{ remaining }] = this.sql
      .exec<{ remaining: number }>(`SELECT COUNT(*) AS remaining FROM deliveries WHERE state IN (${WAITING_LIST})`)
      .toArray();
    if (remaining > 0) await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
  }

  private waitingCount(userId: string): number {
    const [{ n }] = this.sql
      .exec<{ n: number }>(
        `SELECT COUNT(*) AS n FROM deliveries WHERE user_id = ? AND state IN (${WAITING_LIST})`,
        userId
      )
      .toArray();
    return n;
  }

  private pruneHistory(): void {
    const [{ oldest }] = this.sql
      .exec<{ oldest: number | null }>(
        `SELECT MIN(updated_at) AS oldest FROM deliveries WHERE state NOT IN (${WAITING_LIST})`
      )
      .toArray();
    const cutoff = Date.now() - HISTORY_RETENTION_MS;
    if (oldest !== null && oldest <= cutoff) {
      this.sql.exec(`DELETE FROM deliveries WHERE state NOT IN (${WAITING_LIST}) AND updated_at <= ?`, cutoff);
    }
    this.sql.exec("DELETE FROM local_saves WHERE updated_at <= ?", cutoff);
  }

  private async ensureAlarm(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }
}
