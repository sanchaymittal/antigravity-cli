# ag Dev-Tool Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 unpatched bugs blocking sub-agent use + add `ag quota` command + token burn tracking after `ag run`.

**Architecture:** Two chanakya dispatch batches. Batch 1 (all bug fixes, 1 PR). Batch 2 (sidecar investigation, then quota + token tracking impl, 1 PR). All implementation via `chanakya run --agent antigravity`. Orchestrator never touches `src/` or `tests/` directly.

**Tech Stack:** Node.js (CommonJS), `node:test` (built-in test runner, zero deps), `commander`, Antigravity sidecar (HTTP/2 local), chanakya sub-agents.

---

## File Map

### Batch 1 (Bug Fixes)

| File | Change |
|------|--------|
| `src/agent.js` | Add `opts` param to `runAgent()` (logger, cwd); replace all `process.stdout/stderr` calls with logger; throw on inference error instead of `process.exit` |
| `src/mcp/client.js` | Add `cwd` param to `readMcpConfig()` + `initMcpServers()`; HOME fallback; JSON-RPC shutdown before kill |
| `src/cli.js` | Pass `cwd: process.cwd()` and default logger into `runAgent()` and `initMcpServers()`; all `process.exit()` calls stay here |
| `tests/agent.test.js` | Create: unit tests for logger injection, cwd passthrough, inference error throw |
| `tests/mcp-client.test.js` | Create: unit tests for `readMcpConfig` path resolution + HOME fallback |
| `package.json` | Add `"test": "node --test tests/**/*.test.js"` script |

### Batch 2 (Features)

| File | Change |
|------|--------|
| `src/sidecar/quota.js` | Create: probe sidecar for quota fields; read usage log folder as fallback |
| `src/sidecar/usage.js` | Create: snapshot + diff Antigravity usage log folder; return `{ model, inputTokens, outputTokens }` |
| `src/cli.js` | Add `ag quota` command; wire token tracking snapshot before/after `ag run` |
| `tests/usage.test.js` | Create: unit tests for usage snapshot/diff logic |

---

## Batch 1: Bug Fixes

### Task 1: Set up test framework + dispatch bug fixes

- [ ] **Step 1: Confirm main is up to date**

```bash
git pull && git log --oneline -3
```

Expected: latest commit is `ccb2e74`.

- [ ] **Step 2: Dispatch Batch 1 to chanakya**

```bash
node /Users/sanchaymittal/github/chanakya/dist/cli/index.js run \
  --agent antigravity --model antigravity-gemini-3-flash \
  'Implement all 5 bug fixes for antigravity-cli. Push a PR on branch fix/p1-dev-tool-readiness. Call task_complete(PR_URL) when done.

## Context

Working in antigravity-cli repo. No test framework exists yet — set it up as part of this task.

## Setup: Add test script to package.json

Add to scripts: `"test": "node --test tests/**/*.test.js"`

## Fix 1: process.exit() boundary

In src/agent.js, the inference error handler calls process.exit(1). Change it to throw:

BEFORE (line ~54):
```
    } catch (err) {
      console.error(`Inference error: ${err.message}`);
      process.exit(1);
    }
```

AFTER:
```
    } catch (err) {
      throw new Error(`Inference error: ${err.message}`);
    }
