import { PresenceRoom } from "./room";

export { PresenceRoom };

interface Env {
  PRESENCE: DurableObjectNamespace<PresenceRoom>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const roomName = url.searchParams.get("room") ?? "lobby";
    const stub = env.PRESENCE.get(env.PRESENCE.idFromName(roomName));
    return stub.fetch(request);
  },
};
