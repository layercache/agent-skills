# Cloudflare Cost Guard report

<!-- Fill every section. Remove these comments. Keep headings in this order. -->

**Repository:** <name or path> · **Commit:** <short SHA if available> · **Date:** <YYYY-MM-DD>
**Pricing data:** <"confirmed at developers.cloudflare.com on YYYY-MM-DD" or "bundled snapshot dated 2026-10-10, not re-verified">

## Executive summary

- **Overall assessed risk:** <Critical | High | Medium | Low | No material risk found>
- **Autonomous runaway paths found:** <Yes (n) | No>
- **Findings:** <n> Critical · <n> High · <n> Medium · <n> Low
- **Services detected:** <comma-separated list>
- **Most important actions:**
  1. <action>
  2. <action>
  3. <action>
- **Scope and limitations:** <what was reviewed, exclusions applied, what could not be verified>

## Service inventory

| Service | Configured in | Used by (file:line) | Triggered by | Billable on |
| ------- | ------------- | ------------------- | ------------ | ----------- |
| <Durable Objects> | <wrangler.jsonc:12> | <src/room.ts:40> | <user request / cron / alarm / queue / self> | <requests, duration, SQLite rows> |

## Findings

<!-- One block per finding, ordered by severity. IDs: CG-1, CG-2, ... -->

### CG-1 <short title>

| Field | Detail |
| ----- | ------ |
| Severity | <Critical/High/Medium/Low> |
| Confidence | <High/Medium/Low> |
| Service | <product> |
| Location | <path:line> (and other path:line entries on the path) |
| Trigger | <how it starts: request to /route, cron "* * * * *", alarm, queue message> |
| Call path | <entrypoint → function → billable operation> |
| Scenario | <how usage runs away, what it grows with, whether it continues without users> |
| Existing safeguards | <verified in code with file:line, or "none found"> |
| Protection status | <verified in code / platform-enforced / account setting to verify / unknown> |
| Recommendation | <the safeguard that is missing and where it belongs; no code> |

## Reviewed and not flagged

<!-- Notable leads you dismissed, with one line each on why they are bounded. -->

- <path:line>: <why it is bounded>

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
      "service": "<service>",
      "file": "<path relative to repo root>",
      "line": 0,
      "autonomous": false,
      "title": "<short title>"
    }
  ]
}
```
