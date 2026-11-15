// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

export interface Probe {
  target: string;
  url: string;
  region: string;
  kind: "head" | "get" | "tls";
}

export const REGIONS = ["wnam", "enam", "sam", "weur", "eeur", "apac", "oc", "afr"] as const;
export const KINDS = ["head", "get", "tls"] as const;

export const TARGETS = [
  { id: "www", url: "https://www.acme.example/" },
  { id: "app", url: "https://app.acme.example/healthz" },
  { id: "api", url: "https://api.acme.example/healthz" },
  { id: "api-eu", url: "https://eu.api.acme.example/healthz" },
  { id: "api-ap", url: "https://ap.api.acme.example/healthz" },
  { id: "auth", url: "https://auth.acme.example/healthz" },
  { id: "billing", url: "https://billing.acme.example/healthz" },
  { id: "checkout", url: "https://checkout.acme.example/healthz" },
  { id: "cdn", url: "https://cdn.acme.example/ping.txt" },
  { id: "docs", url: "https://docs.acme.example/" },
  { id: "status", url: "https://status.acme.example/" },
  { id: "blog", url: "https://blog.acme.example/" },
  { id: "search", url: "https://search.acme.example/healthz" },
  { id: "uploads", url: "https://uploads.acme.example/healthz" },
  { id: "images", url: "https://images.acme.example/healthz" },
  { id: "mail", url: "https://mail.acme.example/healthz" },
  { id: "hooks", url: "https://hooks.acme.example/healthz" },
  { id: "admin", url: "https://admin.acme.example/healthz" },
  { id: "partners", url: "https://partners.acme.example/healthz" },
  { id: "reports", url: "https://reports.acme.example/healthz" },
  { id: "export", url: "https://export.acme.example/healthz" },
  { id: "import", url: "https://import.acme.example/healthz" },
  { id: "realtime", url: "https://realtime.acme.example/healthz" },
  { id: "media", url: "https://media.acme.example/healthz" },
  { id: "support", url: "https://support.acme.example/" },
] as const;
