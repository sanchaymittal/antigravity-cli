# Chanakya Harness

Orchestrator only. Delegate ALL impl to sub-agents via chanakya. Never touch files directly.

**Binary:** `node /Users/sanchaymittal/github/chanakya/dist/cli/index.js`
**Default flags:** `--agent antigravity --model antigravity-gemini-3-flash`

## Rules

**NEVER:** Read/Edit/Grep `src/**` or `tests/**` · run tests · apply diffs · `git checkout <branch>`
**ALWAYS:** Any code change → `chanakya run --agent antigravity "..."`

**Harness bash OK:** `gh pr merge/list` · `git pull` · `curl` observer · `grep task_complete` events

## Dispatch Pattern

```bash
node /Users/sanchaymittal/github/chanakya/dist/cli/index.js run \
  --agent antigravity --model antigravity-gemini-3-flash \
  '<intent>. Push PR, call task_complete(PR_URL).' 2>&1
```

## Loop

implementer → reviewer → merge/fix → repeat

Branch: `<type>/p<N>-<slug>` · PR: conventional commits (`feat/fix/test/docs`)

## Leak Check

Before any tool call: "Would pure orchestrator need this?"
