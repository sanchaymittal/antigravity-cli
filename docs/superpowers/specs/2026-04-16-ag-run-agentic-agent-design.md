# ag run — Agentic Agent Design

**Date:** 2026-04-16
**Status:** approved
**Scope:** antigravity-cli + chanakya AntigravityCliAgent

---

## Goal

Make `antigravity-cli` work like `gemini-cli` — a full coding agent CLI. Given a task, it reads/writes files, runs commands, uses MCP tools, and exits when done. Used by chanakya as a sub-agent (`--agent antigravity`).

---

## Architecture

```
chanakya bootstrap:
  write AGENTS.md to sandboxRoot
  write .ag/mcp.json to workdir (chanakya MCP server config)

chanakya start:
  spawn `ag run -m <model> "intent"` with cwd=workdir

ag run:
  discoverSidecar()
  initMcpServers()        ← reads .ag/mcp.json from CWD (silent if missing)
  agentLoop(intent)       ← built-in tools + MCP tools
  shutdownMcpServers()
  exit 0
```

**Data flow per turn:**
```
callRawInference(ctx, messages, modelEnum, allTools)
  ↓
{ content, toolCalls }
  ↓
if toolCalls → execute each → append observation → loop
if no toolCalls → done
if task_complete → print summary → exit 0
```

---

## New Files

### `src/model-enum.js`

Extracted from `cli.js`. Shared by `ag chat` and `ag run`.

```js
'use strict';
const VALUE_TO_MODEL_ENUM = {
  1018: 'MODEL_PLACEHOLDER_M18',
  1037: 'MODEL_PLACEHOLDER_M37',
  1036: 'MODEL_PLACEHOLDER_M36',
  1035: 'MODEL_PLACEHOLDER_M35',
  1026: 'MODEL_PLACEHOLDER_M26',
  342:  'MODEL_PLACEHOLDER_M42',
};
module.exports = { VALUE_TO_MODEL_ENUM };
```

---

### `src/tools/builtin.js`

Three built-in tools. Each exported as `{ definition, execute }`.

**`read_file({ path })`**
- Reads file at path (relative to CWD)
- Returns file contents as string
- On error: returns error message string (does not throw)

**`write_file({ path, content })`**
- Writes content to path, creates parent dirs if needed
- Returns `"ok"`
- On error: returns error message string

**`run_bash({ command })`**
- Runs command in shell with 30s timeout
- Returns JSON string: `{ stdout, stderr, exit_code }`
- Each call is independent (no persistent shell session)
- No sandboxing — intentional for agent context (matches gemini-cli --yolo)

Tool definition shape:
```js
{
  definition: {
    type: 'function',
    function: {
      name: string,
      description: string,
      parameters: { type: 'object', properties: {...}, required: [...] }
    }
  },
  execute: async (args) => string   // always returns string
}
```

---

### `src/mcp/client.js`

Stdio MCP client. Reads `.ag/mcp.json` from `process.cwd()`.

**Config format** (same as `.antigravity/mcp.json`):
```json
{
  "mcpServers": {
    "chanakya": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://.../mcp", "--allow-http", "--transport", "http-only"]
    }
  }
}
```

**Init flow:**
1. Read `.ag/mcp.json` — silently return empty if file missing
2. For each server: `spawn(command, args)` → JSON-RPC over stdin/stdout
3. Send `initialize` handshake → `tools/list`
4. Convert MCP tool schemas → OpenAI tool definitions, tagged with `serverName`

**Exported API:**
```js
async function initMcpServers()
// → { tools: [{ definition, serverName, toolName }], clients: Map }

async function callMcpTool(clients, serverName, toolName, args)
// → string (result or error message)

async function shutdownMcpServers(clients)
// kill all spawned subprocesses
```

**Error handling:** if a server fails to start or crashes → log warning to stderr, remove its tools, continue with remaining tools.

---

### `src/agent.js`

The agentic loop.

