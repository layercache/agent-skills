// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

export interface Coordinates {
  lat: number;
  lon: number;
}

const RETRY_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function geocode(address: string, apiKey: string): Promise<Coordinates> {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const res = await fetch(
        `https://geocoder.example.net/v1/search?q=${encodeURIComponent(address)}&key=${apiKey}`
      );
      if (res.ok) {
        return (await res.json()) as Coordinates;
      }
      console.warn(`geocode attempt ${attempt} failed with ${res.status}`);
    } catch (err) {
      console.warn(`geocode attempt ${attempt} threw`, err);
    }
    await sleep(RETRY_DELAY_MS);
  }
}
