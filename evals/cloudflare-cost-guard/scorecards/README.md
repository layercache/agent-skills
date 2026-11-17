# Scorecards

One file per released version of the skill, named `<version>.md`: the `scorecard.md` that `run.sh` wrote for the agent eval run before that release. Compare a new run with the latest file here before changing the skill's rules.

A release scorecard covers every case, run on the commit being released. Any change under `skills/` changes what the agent reads for every case, so it needs a full run, however few cases it seems to touch. Only a case that was fixed afterwards may be run again on its own, on a later commit with the same skill, and the scorecard says which commit each case ran on.
