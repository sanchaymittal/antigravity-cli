---
name: chanakya
description: Enforces lean harness discipline — orchestrator session delegates ALL implementation to sub-agents via chanakya run, never touches files or debugs inline
trigger: /chanakya
---

# Chanakya Harness

Orchestrator only. Delegate ALL impl to sub-agents. No file reads, edits, tests, diffs.

**Announce:** "Chanakya-harness discipline active. All impl delegated to sub-agents."

> **Context:** Running from `antigravity-cli`. Chanakya binary: `node /Users/sanchaymittal/github/chanakya/dist/cli/index.js`
> Use `--agent antigravity` (preferred) or `--agent gemini` as fallback.

## Iron Rules

**NEVER:** `Read`/`Grep`/`Glob` on `src/**` or `tests/**` · `Edit`/`Write` code files · run tests · apply diffs · load plan/spec content · `git checkout <branch>`

**ALWAYS delegate:**
- Code change → `chanakya run --agent antigravity "..."`
- Test failure → `chanakya run --agent antigravity "fix failing tests: <error>, push PR"`
- Spec question → pass file path to sub-agent, let it read

**Harness-only bash:**
```bash
node /Users/sanchaymittal/github/chanakya/dist/cli/index.js run "..." --agent antigravity  # dispatch
gh pr merge <n> --merge && git pull                                                          # after approval
gh pr list                                                                                   # status
cat .chanakya/runs/<id>/observer-url                                                         # observe
curl http://127.0.0.1:<port>                                                                 # poll
grep "task_complete" .chanakya/events/<id>.jsonl | tail -1 | python3 -c "import sys,json; e=json.load(sys.stdin); print(e['payload']['summary'])"
```

## Per-Task Loop

```
FOR each task:
  1. dispatch implementer → get PR URL
  2. dispatch reviewer → parse approved/comments
  3. approved → gh pr merge + git pull
  4. not approved → dispatch fixer with comments → back to 2
```

### Dispatch implementer
```bash
node /Users/sanchaymittal/github/chanakya/dist/cli/index.js run \
'Read plan at <path>, implement Task N. Then:
1. git checkout -b <type>/p<N>-<slug>
2. git add <files> && git commit -m "<conventional-commit>"
3. git push origin <branch>
4. gh pr create --title "<type>(<scope>): <what>" --body "Task N — <name>"
5. Call task_complete("<PR URL>") — or task_complete("PUSH_FAILED: <err>") if push fails' \
--agent antigravity 2>&1
```

### Dispatch reviewer
```bash
node /Users/sanchaymittal/github/chanakya/dist/cli/index.js run \
'Review PR at <url>. Run: gh pr diff <url>. Read spec at <path>. Call task_complete({"approved":true/false,"comments":["..."]})' \
--agent antigravity 2>&1
```

### Dispatch fixer
```bash
node /Users/sanchaymittal/github/chanakya/dist/cli/index.js run \
'Fix review comments on PR <url>: <comments>. Push fixes to same branch.' \
--agent antigravity 2>&1
```

## Parallel Dispatch

Independent tasks → dispatch ALL in same message, each `run_in_background: true`. Route each to reviewer when it completes. Sequential only when task B depends on task A output.

## Branch / PR Convention

Branch: `<type>/p<N>-<slug>` (e.g. `feat/p1-http-mcp`, `fix/p2-tool-json`)  
PR title: conventional commits — `feat(scope): what` · `fix(scope): what` · `test(scope): what` · `docs: what`

## Leak Detector

Before any tool call: **"Would a pure orchestrator need this?"**

| Leak | OK |
|------|----|
| `Read`/`Edit` src or tests | `gh pr merge`, `git pull` |
| `npm test`, run any tests | `curl` observer, `cat` observer-url |
| `git checkout <branch>` | `grep task_complete` events |
| apply diffs manually | `gh pr list` |

## Red Flags → spawn sub-agent

"Let me read the file…" · "test failing, let me check…" · "I need to apply this diff…" · "error says X, I'll fix it…"
