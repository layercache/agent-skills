// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import puppeteer from "@cloudflare/puppeteer";
import { PAGES } from "./pages";

export interface Env {
  BROWSER: Fetcher;
  SHOTS: R2Bucket;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(captureAll(env));
  },
} satisfies ExportedHandler<Env>;

async function captureAll(env: Env): Promise<void> {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    for (const target of PAGES) {
      try {
        await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 15_000 });
        const shot = await page.screenshot({ type: "png" });
        await env.SHOTS.put(`${target.id}/latest.png`, shot);
      } catch (err) {
        console.error(`capture failed for ${target.id}`, err);
      }
    }
  } finally {
    await browser.close();
  }
}
