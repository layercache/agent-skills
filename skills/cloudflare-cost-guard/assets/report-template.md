# Cloudflare Cost Guard report

<!-- Keep headings in this order and remove these comments. Drop a section that would be empty, except "At a glance", "Findings" (write "None"), "Before you change anything" and "Machine-readable summary". -->

**Repository:** <name or path> · **Branch:** <branch, or "not a Git checkout"> · **Commit:** <short SHA, or "not a Git checkout"> · **Date:** <YYYY-MM-DD>
**Pricing data:** <one of: "all figures confirmed at developers.cloudflare.com on YYYY-MM-DD" · "bundled snapshot dated 2026-10-10, not re-verified" · "mixed: confirmed on YYYY-MM-DD for <products>; snapshot for <products>">

## At a glance

<!-- Up to four lines, then the top-actions table (at most 3 rows, the first rows of "Prioritized remediation"). -->

- **Overall risk:** <Critical | High | Medium | Low | None> · <n> Critical · <n> High · <n> Medium · <n> Low <!-- the highest as-deployed finding severity; "None" when there are no findings -->
- **Autonomous runaway paths:** <Yes (n) | No> <!-- autonomous findings rated High or Critical -->
- **Worst finding at a stated rate:** <CG-n: operations per stated volume × documented rate, e.g. "per 1M junk requests: ~2M D1 rows written ≈ $2 at $1.00/M (snapshot 2026-10-10)"; or "no findings">
- **Changes since <previous commit>:** <n new (CG-n …) · n fixed (title …) · n re-rated (CG-n: old → new, reason) · n unchanged> <!-- only when the user provided a previous report; otherwise omit this line -->

| # | Action | Fixes | Where | When |
| - | ------ | ----- | ----- | ---- |
| 1 | <action, one line> | <CG-n or Global> | <file:line or config key> | <Now / Before launch / Before enabling X / Later> |

## Executive summary

- **Services detected:** <comma-separated list>
- **Scope and limitations:** <branch and commit reviewed, exclusions applied, out-of-scope repos or Workers, what could not be verified>

## Service inventory

| Service | Configured in | Used by (file:line) | Triggered by | Billable on |
| ------- | ------------- | ------------------- | ------------ | ----------- |
| <Durable Objects> | <wrangler.jsonc:12> | <src/room.ts:40> | <user request / cron / alarm / queue / self> | <requests, duration, SQLite rows> |

**Public entry points:** <each Worker's custom domains, routes, `workers.dev` (on/off/default), preview URLs, and which routes need authentication>

## Findings

<!-- One block per finding, ordered by severity. IDs: CG-1, CG-2, ... -->

### CG-1 <short title>

| Field | Detail |
| ----- | ------ |
| Severity | <Critical/High/Medium/Low> |
| Confidence | <High/Medium/Low> |
| Service | <product, or several> |
| Location | <path:line> (and other path:line entries on the path; for a config-only finding, the line of the relevant key) |
| Trigger | <how it starts: request to /route, cron "* * * * *", alarm, queue message> |
| Exposure | <autonomous / externally drivable / credential-gated (which credential) / n/a (missing global safeguard)> |
| Call path | <entrypoint → function → billable operation> |
| Scenario | <how usage runs away, what it grows with, whether it continues without users> |
| Gated by | <flag, variable or secret that switches the path on or off (not an auth credential; that goes under Exposure), its value in the repository config ("off in wrangler.jsonc", "not visible: secret"), and the severity if flipped; "none" when the path is always live> |
| Existing safeguards | <verified in code with file:line, or "none found"> |
| Cost at a stated rate | <operations per stated volume (per 1M outside requests, per day, per run) × documented rate, with source and date; "not documented" with the reason when there is no rate. Never a total bill.> |
| Protection status | <verified in code / platform-enforced / account setting to verify / unknown> |
| Recommendation | <the safeguard that is missing and where it belongs; no code> |

## Global safeguards

<!-- One line each: kill switch for autonomous handlers, retention for growing data, public hostnames (`workers.dev`, preview URLs) and per-user limits. Also note here the linear cost of being public (about one cheap operation per request with retention in place) instead of filing it as a finding. -->

