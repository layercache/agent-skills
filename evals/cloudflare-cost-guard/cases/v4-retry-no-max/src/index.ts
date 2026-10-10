import { geocode } from "./geocode";

interface Env {
  GEOCODER_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const address = url.searchParams.get("address");
    if (!address) {
      return new Response("missing address", { status: 400 });
    }
    const coords = await geocode(address, env.GEOCODER_KEY);
    return Response.json(coords);
  },
};
