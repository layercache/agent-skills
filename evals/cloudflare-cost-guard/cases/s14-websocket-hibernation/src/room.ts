// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

const MAX_SOCKETS = 100;
const MAX_MESSAGE_CHARS = 4_096;

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      return new Response("room is full", { status: 429 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId: request.headers.get("x-user-id") });
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "sec-websocket-protocol": request.headers.get("sec-websocket-protocol") ?? "" },
    });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string" || message.length > MAX_MESSAGE_CHARS) return;
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== ws) socket.send(message);
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(code, reason);
  }
}