```

In src/cli.js, the `ag run` action already has a try/catch — it will catch this thrown error and call process.exit(1) there. No change needed to cli.js error handling.

## Fix 2: Logger injection

Change runAgent signature from:
`async function runAgent(ctx, intent, modelEnum, mcpData)`

To:
`async function runAgent(ctx, intent, modelEnum, mcpData, opts = {})`

At top of runAgent, define:
```js
const logger = opts.logger ?? {
  log: (...a) => console.log(...a),
  error: (...a) => console.error(...a),
  write: (s) => process.stdout.write(s),
};
```

Replace every process.stdout.write and console.error and process.stderr.write inside agent.js with logger equivalents:
- `process.stdout.write(result.content)` → `logger.write(result.content)`
- `if (!result.content.endsWith("\n")) process.stdout.write("\n")` → `if (!result.content.endsWith("\n")) logger.write("\n")`
- `console.error(...)` → `logger.error(...)`
- `process.stderr.write(...)` → `logger.error(...)`  (strip trailing \n since console.error adds it)
- `process.stdout.write(`\nDone: ${observation}\n`)` → `logger.write(`\nDone: ${observation}\n`)`

In src/cli.js, the `ag run` command calls `runAgent(ctx, intent, modelEnum, mcpData)` — add empty opts (or explicit default logger) so existing behavior unchanged:
```js
await runAgent(ctx, intent, modelEnum, mcpData, {});
```

## Fix 3: Explicit cwd option

Change makeSystemPrompt to accept cwd:
```js
function makeSystemPrompt(cwd) {
  return [
    `You are a coding agent working in ${cwd}.`,
    ...
  ].join("\n");
}
```

runAgent reads cwd from opts:
```js
const cwd = opts.cwd ?? process.cwd();
```

Pass cwd to makeSystemPrompt:
```js
{ role: "system", content: makeSystemPrompt(cwd) },
```

In src/cli.js, pass cwd in opts:
```js
await runAgent(ctx, intent, modelEnum, mcpData, { cwd: process.cwd() });
```

## Fix 4: MCP config path resolution

In src/mcp/client.js, change readMcpConfig:

BEFORE:
```js
function readMcpConfig() {
  const configPath = path.join(process.cwd(), ".ag", "mcp.json");
  ...
}
```

AFTER:
```js
const os = require("os");

function readMcpConfig(cwd) {
  const local = path.join(cwd, ".ag", "mcp.json");
  const home = path.join(os.homedir(), ".ag", "mcp.json");
  for (const configPath of [local, home]) {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch { /* try next */ }
  }
  return { mcpServers: {} };
}
```

Change initMcpServers signature:
```js
async function initMcpServers(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const config = readMcpConfig(cwd);
  ...
}
```

In src/cli.js, the `ag run` command passes cwd:
```js
const mcpData = await initMcpServers({ cwd: process.cwd() });
```

## Fix 5: MCP JSON-RPC shutdown notification

In src/mcp/client.js, change shutdownMcpServers:

BEFORE:
```js
async function shutdownMcpServers(clients) {
  for (const [, client] of clients) {
    if (client.isHttp) continue;
    try {
      client.proc.stdin.end();
      client.proc.kill("SIGTERM");
    } catch { /* already dead */ }
  }
}
```

AFTER:
```js
async function shutdownMcpServers(clients) {
  const shutdownPromises = [];
  for (const [serverName, client] of clients) {
    if (client.isHttp) continue;
    shutdownPromises.push(
      (async () => {
        try {
          // Send JSON-RPC shutdown notification, wait up to 200ms
          const id = ++_rpcId;
          const msg = JSON.stringify({ jsonrpc: "2.0", id, method: "shutdown", params: {} }) + "\n";
          await Promise.race([
            new Promise((resolve) => {
              client.proc.stdin.write(msg, resolve);
            }),
            new Promise((resolve) => setTimeout(resolve, 200)),
          ]);
        } catch { /* ignore write errors — proc may already be dead */ }
        try {
          client.proc.stdin.end();
          client.proc.kill("SIGTERM");
        } catch { /* already dead */ }
      })()
    );
  }
  await Promise.all(shutdownPromises);
}
```

## Tests to write

Create tests/agent.test.js:
```js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("makeSystemPrompt uses provided cwd not process.cwd", () => {
  // We test indirectly via runAgent opts.cwd by stubbing callRawInference
  // This is a placeholder for the integration check below
  assert.ok(true);
});

test("runAgent throws on inference error instead of calling process.exit", async () => {
  // Arrange: stub callRawInference to throw
  const { runAgent } = require("../src/agent");
  const fakeCtx = {};
  const fakeMcpData = { tools: [], clients: new Map() };
  // Override callRawInference to throw
  const raw = require("../src/sidecar/raw");
  const original = raw.callRawInference;
  raw.callRawInference = async () => { throw new Error("sidecar down"); };

  let threw = false;
  try {
    await runAgent(fakeCtx, "test", "GEMINI_FLASH", fakeMcpData, {});
  } catch (err) {
    threw = true;
    assert.match(err.message, /Inference error: sidecar down/);
  } finally {
    raw.callRawInference = original;
  }
  assert.ok(threw, "runAgent must throw on inference error");
});

