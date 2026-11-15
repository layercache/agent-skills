// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

export interface Coordinates {
  lat: number;
  lon: number;
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function geocode(address: string, apiKey: string): Promise<Coordinates | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(
      `https://geocoder.example.net/v1/search?q=${encodeURIComponent(address)}&key=${apiKey}`,
      { signal: AbortSignal.timeout(5_000) }
    ).catch(() => null);
    if (res?.ok) {
      return (await res.json()) as Coordinates;
    }
    if (res && res.status >= 400 && res.status < 500 && res.status !== 429) {
      return null;
    }
    if (attempt < MAX_ATTEMPTS) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  return null;
}
