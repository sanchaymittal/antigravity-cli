# ag Dev-Tool Readiness — Design Spec

**Date:** 2026-04-16  
**Status:** Approved  
**Scope:** Fix 5 unpatched issues + add `ag quota` + token burn tracking  
**Implementation:** chanakya dispatch (ag sub-agents), 2 batches

---

## Context

`ag` is a CLI wrapping a local Antigravity sidecar. It works for personal use but has 5 unpatched issues blocking reliable sub-agent use (when chanakya dispatches ag via `run_bash`). Two features — `ag quota` and post-run token tracking — are missing for daily dev use.

---

## Batch 1: Bug Fixes

### 1. `process.exit()` boundary

**Problem:** `agent.js` and `mcp/client.js` call `process.exit()` directly. Breaks library embedding and sub-agent error propagation.

**Fix:** `agent.js` and `mcp/client.js` throw `Error` instead. `cli.js` is the sole caller of `process.exit()` — it catches and exits. Library callers get catchable errors.

**Files:** `src/agent.js`, `src/mcp/client.js`, `src/cli.js`

---

### 2. Logger injection (structured output)

**Problem:** `agent.js` writes directly to `process.stdout` / `process.stderr`. Parent process can't parse structured output when ag is used as a sub-agent.

**Fix:** `runAgent(ctx, intent, model, mcpData, opts)` accepts `opts.logger = { log, error, write }`. Default: `{ log: console.log, error: console.error, write: process.stdout.write.bind(process.stdout) }`. `cli.js` passes the default. Programmatic callers can pass a custom logger or no-op.

**Files:** `src/agent.js`, `src/cli.js`

---

### 3. Explicit `cwd` option

**Problem:** `agent.js` uses `process.cwd()` throughout. Workspace misalignment when chanakya starts ag from an unexpected CWD.

**Fix:** `runAgent()` accepts `opts.cwd` (string). All internal references to `process.cwd()` inside `agent.js` use `opts.cwd`. `cli.js` passes `process.cwd()` as default.

**Files:** `src/agent.js`, `src/cli.js`

---

### 4. MCP config path resolution

**Problem:** `initMcpServers()` resolves `.ag/mcp.json` from `process.cwd()`. Fails if ag started from a subdirectory.

**Fix:** `initMcpServers({ cwd })` resolves `.ag/mcp.json` relative to `cwd`. Falls back to `$HOME/.ag/mcp.json` if not found. `cli.js` passes `process.cwd()`.

**Files:** `src/mcp/client.js`, `src/cli.js`

---

### 5. MCP JSON-RPC shutdown

**Problem:** `shutdownMcpServers` kills MCP server processes without sending a JSON-RPC `shutdown` notification. MCP servers may leave dirty state.

**Fix:** Before killing, send `{"jsonrpc":"2.0","method":"shutdown","id":N}` to each server. Wait up to 200ms for acknowledgement, then kill. Graceful teardown.

**Files:** `src/mcp/client.js`

---

## Batch 2: Features

### `ag quota` command

**Goal:** Show per-model quota remaining and reset window.

**Implementation:**
1. **Investigation sub-task** (chanakya run): Probe all sidecar ports for quota/usage endpoints. Find Antigravity's usage log folder (likely `~/Library/Application Support/Antigravity/` on macOS). Write findings to `/tmp/ag-quota-investigation.md`.
2. **Implementation** (chanakya run based on findings): Build `ag quota` command. Output: per-model table of quota remaining + reset time.

Fallback: if sidecar exposes no quota endpoint, read usage log folder directly.

**Files:** `src/cli.js`, new `src/sidecar/quota.js`

---

### Token burn tracking after `ag run`

**Goal:** After `ag run` completes, show input/output tokens and model used.

**Implementation:**
- Before run: snapshot latest entry timestamp in Antigravity's usage log folder.
- After run: re-read folder, compute delta (input tokens, output tokens, model).
- Print to **stderr** as trailing summary (stdout stays clean for piping).

```
─── Token Usage ──────────────────
  Model:   antigravity-gemini-3-flash
  Input:   1,234 tokens
  Output:    456 tokens
  Total:   1,690 tokens
──────────────────────────────────
```

Silent skip if: usage folder not found, delta is zero, or read fails.

**Files:** `src/cli.js`, new `src/sidecar/usage.js`

---

## Dispatch Plan

| Batch | Chanakya Dispatches | Output |
|-------|---------------------|--------|
| 1 | 1 run — all 5 bug fixes | 1 PR |
| 2 | Run A: investigation (no PR) → Run B: quota + token tracking impl | 1 PR |

Batch 2 Run A happens first and is required input for Run B.

---

## Non-Goals

- No npm publish / packaging
- No multi-user support
- No breaking changes to `ag chat` or `ag run` CLI surface
- No backwards-compatibility shims for removed `process.exit()` internals
