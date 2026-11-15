// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

export interface Env {
  ORIGIN: string;
}

const KEY = /^[a-z0-9][a-z0-9/_-]{0,200}\.(jpg|jpeg|png|webp)$/;
const FITS = ["cover", "contain", "scale-down", "crop", "pad"] as const;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const key = url.pathname.slice(1);
    if (request.method !== "GET" || !KEY.test(key)) {
      return new Response("not found", { status: 404 });
    }

    const width = Number(url.searchParams.get("w")) || undefined;
    const height = Number(url.searchParams.get("h")) || undefined;
    const blur = Number(url.searchParams.get("blur")) || undefined;
    const fit = FITS.find((f) => f === url.searchParams.get("fit")) ?? "cover";

    const image = await fetch(`${env.ORIGIN}/${key}`, {
      cf: { image: { width, height, fit, blur, quality: 85, format: "auto" } },
    });
    if (!image.ok) return new Response("not found", { status: 404 });
    return new Response(image.body, {
      headers: {
        "content-type": image.headers.get("content-type") ?? "image/jpeg",
        "cache-control": "public, max-age=86400",
      },
    });
  },
} satisfies ExportedHandler<Env>;
