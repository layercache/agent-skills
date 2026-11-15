// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

export const PAGES = [
  { id: "home", url: "https://www.rival-one.example/" },
  { id: "pricing", url: "https://www.rival-one.example/pricing" },
  { id: "plans", url: "https://www.rival-two.example/plans" },
  { id: "enterprise", url: "https://www.rival-two.example/enterprise" },
  { id: "changelog", url: "https://www.rival-two.example/changelog" },
  { id: "features", url: "https://www.rival-three.example/features" },
  { id: "compare", url: "https://www.rival-three.example/compare" },
  { id: "signup", url: "https://app.rival-three.example/signup" },
  { id: "docs", url: "https://docs.rival-four.example/" },
  { id: "status", url: "https://status.rival-four.example/" },
  { id: "careers", url: "https://www.rival-four.example/careers" },
  { id: "blog", url: "https://www.rival-five.example/blog" },
] as const;