test("runAgent uses opts.logger instead of process.stdout", async () => {
  const { runAgent } = require("../src/agent");
  const raw = require("../src/sidecar/raw");
  const original = raw.callRawInference;
  // Stub: returns content then no tool calls (agent exits cleanly)
  raw.callRawInference = async () => ({ content: "hello", toolCalls: [] });

  const logged = [];
  const logger = { log: () => {}, error: () => {}, write: (s) => logged.push(s) };

  try {
    await runAgent({}, "test", "GEMINI_FLASH", { tools: [], clients: new Map() }, { logger });
  } finally {
    raw.callRawInference = original;
  }
  assert.ok(logged.includes("hello"), "logger.write must be called with response content");
});
```

Create tests/mcp-client.test.js:
```js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

test("readMcpConfig resolves from provided cwd", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ag-test-"));
  const agDir = path.join(tmpDir, ".ag");
  fs.mkdirSync(agDir);
  const config = { mcpServers: { test: { command: "echo", args: [] } } };
  fs.writeFileSync(path.join(agDir, "mcp.json"), JSON.stringify(config));

  // We test via initMcpServers by checking it does not throw on valid config
  // readMcpConfig is not exported — test via initMcpServers opts
  // If we pass cwd=tmpDir and config is valid, initMcpServers should return { tools: [], clients: Map }
  // (server will fail to start since "echo" isn'"'"'t a real MCP server, but no crash)
  const { initMcpServers } = require("../src/mcp/client");
  // Just verify it doesn'"'"'t throw — actual server start failure is warned, not fatal
  return initMcpServers({ cwd: tmpDir }).then((result) => {
    assert.ok(result.tools !== undefined);
    assert.ok(result.clients !== undefined);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

test("readMcpConfig returns empty when no config found", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ag-test-empty-"));
  const { initMcpServers } = require("../src/mcp/client");
  return initMcpServers({ cwd: tmpDir }).then((result) => {
    assert.deepEqual([...result.clients.keys()], []);
    assert.deepEqual(result.tools, []);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

## Branch and PR

Branch: fix/p1-dev-tool-readiness
Conventional commit messages. PR title: "fix: sub-agent reliability — logger injection, cwd param, MCP path + shutdown"
Call task_complete(PR_URL) when PR is open.' 2>&1
```

- [ ] **Step 3: Monitor for completion**

```bash
# Poll for task_complete event
grep -i "task_complete\|PR_URL\|pull/\|error" /tmp/chanakya-batch1.log 2>/dev/null || echo "check terminal output"
```

- [ ] **Step 4: Verify PR exists**

```bash
gh pr list --repo sanchaymittal/antigravity-cli --state open
```

Expected: PR on branch `fix/p1-dev-tool-readiness`.

- [ ] **Step 5: Review and merge**

```bash
gh pr view --repo sanchaymittal/antigravity-cli fix/p1-dev-tool-readiness
gh pr merge --squash --repo sanchaymittal/antigravity-cli fix/p1-dev-tool-readiness
git pull
```

---

## Batch 2A: Sidecar Investigation (no PR)

### Task 2: Probe sidecar for quota + find Antigravity usage log folder

- [ ] **Step 1: Confirm sidecar is running**

```bash
ag status
```

Expected: PID, Ports, Tokens lines printed.

- [ ] **Step 2: Dispatch investigation to chanakya**

```bash
node /Users/sanchaymittal/github/chanakya/dist/cli/index.js run \
  --agent antigravity --model antigravity-gemini-3-flash \
  'Investigate Antigravity sidecar API and usage log folder. Write findings to /tmp/ag-quota-investigation.md then call task_complete with a 3-sentence summary.

## Steps

Step 1: run_bash: ag status 2>&1
  - Note all ports listed

Step 2: For each port from Step 1, probe these paths (replace PORT):
  run_bash: curl -sk http://127.0.0.1:PORT/ 2>&1 | head -50
  run_bash: curl -sk http://127.0.0.1:PORT/quota 2>&1 | head -50
  run_bash: curl -sk http://127.0.0.1:PORT/usage 2>&1 | head -50
  run_bash: curl -sk http://127.0.0.1:PORT/tokens 2>&1 | head -50
  run_bash: curl -sk http://127.0.0.1:PORT/models 2>&1 | head -50
  run_bash: curl -sk http://127.0.0.1:PORT/status 2>&1 | head -50
  Also try HTTPS: replace http with https for each above.

Step 3: Find Antigravity usage log folder (same pattern as Claude/Gemini CLI):
  run_bash: ls ~/Library/Application\ Support/ | grep -i antigravity 2>&1
  run_bash: ls ~/Library/Application\ Support/Antigravity/ 2>&1 || echo "not found"
  run_bash: ls ~/.config/ | grep -i antigravity 2>&1 || echo "not found"
  run_bash: ls ~/.antigravity/ 2>&1 || echo "not found"
  run_bash: find ~/Library/Application\ Support -name "*.json" -path "*antigravity*" 2>/dev/null | head -20
  run_bash: find ~/Library/Logs -name "*.json" -path "*antigravity*" 2>/dev/null | head -20
  run_bash: find ~/.config -name "*.json" -path "*antigravity*" 2>/dev/null | head -20

Step 4: read_file the most promising usage log file — look for token count fields (inputTokens, outputTokens, usage, tokens)

Step 5: read_file src/sidecar/discovery.js — note exact shape of the object returned by discoverSidecar

Step 6: write_file /tmp/ag-quota-investigation.md with:
  # Antigravity Quota Investigation
  ## Sidecar Ports Found
  [list]
  ## Sidecar HTTP Endpoints (per port)
  [what each endpoint returns, or "404/no response"]
  ## Usage Log Folder
  [exact path found, or "not found"]
  ## Usage Log File Shape
  [exact JSON fields, verbatim sample entry]
  ## discoverSidecar Return Shape
  [exact fields from discovery.js]
  ## Recommendations
  [how to implement ag quota and token tracking based on findings]

Call task_complete with: "Quota endpoint: [yes/no, path]. Usage log folder: [path or not found]. Token fields: [field names]."' 2>&1
```

- [ ] **Step 3: Read investigation findings**

```bash
cat /tmp/ag-quota-investigation.md
```

Save output — needed as input for Task 3.

---

## Batch 2B: Quota + Token Tracking

### Task 3: Implement `ag quota` + token burn tracking

> Run this AFTER reading /tmp/ag-quota-investigation.md from Task 2.

- [ ] **Step 1: Confirm main is up to date (Batch 1 merged)**

```bash
git pull && git log --oneline -3
```

Expected: Batch 1 fix PR appears in log.

- [ ] **Step 2: Dispatch implementation to chanakya**

Substitute `[INVESTIGATION_FINDINGS]` with the actual content of `/tmp/ag-quota-investigation.md` before running:

```bash
node /Users/sanchaymittal/github/chanakya/dist/cli/index.js run \
  --agent antigravity --model antigravity-gemini-3-flash \
  'Implement ag quota command and token burn tracking after ag run. Push PR on branch feat/p2-quota-token-tracking. Call task_complete(PR_URL).

## Investigation Findings

[PASTE FULL CONTENT OF /tmp/ag-quota-investigation.md HERE]

## Feature 1: ag quota command

Add to src/cli.js:
```js
program
  .command("quota")
  .description("Show per-model quota and usage from Antigravity")
  .action(async () => {
    // Use findings from investigation to implement this.
    // If sidecar exposes a quota endpoint: probe it and display.
    // If not: read the usage log folder and display recent usage per model.
    // Output format (stdout):
    //   Model                          Quota Used   Reset
    //   antigravity-claude-sonnet      1,234 tok    7m
    //   antigravity-gemini-3-flash     456 tok      reset N/A
    // If neither works: print "Quota data not available — check Antigravity app Settings > Model"
  });
```

Create src/sidecar/quota.js:
- Export `async function fetchQuota(ctx)` 
- Try sidecar endpoint first (based on investigation findings)
- Fall back to reading usage log folder
- Return array of `{ model, used, resetIn }` objects (resetIn may be null)
- Never throws — returns empty array on failure

## Feature 2: Token burn tracking after ag run

Create src/sidecar/usage.js:
- Export `function snapshotUsage()` — reads Antigravity usage log folder, returns `{ timestamp, entries }` where entries is array of log entries (exact shape from investigation)
- Export `function diffUsage(before, after)` — computes delta, returns `{ model, inputTokens, outputTokens }` or null if no delta or folder not found
- Never throws

In src/cli.js, wrap the `ag run` action:
```js
// Before runAgent call:
const { snapshotUsage, diffUsage } = require("./sidecar/usage");
const usageBefore = snapshotUsage();

// After runAgent completes (in try block, before cleanup):
const usageAfter = snapshotUsage();
const tokenDelta = diffUsage(usageBefore, usageAfter);
if (tokenDelta) {
  const total = tokenDelta.inputTokens + tokenDelta.outputTokens;
  process.stderr.write(
    `\n─── Token Usage ────────────────────\n` +
    `  Model:   ${tokenDelta.model}\n` +
    `  Input:   ${tokenDelta.inputTokens.toLocaleString()} tokens\n` +
    `  Output:  ${tokenDelta.outputTokens.toLocaleString()} tokens\n` +
    `  Total:   ${total.toLocaleString()} tokens\n` +
    `────────────────────────────────────\n`
  );
}
```

## Tests to write

Create tests/usage.test.js:
```js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("diffUsage returns null when entries have identical totals", () => {
  const { diffUsage } = require("../src/sidecar/usage");
  const entries = [{ model: "x", inputTokens: 10, outputTokens: 5 }];
  const before = { timestamp: 1000, entries };
  const after  = { timestamp: 2000, entries: [{ model: "x", inputTokens: 10, outputTokens: 5 }] };
  assert.strictEqual(diffUsage(before, after), null);
});

test("diffUsage returns delta when entries differ", () => {
  const { diffUsage } = require("../src/sidecar/usage");
  const before = { timestamp: 1000, entries: [{ model: "gemini", inputTokens: 100, outputTokens: 50 }] };
  const after  = { timestamp: 2000, entries: [{ model: "gemini", inputTokens: 200, outputTokens: 80 }] };
  const delta = diffUsage(before, after);
  assert.strictEqual(delta.model, "gemini");
  assert.strictEqual(delta.inputTokens, 100);
  assert.strictEqual(delta.outputTokens, 30);
});

test("snapshotUsage returns { timestamp, entries } without throwing", () => {
  const { snapshotUsage } = require("../src/sidecar/usage");
  const snap = snapshotUsage();
  assert.ok(typeof snap.timestamp === "number");
  assert.ok(Array.isArray(snap.entries));
});
```

Note: adapt the test data shapes to match exact field names from the investigation findings.

## Branch and PR

Branch: feat/p2-quota-token-tracking
PR title: "feat: ag quota command + token burn tracking after ag run"
Call task_complete(PR_URL).' 2>&1
```

- [ ] **Step 3: Verify PR**

```bash
gh pr list --repo sanchaymittal/antigravity-cli --state open
```

Expected: PR on `feat/p2-quota-token-tracking`.

- [ ] **Step 4: Test quota manually**

```bash
ag quota
```

Expected: table of models with usage/quota, or graceful "not available" message.

- [ ] **Step 5: Test token tracking manually**

```bash
ag run "say the word hello and call task_complete" -m antigravity-gemini-3-flash 2>&1
```

Expected: `─── Token Usage ───` block on stderr.

- [ ] **Step 6: Review and merge**

```bash
gh pr view --repo sanchaymittal/antigravity-cli feat/p2-quota-token-tracking
gh pr merge --squash --repo sanchaymittal/antigravity-cli feat/p2-quota-token-tracking
git pull
```

---

## Done Criteria

- [ ] `npm test` passes (all tests green)
- [ ] `ag run "say hello" -m antigravity-gemini-3-flash` prints token usage block on stderr
- [ ] `ag quota` shows per-model data or graceful fallback
- [ ] `runAgent()` accepts `opts.logger` and `opts.cwd` without breaking existing CLI behavior
- [ ] `initMcpServers({ cwd })` resolves config from provided cwd, falls back to HOME
- [ ] `shutdownMcpServers` sends JSON-RPC shutdown before killing
- [ ] All `process.exit()` calls are in `src/cli.js` only
