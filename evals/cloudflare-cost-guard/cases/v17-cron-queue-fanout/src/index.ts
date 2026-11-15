// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { TARGETS, REGIONS, KINDS, type Probe } from "./targets";

export interface Env {
  PROBES: Queue<Probe>;
  DB: D1Database;
  ALERT_WEBHOOK: string;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const probes: Probe[] = [];
    for (const target of TARGETS) {
      for (const region of REGIONS) {
        for (const kind of KINDS) {
          probes.push({ target: target.id, url: target.url, region, kind });
        }
      }
    }
    for (let i = 0; i < probes.length; i += 100) {
      await env.PROBES.sendBatch(probes.slice(i, i + 100).map((body) => ({ body })));
    }
  },

  async queue(batch: MessageBatch<Probe>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const probe = msg.body;
      const res = await fetch(probe.url, {
        method: probe.kind === "head" ? "HEAD" : "GET",
        headers: { "x-probe-region": probe.region },
        signal: AbortSignal.timeout(8_000),
      }).catch(() => null);
      const up = res !== null && res.status < 500 ? 1 : 0;

      const row = await env.DB.prepare("SELECT up FROM target_state WHERE target = ? AND region = ? AND kind = ?")
        .bind(probe.target, probe.region, probe.kind)
        .first<{ up: number }>();
      if (row && row.up !== up) {
        await env.DB.prepare(
          "UPDATE target_state SET up = ?, changed_at = ? WHERE target = ? AND region = ? AND kind = ?"
        )
          .bind(up, Date.now(), probe.target, probe.region, probe.kind)
          .run();
        await fetch(env.ALERT_WEBHOOK, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target: probe.target, region: probe.region, kind: probe.kind, up }),
          signal: AbortSignal.timeout(8_000),
        }).catch(() => null);
      }
      msg.ack();
    }
  },
} satisfies ExportedHandler<Env, Probe>;
