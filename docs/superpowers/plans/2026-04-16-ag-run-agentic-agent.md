# ag run — Agentic Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `ag run <intent>` — a full agentic loop with built-in file/bash tools and optional stdio MCP connectivity, making antigravity-cli usable as a chanakya sub-agent like gemini-cli.

**Architecture:** Built-in tools (read_file, write_file, run_bash) + optional stdio MCP client reading `.ag/mcp.json` from CWD. Agentic loop calls `callRawInference` repeatedly with tool results until the model stops calling tools or calls `task_complete`. Both repos ship together: antigravity-cli adds `ag run`, chanakya's `AntigravityCliAgent` wires it up.

**Tech Stack:** Node.js CJS, `child_process` (spawn/execSync), JSON-RPC 2.0 over stdio, Commander.js, existing `callRawInference`/`parseToolCalls` from `src/sidecar/raw.js`.

**Spec:** `docs/superpowers/specs/2026-04-16-ag-run-agentic-agent-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/model-enum.js` | Create | Shared VALUE_TO_MODEL_ENUM constant |
| `src/tools/builtin.js` | Create | read_file, write_file, run_bash tool definitions + executors |
| `src/mcp/client.js` | Create | Stdio JSON-RPC MCP client, reads `.ag/mcp.json` |
| `src/agent.js` | Create | Agentic loop: inference → tool calls → observations → repeat |
| `src/cli.js` | Modify | Add `ag run` command, import model-enum |
| `../chanakya/src/agents/antigravity-cli-agent.ts` | Modify | bootstrap writes AGENTS.md, start writes `.ag/mcp.json`, spawns `ag run` |

---

## Task 1: Extract VALUE_TO_MODEL_ENUM to shared module

**Files:**
- Create: `src/model-enum.js`
- Modify: `src/cli.js` (lines 10-18 — remove inline map, add require)

- [ ] **Step 1: Create `src/model-enum.js`**

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

- [ ] **Step 2: Update `src/cli.js` — replace inline map with import**

Remove lines 10-18 from `src/cli.js`:
```js
// Model enum — maps sidecar numeric value → GetModelResponse string enum
const VALUE_TO_MODEL_ENUM = {
  1018: 'MODEL_PLACEHOLDER_M18',
  1037: 'MODEL_PLACEHOLDER_M37',
  1036: 'MODEL_PLACEHOLDER_M36',
  1035: 'MODEL_PLACEHOLDER_M35',
  1026: 'MODEL_PLACEHOLDER_M26',
  342:  'MODEL_PLACEHOLDER_M42',
};
```

Add to the top-of-file requires (after existing requires):
```js
const { VALUE_TO_MODEL_ENUM } = require('./model-enum');
```

- [ ] **Step 3: Verify existing commands still work**

```bash
ag --version          # expect: 0.1.0
ag models             # expect: 6 models listed
ag chat "say hi"      # expect: response from sidecar
```

- [ ] **Step 4: Commit**

```bash
git add src/model-enum.js src/cli.js
git commit -m "refactor: extract VALUE_TO_MODEL_ENUM to src/model-enum.js"
```

---

## Task 2: Built-in tools module

**Files:**
- Create: `src/tools/builtin.js`

- [ ] **Step 1: Create `src/tools/builtin.js`**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const readFile = {
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Returns file contents as a string.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file (relative to CWD or absolute)' },
        },
        required: ['path'],
      },
    },
  },
  execute: async ({ path: filePath }) => {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      return `Error reading file: ${err.message}`;
    }
  },
};

const writeFile = {
  definition: {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  execute: async ({ path: filePath, content }) => {
    try {
      fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf8');
      return 'ok';
    } catch (err) {
      return `Error writing file: ${err.message}`;
    }
  },
};

const runBash = {
  definition: {
    type: 'function',
    function: {
      name: 'run_bash',
      description: 'Run a shell command. Returns stdout, stderr, and exit_code as JSON.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run' },
        },
        required: ['command'],
      },
    },
  },
  execute: async ({ command }) => {
    try {
      const stdout = execSync(command, { encoding: 'utf8', timeout: 30000, shell: true });
      return JSON.stringify({ stdout, stderr: '', exit_code: 0 });
    } catch (err) {
      return JSON.stringify({
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exit_code: err.status || 1,
      });
    }
  },
};

