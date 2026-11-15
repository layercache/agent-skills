// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { Agent } from "agents";
import type { Env } from "./index";

interface InboxState {
  lastSyncAt: number;
  unread: number;
}

const POLL_SECONDS = 5;

export class InboxAgent extends Agent<Env, InboxState> {
  initialState: InboxState = { lastSyncAt: 0, unread: 0 };

  async onStart(): Promise<void> {
    this.sql`CREATE TABLE IF NOT EXISTS sync_log (at INTEGER NOT NULL, unread INTEGER NOT NULL)`;
  }

  async onRequest(_request: Request): Promise<Response> {
    await this.schedule(1, "sync", { reason: "request" });
    return Response.json(this.state);
  }

  async sync(_payload: { reason: string }): Promise<void> {
    try {
      const res = await fetch(`${this.env.MAIL_API}/mailboxes/${encodeURIComponent(this.name)}/unread`, {
        headers: { authorization: `Bearer ${this.env.MAIL_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const { unread } = (await res.json()) as { unread: number };
        this.setState({ lastSyncAt: Date.now(), unread });
        this.sql`INSERT INTO sync_log (at, unread) VALUES (${Date.now()}, ${unread})`;
      }
    } finally {
      await this.schedule(POLL_SECONDS, "sync", { reason: "poll" });
    }
  }
}
