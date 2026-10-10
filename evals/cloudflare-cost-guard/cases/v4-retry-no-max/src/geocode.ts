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