const BUILTIN_TOOLS = [readFile, writeFile, runBash];

module.exports = { BUILTIN_TOOLS };
```

- [ ] **Step 2: Verify read_file works**

```bash
node -e "
const { BUILTIN_TOOLS } = require('./src/tools/builtin');
const t = BUILTIN_TOOLS.find(t => t.definition.function.name === 'read_file');
t.execute({ path: 'package.json' }).then(r => {
  const parsed = JSON.parse(r);
  console.log('read_file OK, name:', parsed.name);
});
"
```

Expected output: `read_file OK, name: antigravity-cli`

- [ ] **Step 3: Verify write_file works**

```bash
node -e "
const { BUILTIN_TOOLS } = require('./src/tools/builtin');
const t = BUILTIN_TOOLS.find(t => t.definition.function.name === 'write_file');
t.execute({ path: '/tmp/ag-test.txt', content: 'hello' }).then(r => {
  console.log('write_file result:', r);
  const fs = require('fs');
  console.log('file contents:', fs.readFileSync('/tmp/ag-test.txt', 'utf8'));
});
"
```

Expected output:
```
write_file result: ok
file contents: hello
```

- [ ] **Step 4: Verify run_bash works**

```bash
node -e "
const { BUILTIN_TOOLS } = require('./src/tools/builtin');
const t = BUILTIN_TOOLS.find(t => t.definition.function.name === 'run_bash');
t.execute({ command: 'echo hello' }).then(r => {
  const parsed = JSON.parse(r);
  console.log('stdout:', parsed.stdout.trim(), '| exit_code:', parsed.exit_code);
});
"
```

Expected output: `stdout: hello | exit_code: 0`

- [ ] **Step 5: Verify run_bash error handling**

```bash
node -e "
const { BUILTIN_TOOLS } = require('./src/tools/builtin');
const t = BUILTIN_TOOLS.find(t => t.definition.function.name === 'run_bash');
t.execute({ command: 'exit 1' }).then(r => {
  const parsed = JSON.parse(r);
  console.log('exit_code:', parsed.exit_code);
});
"
```

Expected output: `exit_code: 1`

- [ ] **Step 6: Commit**

```bash
git add src/tools/builtin.js
git commit -m "feat: add built-in tools module (read_file, write_file, run_bash)"
```

---

## Task 3: MCP client module

**Files:**
- Create: `src/mcp/client.js`

- [ ] **Step 1: Create `src/mcp/client.js`**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function readMcpConfig() {
  const configPath = path.join(process.cwd(), '.ag', 'mcp.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { mcpServers: {} };
  }
}

function spawnMcpServer(serverName, config) {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.command, config.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let buffer = '';
    let requestId = 0;
    const pending = new Map();

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && pending.has(msg.id)) {
            const { resolve: res, reject: rej } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
            else res(msg.result);
          }
        } catch { /* ignore parse errors */ }
      }
    });

    proc.stderr.on('data', (chunk) => {
      if (process.env.AG_DEBUG) process.stderr.write(`[mcp:${serverName}] ${chunk}`);
    });

    proc.on('error', reject);

    const send = (method, params) => {
      const id = ++requestId;
      return new Promise((res, rej) => {
        pending.set(id, { resolve: res, reject: rej });
        const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
        proc.stdin.write(msg);
      });
    };

    // MCP handshake
    send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ag', version: '0.1.0' },
    })
      .then(() => {
        proc.stdin.write(
          JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n',
        );
        resolve({ proc, send });
      })
      .catch(reject);

    // Reject if server exits before init completes
    proc.once('exit', (code) => {
      reject(new Error(`MCP server "${serverName}" exited with code ${code} before initialization`));
    });
  });
}

async function initMcpServers() {
  const config = readMcpConfig();
  const servers = config.mcpServers || {};
  const clients = new Map();
  const tools = [];

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    try {
      const client = await spawnMcpServer(serverName, serverConfig);

      // Remove the early-exit listener once init succeeds
      client.proc.removeAllListeners('exit');
      client.proc.on('exit', (code) => {
        if (process.env.AG_DEBUG) process.stderr.write(`[mcp:${serverName}] exited with code ${code}\n`);
        clients.delete(serverName);
      });

      const result = await client.send('tools/list', {});
      const serverTools = result.tools || [];
      clients.set(serverName, client);

      for (const tool of serverTools) {
        tools.push({
          definition: {
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description || '',
              parameters: tool.inputSchema || { type: 'object', properties: {} },
            },
          },
          serverName,
          toolName: tool.name,
        });
      }
    } catch (err) {
      process.stderr.write(`Warning: MCP server "${serverName}" failed: ${err.message}\n`);
    }
  }

  return { tools, clients };
}

async function callMcpTool(clients, serverName, toolName, args) {
  const client = clients.get(serverName);
  if (!client) return `Error: MCP server "${serverName}" not available`;
  try {
    const result = await client.send('tools/call', { name: toolName, arguments: args });
    const content = result.content || [];
    return content.map((c) => (c.type === 'text' ? c.text : JSON.stringify(c))).join('\n');
  } catch (err) {
    return `Error calling tool "${toolName}": ${err.message}`;
  }
}

async function shutdownMcpServers(clients) {
  for (const [, client] of clients) {
    try {
      client.proc.stdin.end();
      client.proc.kill('SIGTERM');
    } catch { /* already dead */ }
  }
}

module.exports = { initMcpServers, callMcpTool, shutdownMcpServers };
```

