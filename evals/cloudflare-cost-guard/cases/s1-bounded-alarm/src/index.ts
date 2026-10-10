import { PresenceRoom } from "./room";

export { PresenceRoom };

interface Env {
  PRESENCE: DurableObjectNamespace<PresenceRoom>;
}

const ROOM_NAME = /^[a-z0-9-]{1,32}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const userId = request.headers.get("x-user-id");
    if (!userId) {
      return new Response("unauthorized", { status: 401 });
    }
    const roomName = new URL(request.url).searchParams.get("room") ?? "lobby";
    if (!ROOM_NAME.test(roomName)) {
      return new Response("invalid room", { status: 400 });
    }
    const stub = env.PRESENCE.get(env.PRESENCE.idFromName(roomName));
    return stub.fetch(request);
  },
};
