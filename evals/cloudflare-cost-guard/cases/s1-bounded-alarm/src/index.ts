import { PresenceRoom } from "./room";

export { PresenceRoom };

interface Env {
  PRESENCE: DurableObjectNamespace<PresenceRoom>;
  DB: D1Database;
  PER_USER: RateLimit;
}

const ROOM_NAME = /^[a-z0-9-]{1,32}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) {
      return new Response("unauthorized", { status: 401 });
    }
    const session = await env.DB.prepare(
      "SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?"
    )
      .bind(token, Date.now())
      .first<{ user_id: string }>();
    if (!session) {
      return new Response("unauthorized", { status: 401 });
    }
    const { success } = await env.PER_USER.limit({ key: session.user_id });
    if (!success) {
      return new Response("rate limited", { status: 429 });
    }
    const membership = env.DB.prepare(
      "SELECT 1 FROM room_members WHERE room = ? AND user_id = ?"
    );

    const roomName = new URL(request.url).searchParams.get("room") ?? "lobby";
    if (!ROOM_NAME.test(roomName)) {
      return new Response("invalid room", { status: 400 });
    }
    if (!(await membership.bind(roomName, session.user_id).first())) {
      return new Response("not a member of this room", { status: 403 });
    }
    const forwarded = new Request(request, { headers: { "x-user-id": session.user_id } });
    const stub = env.PRESENCE.get(env.PRESENCE.idFromName(roomName));
    return stub.fetch(forwarded);
  },
};
