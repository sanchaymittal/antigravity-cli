---
name: session-handover
description: Update handover.md with current session state and optionally exit for a fresh session
trigger: /session-handover
---

# Session Handover

Keep sessions lean. Update `handover.md` at every task boundary (PR merged). Start fresh sessions instead of compacting.

## When to invoke

- After every PR merge
- When context > 60%
- Before intentionally exiting a session
- Stop hook fires (automatic reminder)

## The Rule

**After each PR merge → update handover.md → consider exiting.**

If context above 60%: finish current task, update handover.md, exit. Start fresh session — loads memory + handover.md (~200 tokens) vs ~2000+ for compacted session.

## handover.md format

```
# ag CLI — Handover
**Date:** <YYYY-MM-DD>
**State:** <one-line summary of current state>

---

## What Was Built (this session)
<bullet list of completed work>

## Current State
<ag commands and their status>

## Next Session Goal
<specific next task>

### Setup Required Before Starting
<pre-flight steps>

### Running the Next Task
<exact command to run>

### What to Watch For
<success/failure signals>

### Debug
<debug commands if needed>

---

## Known Issues / Gotchas
| Issue | Fix |

---

## Key File Paths
<important paths>

---

## Git State
<both repos, branch, commit>
```

## How to update

Overwrite `handover.md` fully with current state. No need to read first.

## Fresh session benefit

Compacted session: ~2000 tokens of summary loaded every message.
Fresh session with handover.md: ~200 tokens.

**10x token reduction per message for the orchestrator session.**