- [ ] **Step 2: Verify missing config is handled gracefully**

```bash
node -e "
const { initMcpServers, shutdownMcpServers } = require('./src/mcp/client');
initMcpServers().then(({ tools, clients }) => {
  console.log('tools:', tools.length, '(expect 0 — no .ag/mcp.json in repo root)');
  shutdownMcpServers(clients);
  console.log('OK');
});
"
```

Expected output:
```
tools: 0 (expect 0 — no .ag/mcp.json in repo root)
OK
```

- [ ] **Step 3: Commit**

```bash
git add src/mcp/client.js
git commit -m "feat: add stdio MCP client (reads .ag/mcp.json, JSON-RPC over stdio)"
```

---

## Task 4: Agentic loop

**Files:**
- Create: `src/agent.js`

- [ ] **Step 1: Create `src/agent.js`**

```js
'use strict';

const { callRawInference } = require('./sidecar/raw');
const { BUILTIN_TOOLS } = require('./tools/builtin');
const { callMcpTool } = require('./mcp/client');

const MAX_TURNS = 50;

function makeSystemPrompt() {
  return [
    `You are a coding agent working in ${process.cwd()}.`,
    'Use tools to complete the task. When done, call task_complete with a summary.',
    'Do not ask for clarification — proceed with reasonable assumptions.',
    'Do not hallucinate tool results — wait for real observations before continuing.',
  ].join('\n');
}

async function runAgent(ctx, intent, modelEnum, mcpData) {
  const { tools: mcpTools, clients } = mcpData;

  // Build tool index: name → executor descriptor
  const toolIndex = new Map();
  for (const t of BUILTIN_TOOLS) {
    toolIndex.set(t.definition.function.name, { execute: t.execute });
  }
  for (const t of mcpTools) {
    toolIndex.set(t.definition.function.name, {
      serverName: t.serverName,
      toolName: t.toolName,
      isMcp: true,
    });
  }

  const allToolDefs = [
    ...BUILTIN_TOOLS.map((t) => t.definition),
    ...mcpTools.map((t) => t.definition),
  ];

  const messages = [
    { role: 'system', content: makeSystemPrompt() },
    { role: 'user', content: intent },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const result = await callRawInference(ctx, messages, modelEnum, allToolDefs);

    if (result.content) {
      process.stdout.write(result.content);
      if (!result.content.endsWith('\n')) process.stdout.write('\n');
    }

    if (!result.toolCalls || result.toolCalls.length === 0) break;

    messages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls,
    });

    for (const toolCall of result.toolCalls) {
      const name = toolCall.function.name;
      let args;
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        args = {};
      }

      const entry = toolIndex.get(name);
      let observation;

      if (!entry) {
        observation = `Error: unknown tool "${name}"`;
      } else if (entry.isMcp) {
        observation = await callMcpTool(clients, entry.serverName, entry.toolName, args);
      } else {
        observation = await entry.execute(args);
      }

      if (name === 'task_complete') {
        process.stdout.write(`\nDone: ${observation}\n`);
        return { done: true };
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name,
        content: observation,
      });
    }
  }

  if (messages.length > 2) {
    process.stderr.write('Warning: agent reached max turns without calling task_complete\n');
  }

  return { done: false };
}

module.exports = { runAgent };
```

