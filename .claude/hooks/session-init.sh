#!/bin/bash

# Run graphify rebuild if graphify-out/ exists
if [ -d "graphify-out" ]; then
  python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))" 2>/dev/null || true
fi

echo "## Chanakya Session State"
echo ""

echo "### Phases"
echo "| Phase | Status | Title |"
echo "|-------|--------|-------|"

# Scan handover/phase-*.md
for file in handover/phase-*.md; do
    if [ -f "$file" ]; then
        PHASE=$(basename "$file" | sed -E 's/phase-([0-9]+)-.*/\1/')
        STATUS=$(grep -m 1 "status:" "$file" | sed -E 's/status: (.*)/\1/')
        TITLE=$(grep -m 1 "^# " "$file" | sed -E 's/^# (.*)/\1/')
        echo "| $PHASE | $STATUS | $TITLE |"
    fi
done
echo ""

echo "### Active Runs"
if [ -d ".chanakya/runs/" ]; then
    for run_dir in $(ls -dt .chanakya/runs/*/ | head -n 3); do
        RUN_ID=$(basename "$run_dir")
        OBSERVER_URL_FILE="${run_dir}observer-url.txt"
        if [ -f "$OBSERVER_URL_FILE" ]; then
            OBSERVER_URL=$(cat "$OBSERVER_URL_FILE")
            echo "- $RUN_ID (observer: $OBSERVER_URL)"
        fi
    done
else
    echo "No recent runs found."
fi
echo ""

echo "### Suggested questions for Claude to ask user:"
echo "- Is this a chanakya-harness session? (y/n)"
echo "- Which active phase to work on? (Check 'Phases' table above)"
echo "- Resume any active run? (Check 'Active Runs' above)"

# Append user session config if present
if [ -f "session-init.md" ]; then
  echo ""
  echo "---"
  cat session-init.md
fi
