// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { Env } from "./index";

export interface ExportParams {
  accountId: string;
}

interface ContactPage {
  contacts: { id: string; email: string; name: string }[];
  next: string | null;
}

const MAX_PAGES = 200;

export class ExportWorkflow extends WorkflowEntrypoint<Env, ExportParams> {
  async run(event: WorkflowEvent<ExportParams>, step: WorkflowStep): Promise<void> {
    const { accountId } = event.payload;
    let cursor: string | null = null;

    for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
      const page: ContactPage = await step.do(
        `fetch page ${pageNumber}`,
        { retries: { limit: 4, delay: "10 seconds", backoff: "exponential" }, timeout: "1 minute" },
        async () => {
          const res = await fetch(
            `${this.env.CRM_API}/accounts/${accountId}/contacts?limit=200&cursor=${encodeURIComponent(cursor ?? "")}`,
            { headers: { authorization: `Bearer ${this.env.CRM_TOKEN}` } }
          );
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            throw new NonRetryableError(`crm rejected the request with ${res.status}`);
          }
          if (!res.ok) throw new Error(`crm returned ${res.status}`);
          return (await res.json()) as ContactPage;
        }
      );

      await step.do(`store page ${pageNumber}`, async () => {
        await this.env.EXPORTS.put(
          `exports/${accountId}/${String(pageNumber).padStart(4, "0")}.json`,
          JSON.stringify(page.contacts)
        );
      });

      if (!page.next) return;
      cursor = page.next;
      await step.sleep(`pause after page ${pageNumber}`, "30 seconds");
    }
  }
}
