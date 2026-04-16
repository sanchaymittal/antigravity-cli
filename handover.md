# ag CLI — Handover

**Date:** 2026-04-16
**State:** `ag run` agentic loop implemented and merged. Next session: use ag via chanakya to review antigravity-cli code.

---

## What Was Built (this session)

`ag run <intent>` — full agentic loop. Works like gemini-cli as a chanakya sub-agent.

**New files:**
- `src/model-enum.js` — shared `VALUE_TO_MODEL_ENUM` constant
- `src/tools/builtin.js` — `read_file`, `write_file`, `run_bash` tools
- `src/mcp/client.js` — stdio JSON-RPC MCP client, reads `.ag/mcp.json`
- `src/agent.js` — agentic loop (max 50 turns, tool dispatch, stops on `task_complete`)

**Modified:**
- `src/cli.js` — `ag run <intent> [-m model]` command added
- `../chanakya/src/agents/antigravity-cli-agent.ts` — `bootstrap()` writes `AGENTS.md`, `start()` writes `.ag/mcp.json` + spawns `ag run`

**chanakya PR:** sanchaymittal/chanakya#56 merged

---

## Current State

```
ag --version     → 0.1.0
ag models        → 6 models
ag status        → sidecar PID/ports
ag chat "..."    → one-shot inference (existing)
ag run "..."     → agentic loop with tools (NEW)
```

`ag run` without `.ag/mcp.json`: uses built-in tools only (read_file, write_file, run_bash). Model tries to call `task_complete` but it's not available → loops to max turns → exits 1. **This is expected.** File operations work correctly.

`ag run` with `.ag/mcp.json`: connects to MCP server(s), gets `task_complete` + any MCP tools, exits 0 on success.

---

## Next Session Goal

**Use `chanakya run --agent antigravity` to review the code of antigravity-cli.**

This is a meta-test: the newly built tool reviews its own codebase via chanakya orchestration.

### Setup Required Before Starting

**1. Ensure chanakya MCP server can serve tools to ag:**
```bash
# Start chanakya server in antigravity-cli dir
cd /Users/sanchaymittal/github/antigravity-cli
node /Users/sanchaymittal/github/chanakya/dist/cli/index.js serve
# Should start HTTP MCP server on some port
```

**2. Ensure ag binary has correct permissions:**
```bash
chmod +x ~/.nvm/versions/node/v24.13.0/bin/ag
ag run --help   # verify
```

**3. Ensure chanakya is built with latest agent:**
```bash
cd /Users/sanchaymittal/github/chanakya && npm run build
node -e "const {AntigravityCliAgent}=require('./dist/agents/antigravity-cli-agent'); new AntigravityCliAgent().available().then(r=>console.log('available:',r))"
# expect: available: true
```

### Running the Code Review

From `/Users/sanchaymittal/github/antigravity-cli`:

```bash
node /Users/sanchaymittal/github/chanakya/dist/cli/index.js run \
  --agent antigravity \
  "Review the code in /Users/sanchaymittal/github/antigravity-cli/src/. Read each file: cli.js, agent.js, tools/builtin.js, mcp/client.js, sidecar/raw.js. Identify: (1) bugs or error handling gaps, (2) edge cases not handled, (3) anything that would break when used as a chanakya sub-agent. Write your findings to /tmp/ag-code-review.md and call task_complete with a summary." 2>&1
```

### What to Watch For

- **task_complete called** → ag exits 0, chanakya reports success → review is in `/tmp/ag-code-review.md`
- **Max turns warning** → ag looped 50 times without task_complete → MCP not connected properly, see debug below
- **Sidecar not found** → Antigravity.app must be running

### Debug MCP Connectivity

```bash
# Check .ag/mcp.json was written to worktree
ls /Users/sanchaymittal/github/antigravity-cli/.chanakya/worktrees/*/ag/mcp.json 2>/dev/null

# Check events for MCP tool calls
cat /Users/sanchaymittal/github/antigravity-cli/.chanakya/events/<run-id>.jsonl | \
  python3 -c "import sys,json; [print(e['type'], e.get('payload',{}).get('tool','')) for line in sys.stdin for e in [json.loads(line)] if e['type'] in ('tool_call','task_complete')]"

# AG_DEBUG=1 for verbose sidecar + MCP output
AG_DEBUG=1 ag run "test" 2>&1 | head -30
```

---

## Known Issues / Gotchas

| Issue | Fix |
|-------|-----|
| `ag` binary: permission denied | `chmod +x ~/.nvm/versions/node/v24.13.0/bin/ag` |
| `git pull` fails with local changes | `git stash && git pull && git stash drop` |
| chanakya runs in CWD worktrees | Must run chanakya from antigravity-cli dir |
| Cross-repo tasks via chanakya | Chanakya worktrees are always from the repo you run it in — don't dispatch chanakya-internal changes via chanakya |
| `ag run` exits 1 without MCP | Expected — no `task_complete` tool without `.ag/mcp.json` |
| `task_complete` observation is MCP result string | If MCP call fails, "Done: Error: ..." is printed but exits 0 |

---

## Key File Paths

```
/Users/sanchaymittal/github/antigravity-cli/
  src/cli.js                    ← ag commands (models, status, chat, run)
  src/agent.js                  ← agentic loop
  src/tools/builtin.js          ← read_file, write_file, run_bash
  src/mcp/client.js             ← stdio MCP client
  src/model-enum.js             ← VALUE_TO_MODEL_ENUM
  src/sidecar/raw.js            ← callRawInference, parseToolCalls
  src/sidecar/discovery.js      ← discoverSidecar
  docs/superpowers/specs/2026-04-16-ag-run-agentic-agent-design.md
  docs/superpowers/plans/2026-04-16-ag-run-agentic-agent.md

/Users/sanchaymittal/github/chanakya/
  src/agents/antigravity-cli-agent.ts   ← bootstrap + start for ag run
  dist/agents/antigravity-cli-agent.js  ← compiled (gitignored, rebuild with npm run build)
```

---

## Git State

Both repos on `main`, clean.

```
antigravity-cli: 3c61c5e (Merge PR #6 — ag run command)
chanakya:        0fda93f (Merge PR #56 — AntigravityCliAgent)
```
