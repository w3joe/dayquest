#!/bin/zsh
# usage: gen.sh NAME  (prompt read from tools/jobs.py; optional REF image env)
cd "${0:A:h}/.."
NAME=$1
PROMPT=$(python3 -c "import sys;sys.path.insert(0,'tools');import jobs;d={**jobs.JOBS,**jobs.REF_JOBS};print(jobs.STYLE+d['$NAME'])")
C=/opt/homebrew/bin/codex
[[ -x $C ]] || C=/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex
IMG=()
[[ -n $REF ]] && IMG=(-i $REF)
[[ -f assets/raw/$NAME.png ]] && { echo "skip $NAME"; exit 0; }
print -r -- "Use your built-in image_gen tool exactly once (do NOT use the CLI script or any API key) with exactly this prompt, verbatim:

$PROMPT

Then copy the generated PNG to ./assets/raw/$NAME.png. Do nothing else. Reply only with the path." | $C exec --skip-git-repo-check -s workspace-write -C "$PWD" $IMG -- - > tools/logs/$NAME.log 2>&1
[[ -f assets/raw/$NAME.png ]] && echo "ok $NAME" || echo "FAIL $NAME"
