# ag Interactive REPL — Design

**Date:** 2026-04-16
**Status:** approved
**Scope:** antigravity-cli only

---

## Goal

Add interactive REPL mode to `ag` — `ag` with no args enters a persistent multi-turn agent session, matching gemini-cli's interactive mode. User types messages, agent responds (optionally using tools), conversation continues until Ctrl+C/D.

---

## Architecture

```
ag (no args)
  → discoverSidecar()        (fatal if not found)
  → initMcpServers()         (loads .ag/mcp.json from CWD, silent if missing)
  → replLoop(ctx, modelEnum, mcpData)
      readline.createInterface(stdin, stdout)
      messages = []
      print 'ag> '

      on line input:
        if input.trim() empty → re-prompt
        if input === 'exit' or 'quit' → exit 0
        messages.push({ role: 'user', content: input })
        run replTurn(ctx, messages, modelEnum, mcpData)
        print 'ag> '

      on close (Ctrl+C / Ctrl+D):
        shutdownMcpServers(clients)
        exit 0
```

**Per-turn loop (replTurn):**
```
for toolCallCount in 0..14:
  { content, toolCalls } = callRawInference(ctx, messages, modelEnum, allTools)

  if content → process.stdout.write(content + '\n')

  if !toolCalls or toolCalls.length === 0:
    messages.push({ role: 'assistant', content })
    return   ← control returns to readline

  messages.push({ role: 'assistant', content, tool_calls: toolCalls })

  for each toolCall:
    observation = executeTool(toolCall)   ← same dispatch as agent.js
    messages.push({ role: 'tool', name: toolCall.name, content: observation })

if toolCallCount === 14:
  stderr.write('[ag] max tool calls per turn reached\n')
  return
```

---

## New File: `src/repl.js`

Exports one function:
```js
async function runRepl(ctx, modelEnum, mcpData)
```

- `ctx` — sidecar context (same shape as agent.js)
- `modelEnum` — resolved model enum int
- `mcpData` — `{ tools, clients }` from initMcpServers()

Responsibilities:
- Create readline interface
- Maintain `messages[]` conversation history (in-memory, session only)
- Run `replTurn` per user input
- Handle `exit`/`quit` keywords
- Handle readline `close` event (Ctrl+C/D)
- On exit: call `shutdownMcpServers(mcpData.clients)` then `process.exit(0)`

**System prompt** (different from agent.js — no task_complete):
```
You are a helpful coding assistant working in <cwd>.
You have tools to read files, write files, and run bash commands.
Use them when helpful. Be concise.
```

**No `task_complete` tool in REPL** — it is not included in `allTools`. Conversation ends when user exits.

**Tool availability:** same built-in tools (read_file, write_file, run_bash) + MCP tools from `.ag/mcp.json`.

---

## Modified: `src/cli.js`

Two changes:

1. **Default action (no subcommand):** when `ag` is invoked with no args and no recognized subcommand, run REPL mode:
```js
program
  .action(async () => {
    // default: enter REPL
    const ctx = await discoverSidecar();
    const mcpData = await initMcpServers();
    await runRepl(ctx, DEFAULT_MODEL_ENUM, mcpData);
  });
```

2. **`ag repl` subcommand** (optional explicit entry):
```js
program
  .command('repl')
  .description('Start interactive agent REPL')
  .option('-m, --model <model>', 'Model to use')
  .action(async (opts) => {
    const modelEnum = resolveModelEnum(opts.model);
    const ctx = await discoverSidecar();
    const mcpData = await initMcpServers();
    await runRepl(ctx, modelEnum, mcpData);
  });
```

---

## Shared Utilities (no new file needed)

`replTurn` reuses:
- `callRawInference` from `src/sidecar/raw.js`
- `executeTool` logic from `src/agent.js` — extract into shared helper or duplicate minimally
- `initMcpServers`, `shutdownMcpServers` from `src/mcp/client.js`
- Built-in tool registry from `src/tools/builtin.js`

To avoid duplicating tool dispatch logic, extract `buildToolRegistry(mcpData)` and `executeTool(registry, toolCall)` from `agent.js` into a shared helper OR inline the logic in `repl.js` (acceptable given small size).

---

## UX

- Prompt: `ag> ` (printed before each input)
- Assistant response printed to stdout, no prefix
- Tool calls silent unless `AG_DEBUG=1` (stderr only)
- Errors (sidecar unreachable, inference failure) printed to stderr, REPL continues
- `exit` or `quit` keyword → clean exit

---

## Out of Scope

- Persistent session save/restore across processes
- Slash commands (`/run`, `/clear`, `/help`)
- Color/formatting (no chalk)
- Spinner during inference
- Multi-line input
- History file (readline history within session only)

---

## File Summary

| File | Change |
|------|--------|
| `src/repl.js` | new — REPL loop + replTurn |
| `src/cli.js` | modified — default action + `ag repl` command |
