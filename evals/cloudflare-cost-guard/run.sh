#!/usr/bin/env bash
# Run the cloudflare-cost-guard evals with a local agent CLI, then grade them.
#
#   AGENT_CMD='claude -p' ./run.sh            # all cases
#   AGENT_CMD='codex exec' ./run.sh v1-do-alarm-reschedule
#
# AGENT_CMD must accept the prompt as its last argument and print the agent's
# final answer to stdout. Each case is copied to a fresh temporary directory
# without expected.json, so the agent never sees the answers. Reports land in
# results/<timestamp>/ (git-ignored). Agent runs cost model usage; nothing
# here touches Cloudflare.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$HERE/../../skills/cloudflare-cost-guard" && pwd)"
: "${AGENT_CMD:?set AGENT_CMD, for example AGENT_CMD='claude -p'}"

OUT="$HERE/results/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"
PROMPT="$(sed "s|{{SKILL_DIR}}|$SKILL_DIR|g" "$HERE/prompt.md")"

if [ "$#" -gt 0 ]; then cases=("$@"); else
  cases=(); for d in "$HERE"/cases/*/; do cases+=("$(basename "$d")"); done
fi

for name in "${cases[@]}"; do
  work="$(mktemp -d)"
  cp -R "$HERE/cases/$name/." "$work/"
  rm -f "$work/expected.json"
  # Configs are stored as *.fixture so nobody can deploy a case from the repo.
  for cfg in "$work"/wrangler.*.fixture; do mv "$cfg" "${cfg%.fixture}"; done
  git -C "$work" init -q
  echo "running $name"
  # shellcheck disable=SC2086 # AGENT_CMD is intentionally word-split
  (cd "$work" && $AGENT_CMD "$PROMPT") > "$OUT/$name.md" || echo "agent exited non-zero for $name"
  rm -rf "$work"
done

python3 "$HERE/evaltool.py" grade-all "$OUT"
