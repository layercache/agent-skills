// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "./index";

export interface ExportParams {
  accountId: string;
  cursor: string | null;
}

interface ContactPage {
  contacts: { id: string; email: string; name: string }[];
  next: string | null;
}

export class ExportWorkflow extends WorkflowEntrypoint<Env, ExportParams> {
  async run(event: WorkflowEvent<ExportParams>, step: WorkflowStep): Promise<void> {
    const { accountId, cursor } = event.payload;

    const page = await step.do("fetch page", async () => {
      const res = await fetch(
        `${this.env.CRM_API}/accounts/${accountId}/contacts?limit=200&cursor=${encodeURIComponent(cursor ?? "")}`,
        { headers: { authorization: `Bearer ${this.env.CRM_TOKEN}` } }
      );
      if (!res.ok) throw new Error(`crm returned ${res.status}`);
      return (await res.json()) as ContactPage;
    });

    await step.do("store page", async () => {
      await this.env.EXPORTS.put(
        `exports/${accountId}/${cursor ?? "first"}.json`,
        JSON.stringify(page.contacts)
      );
    });

    await step.sleep("pause between pages", "30 seconds");
    await this.env.EXPORT_WORKFLOW.create({
      id: `${accountId}-${crypto.randomUUID()}`,
      params: { accountId, cursor: page.next },
    });
  }
}
