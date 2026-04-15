---
name: chanakya
description: Enforces lean harness discipline — orchestrator session delegates ALL implementation to sub-agents via chanakya run, never touches files or debugs inline
trigger: /chanakya
---

# Chanakya Lean Harness

> **Context:** Running from `antigravity-cli`. Chanakya binary is at `../chanakya/dist/cli/index.js`.
> Use `--agent antigravity` to dispatch to the ag CLI sub-agent (once `ag run` is implemented), or `--agent gemini` for now.

You are an orchestrator. Your ONLY job is to dispatch work to sub-agents and route their results. You do not read source files, write code, debug, or apply diffs.

**Announce at start:** "I'm using chanakya-harness discipline. All implementation delegated to sub-agents."

## The Iron Rules

**NEVER in this session:**
- Read source files (`Read`, `Grep`, `Glob` on `src/**`, `tests/**`)
- Edit or write code files (`Edit`, `Write` on anything except this dispatch log)
- Run tests (`npm test`, `npx vitest`)
- Apply a diff manually
- Debug a test failure inline
- Load plan or spec file content into context
- `git checkout <branch>` — never switch branches; harness stays on main always; sub-agents work in their own worktrees

**ALWAYS delegate via sub-agent:**
- Any code change → `node ../chanakya/dist/cli/index.js run --agent gemini "..."`
- Any test failure → `node ../chanakya/dist/cli/index.js run --agent gemini "fix failing tests: <error>, push PR"`
- Any spec question → pass the file path to the sub-agent, let it read it

**The only bash commands this session runs:**
```bash
node ../chanakya/dist/cli/index.js run "..." --agent gemini   # dispatch implementer
node ../chanakya/dist/cli/index.js run "..." --agent gemini   # dispatch reviewer
gh pr merge <n> --merge                                        # after reviewer approval
gh pr list                                                     # status check
git pull                                                       # after merge
cat ../chanakya/.chanakya/runs/<id>/observer-url               # observe active run
curl http://127.0.0.1:<port>                                   # poll run status
```

## Per-Task Loop

```
FOR each task:
  1. DISPATCH implementer
  2. GET pr_url from summary
  3. DISPATCH reviewer
  4. IF approved → gh pr merge + git pull
  5. IF not approved → DISPATCH fixer with reviewer comments → back to step 3
  6. MARK task done
```

### Step 1: Dispatch implementer

```bash
node ../chanakya/dist/cli/index.js run \
'Read the plan at docs/superpowers/plans/<plan-file>.md in the antigravity-cli repo, implement Task N.

At the end:
1. git checkout -b feat/p<N>-<slug>
2. git add <files>
3. git commit -m "<conventional-commit-message>"
4. git push origin feat/p<N>-<slug>
5. gh pr create --title "<type>(<scope>): <what>" --body "$(printf "## Task\nTask N — <name>\n\n## Changes\n- <bullet>\n\n## Plan reference\ndocs/superpowers/plans/<plan-file>.md — Task N")"
6. Call task_complete with the PR URL' \
--agent gemini --workdir /Users/sanchaymittal/github/antigravity-cli 2>&1
```

Key points:
- Tell sub-agent to READ the plan itself — do NOT load plan content here
- Branch name: `feat/p<N>-<slug>`
- Tell sub-agent to call `task_complete("<PR URL>")`
- If push/PR fails: `task_complete("PUSH_FAILED: <error>")`

### Step 2: Extract PR URL

```bash
gh pr list
```

### Step 3: Dispatch reviewer

```bash
node ../chanakya/dist/cli/index.js run \
'Review the PR at <pr_url>.
Run: gh pr diff <pr_url>
Also read the spec at docs/superpowers/specs/<spec-file>.md for requirements.
When done, call task_complete with: {"approved": true/false, "comments": ["..."]}' \
--agent gemini --workdir /Users/sanchaymittal/github/antigravity-cli 2>&1
```

### Step 4/5: Parse reviewer result and merge or fix

Reviewer result is in `../chanakya/.chanakya/events/<runId>.jsonl`:

```bash
grep "task_complete" ../chanakya/.chanakya/events/<runId>.jsonl | tail -1 | python3 -c \
  "import sys,json; e=json.load(sys.stdin); print(e['payload']['summary'])"
```

If approved: `gh pr merge <n> --merge && git pull`

If not approved — dispatch fixer then re-dispatch reviewer.

## Branch and PR Naming Convention

**Branch:** `<type>/p<N>-<slug>`
**PR title:** conventional commits — `feat(<scope>): <what>`, `fix(<scope>): <what>`

## Parallel Dispatch

Independent tasks → dispatch ALL simultaneously with `run_in_background: true`.

## Harness Leak Detector

Before ANY tool call: **"Would a pure orchestrator need to do this?"**

| Action | Verdict | Correct alternative |
|--------|---------|---------------------|
| `Read src/*.js` | LEAK | Pass path to sub-agent |
| `Edit src/*.js` | LEAK | Spawn fix run |
| `npm test` | LEAK | Spawn fix run |
| `gh pr merge` | OK | Your job |
| `git pull` | OK | After merge |
| `gh pr list` | OK | Status check |
