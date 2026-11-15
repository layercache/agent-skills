#!/usr/bin/env bash
# Run the cloudflare-cost-guard evals with a local agent CLI, then grade them.
#
#   AGENT_CMD='claude -p' ./run.sh                        # all cases, once
#   AGENT_CMD='codex exec' ./run.sh v1-do-alarm-reschedule
#   TRIALS=3 JOBS=4 AGENT_CMD='claude -p' ./run.sh        # three runs per case, four at a time
#
# AGENT_CMD must accept the prompt as its last argument and print the agent's
# final answer to stdout. Each case is copied to a fresh temporary directory
# without expected.json, so the agent never sees the answers. The skill is
# read-only, so after each run the copy is checked: any change to it fails that
# run. Reports land in results/<timestamp>/ (git-ignored) with a scorecard.md.
# Agent runs cost model usage; nothing here touches Cloudflare.
#
#   TRIALS       runs per case (default 1). Agent output varies, so use 3 before a release.
#   JOBS         cases to run at the same time (default 1).
#   AGENT_LABEL  name recorded in the scorecard (default: the first word of AGENT_CMD).
#   OUT          results directory (default results/<timestamp>).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$HERE/../../skills/cloudflare-cost-guard" && pwd)"
: "${AGENT_CMD:?set AGENT_CMD, for example AGENT_CMD='claude -p'}"
TRIALS="${TRIALS:-1}"
JOBS="${JOBS:-1}"
AGENT_LABEL="${AGENT_LABEL:-$(basename "${AGENT_CMD%% *}")}"

OUT="${OUT:-$HERE/results/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT"
PROMPT_TEMPLATE="$(cat "$HERE/prompt.md")"
PROMPT="${PROMPT_TEMPLATE//\{\{SKILL_DIR\}\}/"$SKILL_DIR"}"

if [ "$#" -gt 0 ]; then cases=("$@"); else
  cases=(); for d in "$HERE"/cases/*/; do cases+=("$(basename "$d")"); done
fi

run_one() { # run_one <case> <directory for its report>
  local name="$1" dir="$2" work head changed
  work="$(mktemp -d)"
  cp -R "$HERE/cases/$name/." "$work/"
  rm -f "$work/expected.json"
  # Configs are stored as *.fixture so nobody can deploy a case from the repo.
  # The do-not-deploy notice is stripped too, so it cannot hint at the answer.
  python3 "$HERE/evaltool.py" strip "$work"
  find "$work" -name 'wrangler.*.fixture' | while IFS= read -r cfg; do mv "$cfg" "${cfg%.fixture}"; done
  git -C "$work" init -q
  git -C "$work" add -A
  git -C "$work" -c user.name=dev -c user.email=dev@example.com commit -qm "Initial commit"
  head="$(git -C "$work" rev-parse HEAD)"
  # shellcheck disable=SC2086 # AGENT_CMD is intentionally word-split
  (cd "$work" && $AGENT_CMD "$PROMPT") > "$dir/$name.md" 2> "$dir/$name.stderr" \
    || echo "agent exited non-zero for $name (see $dir/$name.stderr)" >&2
  [ -s "$dir/$name.stderr" ] || rm -f "$dir/$name.stderr"
  # The audited copy must be exactly as the agent found it.
  changed="$(git -C "$work" status --porcelain; git -C "$work" stash list)"
  [ "$(git -C "$work" rev-parse HEAD)" = "$head" ] || changed="$changed"$'\n'"HEAD moved"
  if [ -n "$changed" ]; then printf '%s\n' "$changed" > "$dir/$name.modified"; fi
  rm -rf "$work"
}

# Record what this run is meant to hold before any agent starts. The grader fails a run
# whose report is missing, so a run that stops early cannot pass on the reports it has.
python3 - "$OUT/meta.json" "$SKILL_DIR/SKILL.md" "$AGENT_LABEL" "$TRIALS" \
  "$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo unknown)" "${cases[@]}" <<'PY'
import datetime, json, re, sys
out, skill, agent, trials, commit, *cases = sys.argv[1:]
version = re.search(r'^\s*version:\s*"?([^"\n]+)"?', open(skill, encoding="utf-8").read(), re.MULTILINE)
json.dump({
    "skill_version": version.group(1) if version else "unknown",
    "commit": commit,
    "date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"),
    "agent": agent,
    "trials": int(trials),
    "cases": cases,
}, open(out, "w", encoding="utf-8"), indent=2)
PY

for trial in $(seq 1 "$TRIALS"); do
  if [ "$TRIALS" -gt 1 ]; then dir="$OUT/run-$trial"; else dir="$OUT"; fi
  mkdir -p "$dir"
  for name in "${cases[@]}"; do
    while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do sleep 1; done
    if [ "$TRIALS" -gt 1 ]; then echo "running $name (run $trial of $TRIALS)"; else echo "running $name"; fi
    run_one "$name" "$dir" &
  done
done
wait

python3 "$HERE/evaltool.py" scorecard "$OUT" > "$OUT/scorecard.md"
echo "scorecard: $OUT/scorecard.md"
python3 "$HERE/evaltool.py" grade-all "$OUT"