- [ ] **Step 2: Verify module loads without errors**

```bash
node -e "const { runAgent } = require('./src/agent'); console.log('agent loaded OK, type:', typeof runAgent);"
```

Expected output: `agent loaded OK, type: function`

- [ ] **Step 3: Commit**

```bash
git add src/agent.js
git commit -m "feat: add agentic loop (max 50 turns, built-in + MCP tools)"
```

---

## Task 5: Add `ag run` command to CLI

**Files:**
- Modify: `src/cli.js`

- [ ] **Step 1: Add requires and `ag run` command to `src/cli.js`**

Add after the existing requires at the top of `src/cli.js`:
```js
const { runAgent } = require('./agent');
const { initMcpServers, shutdownMcpServers } = require('./mcp/client');
```

Add this command block after the `ag chat` command and before `program.parse()`:

```js
// ── ag run ──────────────────────────────────

program
  .command('run <intent>')
  .description('Run an agentic task (reads/writes files, runs commands, uses MCP tools)')
  .option('-m, --model <model>', 'Model to use', DEFAULT_MODEL_KEY)
  .action(async (intent, opts) => {
    const ctx = makeCtx();

    // Resolve model
    if (!MODEL_MAP[opts.model] && opts.model !== DEFAULT_MODEL_KEY) {
      const lower = opts.model.toLowerCase();
      const match = Object.keys(MODEL_MAP).find((k) => k.includes(lower) || lower.includes(k));
      if (!match) {
        console.error(`Unknown model: ${opts.model}`);
        console.error('Run `ag models` to list available models.');
        process.exit(1);
      }
      opts.model = match;
    }

    const resolved = resolveModel(opts.model);
    const modelEnum = VALUE_TO_MODEL_ENUM[resolved.value];

    if (!modelEnum) {
      console.error(`Unknown model: ${opts.model}`);
      console.error('Run `ag models` to list available models.');
      process.exit(1);
    }

    // Discover sidecar
    const info = await discoverSidecar(ctx);
    if (!info) fatalNoSidecar();

    // Init MCP (silent if no .ag/mcp.json)
    const mcpData = await initMcpServers();

    const cleanup = async () => {
      await shutdownMcpServers(mcpData.clients);
    };

    try {
      const result = await runAgent(ctx, intent, modelEnum, mcpData);
      await cleanup();
      process.exit(result.done ? 0 : 1);
    } catch (err) {
      await cleanup();
      if (
        err.message.includes('not discovered') ||
        err.message.includes('not found') ||
        err.message.includes('No reachable')
      ) {
        fatalNoSidecar();
      }
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
```

- [ ] **Step 2: Verify `ag run --help` works**

```bash
ag run --help
```

Expected output includes:
```
Usage: ag run [options] <intent>

Run an agentic task (reads/writes files, runs commands, uses MCP tools)

Options:
  -m, --model <model>  Model to use (default: "antigravity-claude-sonnet-4-6")
```

- [ ] **Step 3: Smoke test — simple task with no MCP**

Run from the repo root (no `.ag/mcp.json` present — MCP init returns zero tools):

```bash
ag run "what files are in the current directory? use run_bash to list them and then tell me the count"
```

Expected: model calls `run_bash` with `ls`, receives file list, prints a summary. Exits 0 (no `task_complete` tool available, loop ends naturally when model stops calling tools).

- [ ] **Step 4: Smoke test — write a file**

```bash
cd /tmp && ag run "write a file called hello.txt with the content 'hello from ag'"
```

```bash
cat /tmp/hello.txt
```

Expected: `hello from ag`

- [ ] **Step 5: Commit**

```bash
git add src/cli.js
git commit -m "feat: add ag run command — agentic loop with built-in tools and MCP"
```

---

## Task 6: Update chanakya AntigravityCliAgent