- <safeguard>: <present at file:line / missing (CG-n) / missing, defense in depth only (no finding) / missing, nothing it would protect>

## Reviewed and not flagged

<!-- Notable leads you dismissed, with one line each on why they are bounded. -->

- <path:line>: <why it is bounded>

## Plan assumptions

<Which plan the code or docs indicate, or "unknown". For findings whose impact differs, say what happens on Free (errors past a daily limit, or not available) and on Workers Paid (billed).>

## Manual Cloudflare dashboard checklist

<!-- From references/account-controls.md, keep rows relevant to the inventory. -->

- [ ] <check>

## Prioritized remediation

<!-- Every action, most urgent first. The first three rows are the "At a glance" table. -->

| # | Action | Fixes | Where | When |
| - | ------ | ----- | ----- | ---- |
| 1 | <action, one line> | <CG-n or Global> | <file:line or config key> | <Now / Before launch / Before enabling X / Later> |

## Unverified risks and evidence gaps

- <what could not be confirmed from the repository and why>

## Recommended follow-up (optional, requires your approval)

- <dynamic tests or monitoring the user may choose to run in a non-production account>

## Conclusion

<Two to four sentences. If no material problems were found, say so and state that this does not guarantee the application is safe.>

## Before you change anything

This audit is a static review of source code. It cannot see your account settings, your traffic, or code that is not in this repository, and it can miss problems.

Any fix for these findings changes exactly the code paths that can generate cost. Whether you write the fix yourself or ask an AI agent to, review every change line by line, test it in a non-production Cloudflare account with budget alerts set, and watch usage after deploying. Budget alerts notify you; they do not stop usage. After making changes, run this audit again on the changed code.

## Machine-readable summary

<!-- "file"/"line" is the main location; "locations" lists every location on the path. "autonomous" is true when the path keeps running with no further outside input. "exposure" is "n/a" only for a missing global safeguard filed on its own. "autonomous_runaway_paths" is true only if some finding is autonomous and rated High or Critical. "severity" is as deployed (the setting the repository config shows); "gated_by" is "<setting>=<value in the repository>", for example "AGENT_ENABLED=false" or "SYNC_ENABLED=not visible (secret)" (null when always live) and "severity_if_enabled" is the severity when that setting flips (null when not gated). "actions" mirrors the "Prioritized remediation" table: "fixes" is a list of finding IDs or "Global"; "when" is one of "Now", "Before launch", "Before enabling <X>", "Later". Omit "changes_since" entirely unless the user provided a previous report; then "new" and "fixed" list finding titles, "rerated" lists {"title", "from", "to", "reason"}, and "unchanged" counts findings present in both runs at the same severity. Service names: Workers, Pages Functions, Durable Objects, D1, KV, R2, Queues, Workflows, Cron Triggers, Workers AI, AI Gateway, Browser Run, Containers, Hyperdrive, Vectorize, Email Service, Workers Logs, or "Third-party: <provider>". Safeguards such as the Rate Limiting binding are not services. -->

```json
{
  "cost_guard_report": 1,
  "overall_risk": "<Critical|High|Medium|Low|None>",
  "autonomous_runaway_paths": false,
  "services": ["<service>"],
  "findings": [
    {
      "id": "CG-1",
      "severity": "<Critical|High|Medium|Low>",
      "confidence": "<High|Medium|Low>",
      "service": "<primary service>",
      "services": ["<every service involved>"],
      "file": "<primary path relative to repo root>",
      "line": 0,
      "locations": [{ "file": "<path>", "line": 0 }],
      "exposure": "<autonomous|external|credential|n/a>",
      "autonomous": false,
      "gated_by": null,
      "severity_if_enabled": null,
      "title": "<short title>"
    }
  ],
  "actions": [
    {
      "id": 1,
      "action": "<one line>",
      "fixes": ["CG-1"],
      "where": "<file:line or config key>",
      "when": "<Now|Before launch|Before enabling X|Later>"
    }
  ],
  "changes_since": {
    "previous_commit": "<short SHA from the previous report>",
    "new": ["<title>"],
    "fixed": ["<title>"],
    "rerated": [{ "title": "<title>", "from": "<severity>", "to": "<severity>", "reason": "<one line>" }],
    "unchanged": 0
  }
}
```
