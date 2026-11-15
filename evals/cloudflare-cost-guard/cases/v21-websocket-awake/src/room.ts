// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

const PING_MS = 15_000;
const MAX_MESSAGE_CHARS = 4_096;

export class Room extends DurableObject<Env> {
  private sockets = new Set<WebSocket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    setInterval(() => this.broadcast(JSON.stringify({ type: "ping", at: Date.now() })), PING_MS);
  }

  async fetch(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sockets.add(server);

    server.addEventListener("message", (event) => {
      if (typeof event.data !== "string" || event.data.length > MAX_MESSAGE_CHARS) return;
      this.broadcast(event.data, server);
    });
    const drop = () => this.sockets.delete(server);
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(message: string, except?: WebSocket): void {
    for (const socket of this.sockets) {
      if (socket === except) continue;
      try {
        socket.send(message);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }
}
