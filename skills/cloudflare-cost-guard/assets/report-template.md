# Cloudflare Cost Guard report

<!-- Fill every section. Remove these comments. Keep headings in this order. -->

**Repository:** <name or path> · **Branch:** <branch> · **Commit:** <short SHA if available> · **Date:** <YYYY-MM-DD>
**Pricing data:** <one of: "all figures confirmed at developers.cloudflare.com on YYYY-MM-DD" · "bundled snapshot dated 2026-10-10, not re-verified" · "mixed: confirmed on YYYY-MM-DD for <products>; snapshot for <products>">

## Executive summary

- **Overall assessed risk:** <Critical | High | Medium | Low | No material risk found>
- **Autonomous runaway paths found:** <Yes (n) | No> <!-- autonomous findings rated High or Critical -->
- **Findings:** <n> Critical · <n> High · <n> Medium · <n> Low
- **Services detected:** <comma-separated list>
- **Most important actions:**
  1. <action>
  2. <action>
  3. <action>
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
| Location | <path:line> (and other path:line entries on the path) |
| Trigger | <how it starts: request to /route, cron "* * * * *", alarm, queue message> |
| Exposure | <autonomous / externally drivable / credential-gated (which credential)> |
| Call path | <entrypoint → function → billable operation> |
| Scenario | <how usage runs away, what it grows with, whether it continues without users> |
| Existing safeguards | <verified in code with file:line, or "none found"> |
| Protection status | <verified in code / platform-enforced / account setting to verify / unknown> |
| Recommendation | <the safeguard that is missing and where it belongs; no code> |

## Reviewed and not flagged

<!-- Notable leads you dismissed, with one line each on why they are bounded. -->

- <path:line>: <why it is bounded>

## Plan assumptions

<Which plan the code or docs indicate, or "unknown". For findings whose impact differs, say what happens on Free (errors past a daily limit, or not available) and on Workers Paid (billed).>

## Manual Cloudflare dashboard checklist

<!-- From references/account-controls.md, keep rows relevant to the inventory. -->

- [ ] <check>

## Prioritized remediation

1. <highest-impact change, linked to finding IDs>
2. <next>

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

<!-- "file"/"line" is the main location; "locations" lists every location on the path. "autonomous" is true when the path runs without any user or external request. "autonomous_runaway_paths" is true only if some finding is autonomous and rated High or Critical. -->

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
      "exposure": "<autonomous|external|credential>",
      "autonomous": false,
      "title": "<short title>"
    }
  ]
}
```