**System prompt:**
```
You are a coding agent working in <cwd>.
Use tools to complete the task. When done, call task_complete with a summary.
Do not ask for clarification — proceed with reasonable assumptions.
```

**Loop (max 50 turns):**
```
messages = [{ role: 'system', content: systemPrompt },
            { role: 'user', content: intent }]

allTools = builtin tools + MCP tools

for turn in 0..49:
  result = callRawInference(ctx, messages, modelEnum, allTools)

  if result.content → process.stdout.write(result.content)

  if !result.toolCalls → break  (model finished)

  messages.push({ role: 'assistant', content: result.content, tool_calls: result.toolCalls })

  for each toolCall:
    observation = executeTool(toolCall)
    if toolCall.name == 'task_complete' → print summary, exit 0
    messages.push({ role: 'tool', name: toolCall.name, content: observation })

if turn == 49 → stderr "Max turns reached", exit 1
```

**Tool dispatch:** check builtins first by name, then MCP tools by name. Unknown tool → observation: `"Error: unknown tool <name>"`, continue (no crash).

**Output:** assistant text → stdout. Tool names/observations → stderr only if `AG_DEBUG=1`.

---

## Changed Files

### `src/cli.js`

1. Remove `VALUE_TO_MODEL_ENUM` — import from `src/model-enum.js` instead
2. Add `ag run` command:

```
ag run <intent>           run agentic loop with default model
ag run -m <model> <intent>  run with specific model
```

- Discovers sidecar (fatal if not found)
- Calls `initMcpServers()` (silent if no `.ag/mcp.json`)
- Calls `runAgent(ctx, intent, modelEnum, mcpData)`
- Calls `shutdownMcpServers()` on exit (success or error)

---

### `../chanakya/src/agents/antigravity-cli-agent.ts`

**`bootstrap(sandboxRoot)`:**
```ts
fs.writeFileSync(path.join(sandboxRoot, 'AGENTS.md'), AGENT_BOOTSTRAP_RULES)
```

`AGENT_BOOTSTRAP_RULES` written to `AGENTS.md`:
```
# Agent Rules
1. Use tools to complete the task — read files, write files, run commands as needed.
2. When your work is complete, call task_complete with a summary of what you did.
3. Do not ask for clarification — proceed with reasonable assumptions.
4. Do not hallucinate tool results — wait for real observations before continuing.
```

**`start(sessionId, mcpUrl, intent, workdir)`:**
```ts
// write .ag/mcp.json
const agDir = path.join(workdir, '.ag')
fs.mkdirSync(agDir, { recursive: true })
fs.writeFileSync(path.join(agDir, 'mcp.json'), JSON.stringify({
  mcpServers: {
    chanakya: {
      command: 'npx',
      args: ['-y', 'mcp-remote', `${mcpUrl}/mcp`, '--allow-http', '--transport', 'http-only']
    }
  }
}, null, 2))

return spawn('ag', ['run', '-m', this.model, intent], {
  cwd: workdir,
  stdio: AGENT_STDIO_CONFIG,
  env: { ...process.env },
})
```

`isOneShot()` stays `true` — ag process exits when `task_complete` is called; process exit = completion signal to chanakya harness.

---

## Out of Scope (v1)

- Streaming output (sidecar is unary)
- Spinner / color output
- Interactive REPL
- Session persistence / resume
- mempalace MCP (chanakya MCP is sufficient for v1)
- Sandboxing of run_bash
- Token counting

---

## File Summary

| File | Change |
|------|--------|
| `src/model-enum.js` | new — extracted VALUE_TO_MODEL_ENUM |
| `src/tools/builtin.js` | new — read_file, write_file, run_bash |
| `src/mcp/client.js` | new — stdio MCP client |
| `src/agent.js` | new — agentic loop |
| `src/cli.js` | modified — add `ag run`, import model-enum |
| `../chanakya/src/agents/antigravity-cli-agent.ts` | modified — bootstrap + start |
