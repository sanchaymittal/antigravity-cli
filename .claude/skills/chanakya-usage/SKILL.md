---
name: chanakya-usage
description: Use when checking token burn, usage cost, or run history for chanakya agent runs
---

# Chanakya Token Usage

When this skill is invoked, **immediately run these commands and display the real output**. Do not show documentation — show live data.

## Step 1: List all runs

```bash
npx chanakya status
```

Display the output. If "No runs found" → stop, tell user no runs yet.

## Step 2: Show token breakdown for each coordinator run

For each run ID from status output that has `agent_started` events (coordinator runs, not orchestrator):

```bash
npx chanakya tokens <run-id>
```

Display each output inline.

## Step 3: Summarize

After showing all runs, output a summary:

```
--- Summary ---
Runs shown: N
Total in:   X tokens
Total out:  Y tokens
Total cached: Z tokens

Estimated cost (USD):
  gemini:      $X.XX
  claude-code: $X.XX
```

Cost rates:
- subagent:gemini — in: 1.25/1M, out: 10.00/1M
- subagent:claude-code — in: 3.00/1M, out: 15.00/1M
- harness — in: 3.00/1M, out: 15.00/1M

## Notes

- Two runs per `chanakya run`: orchestrator (no LLM tokens) + coordinator (real work). Show both but flag which is which.
- `chanakya usage` aggregate command = Phase 19, not yet impl'd. This skill is the interim.
