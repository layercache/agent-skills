// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

const TICK_MS = 60_000;
const MAX_JOBS = 50;
const JOBS_PER_TICK = 10;
const JOB_NAME = /^[a-z0-9-]{1,40}$/;
const ALLOWED_HOSTS = new Set(["jobs.internal.example", "reports.internal.example"]);

interface Job {
  name: string;
  target: string;
  every_minutes: number;
  next_run_at: number;
}

export class Scheduler extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS jobs (
         name TEXT PRIMARY KEY,
         target TEXT NOT NULL,
         every_minutes INTEGER NOT NULL,
         next_run_at INTEGER NOT NULL,
         last_status INTEGER
       )`
    );
    this.sql.exec("CREATE INDEX IF NOT EXISTS jobs_next_run ON jobs (next_run_at)");
  }

  async upsertJob(name: string, target: string, everyMinutes: number) {
    if (!JOB_NAME.test(name)) return { error: "invalid name" };
    if (!ALLOWED_HOSTS.has(new URL(target).hostname)) return { error: "target not allowed" };
    const every = Math.min(Math.max(Math.floor(everyMinutes), 1), 1440);

    const known = this.sql.exec("SELECT 1 FROM jobs WHERE name = ?", name).toArray().length > 0;
    if (!known) {
      const [{ n }] = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM jobs").toArray();
      if (n >= MAX_JOBS) return { error: "too many jobs" };
    }
    this.sql.exec(
      `INSERT INTO jobs (name, target, every_minutes, next_run_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET target = excluded.target, every_minutes = excluded.every_minutes`,
      name, target, every, Date.now() + every * 60_000
    );
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    }
    return { ok: true };
  }

  async removeJob(name: string) {
    this.sql.exec("DELETE FROM jobs WHERE name = ?", name);
    return { ok: true };
  }

  async listJobs() {
    return this.sql
      .exec("SELECT name, target, every_minutes, next_run_at, last_status FROM jobs ORDER BY name")
      .toArray();
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    try {
      const due = this.sql
        .exec<Job>(
          "SELECT name, target, every_minutes, next_run_at FROM jobs WHERE next_run_at <= ? ORDER BY next_run_at LIMIT ?",
          now, JOBS_PER_TICK
        )
        .toArray();
      for (const job of due) {
        const res = await fetch(job.target, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => null);
        this.sql.exec(
          "UPDATE jobs SET next_run_at = ?, last_status = ? WHERE name = ?",
          now + job.every_minutes * 60_000, res?.status ?? 0, job.name
        );
      }
    } catch (err) {
      console.error("scheduler tick failed", err);
    }
    await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }
}