**Files:**
- Modify: `../chanakya/src/agents/antigravity-cli-agent.ts`

- [ ] **Step 1: Replace `antigravity-cli-agent.ts` content**

```ts
import { execSync, spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import type { ChildProcess } from 'child_process'
import type { CodingAgent } from './index'
import { AGENT_STDIO_CONFIG } from './constants'

const AGENT_BOOTSTRAP_RULES = [
  '# Agent Rules',
  '',
  '1. Use tools to complete the task — read files, write files, run commands as needed.',
  '2. When your work is complete, call task_complete with a summary of what you did.',
  '3. Do not ask for clarification — proceed with reasonable assumptions.',
  '4. Do not hallucinate tool results — wait for real observations before continuing.',
].join('\n')

export class AntigravityCliAgent implements CodingAgent {
  name = 'antigravity'

  constructor(private model: string = 'antigravity-claude-sonnet-4-6') {}

  async available(): Promise<boolean> {
    try {
      execSync('ag run --help 2>&1', { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  isOneShot(): boolean {
    return true
  }

  async bootstrap(sandboxRoot: string): Promise<void> {
    fs.writeFileSync(path.join(sandboxRoot, 'AGENTS.md'), AGENT_BOOTSTRAP_RULES)
  }

  async start(sessionId: string, mcpUrl: string, intent: string, workdir?: string): Promise<ChildProcess> {
    if (workdir) {
      const agDir = path.join(workdir, '.ag')
      fs.mkdirSync(agDir, { recursive: true })
      fs.writeFileSync(
        path.join(agDir, 'mcp.json'),
        JSON.stringify(
          {
            mcpServers: {
              chanakya: {
                command: 'npx',
                args: ['-y', 'mcp-remote', `${mcpUrl}/mcp`, '--allow-http', '--transport', 'http-only'],
              },
            },
          },
          null,
          2,
        ),
      )
    }

    return spawn('ag', ['run', '-m', this.model, intent], {
      cwd: workdir,
      stdio: AGENT_STDIO_CONFIG,
      env: { ...process.env },
    })
  }
}
```

- [ ] **Step 2: Rebuild chanakya**

```bash
cd /Users/sanchaymittal/github/chanakya && npm run build 2>&1
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 3: Verify available() uses new detection**

```bash
cd /Users/sanchaymittal/github/chanakya && node -e "
const { AntigravityCliAgent } = require('./dist/agents/antigravity-cli-agent');
const agent = new AntigravityCliAgent();
agent.available().then(r => console.log('available:', r));
"
```

Expected: `available: true`

- [ ] **Step 4: Commit chanakya changes**

```bash
cd /Users/sanchaymittal/github/chanakya
git add src/agents/antigravity-cli-agent.ts
git commit -m "feat(agents): wire AntigravityCliAgent to ag run with MCP + AGENTS.md bootstrap"
```

---

## Task 7: End-to-end test

- [ ] **Step 1: Create a temp workdir and run a file-writing task**

```bash
mkdir -p /tmp/ag-e2e-test && cd /tmp/ag-e2e-test
ag run "create a file called result.txt containing the output of 'date' command"
```

Expected: model calls `run_bash` with `date`, then `write_file` with the output. Prints summary. Exits 0.

```bash
cat /tmp/ag-e2e-test/result.txt
```

Expected: current date string.

- [ ] **Step 2: Verify multi-turn tool use**

```bash
cd /tmp/ag-e2e-test
ag run "read result.txt, append ' — verified' to its contents, and write it back"
```

Expected: model calls `read_file`, then `write_file`. Updated file ends with `— verified`.

```bash
cat /tmp/ag-e2e-test/result.txt
```

- [ ] **Step 3: Verify bad model error still works**

```bash
ag run -m badmodel "test"
```

Expected:
```
Unknown model: badmodel
Run `ag models` to list available models.
```
Exit code 1.

- [ ] **Step 4: Verify existing commands unbroken**

```bash
ag --version   # 0.1.0
ag models      # 6 models listed
ag status      # sidecar found
ag chat "hi"   # response from sidecar
```

- [ ] **Step 5: Final commit on antigravity-cli if any cleanup needed**

```bash
cd /Users/sanchaymittal/github/antigravity-cli
git status     # should be clean
```
