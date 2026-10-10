#!/usr/bin/env bash
# Validate the template and every skill under skills/ against the Agent Skills
# specification (https://agentskills.io/specification) using the reference
# validator from the skills-ref package: pip install skills-ref
set -euo pipefail

cd "$(dirname "$0")/.."
status=0
for dir in template skills/*/; do
  dir="${dir%/}"
  [ -d "$dir" ] || continue
  if output=$(agentskills validate "$dir" 2>&1); then
    echo "ok    $dir"
  else
    echo "FAIL  $dir"
    echo "$output" | sed 's/^/      /'
    status=1
  fi
done
exit $status
