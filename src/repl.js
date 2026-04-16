'use strict';
const readline = require('node:readline');
const { callRawInference } = require('./sidecar/raw.js');
const { shutdownMcpServers } = require('./mcp/client.js');
const { buildAllTools, executeTool } = require('./tools/dispatch.js');

const MAX_TOOL_CALLS_PER_TURN = 15;

const SYSTEM_PROMPT = (cwd) =>
  `You are a helpful coding assistant working in ${cwd}.\n` +
  `You have tools to read files, write files, and run bash commands.\n` +
  `Use them when helpful. Be concise.`;

/**
 * Run one REPL turn. Mutates messages[]. Exported for testing (accepts optional inferFn).
 */
async function replTurn(ctx, messages, modelEnum, mcpData, inferFn) {
  const allTools = buildAllTools(mcpData);
  const toolDefs = allTools.map(t => t.definition);
  const infer = inferFn || ((c, m, e, t) => callRawInference(c, m, e, t));

  for (let i = 0; i < MAX_TOOL_CALLS_PER_TURN; i++) {
    const { content, toolCalls } = await infer(ctx, messages, modelEnum, toolDefs);

    if (content) process.stdout.write(content + '\n');

    if (!toolCalls || toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: content || '' });
      return;
    }

    messages.push({ role: 'assistant', content: content || '', tool_calls: toolCalls });

    for (const toolCall of toolCalls) {
      const observation = await executeTool(allTools, mcpData.clients, toolCall);
      if (process.env.AG_DEBUG === '1') {
        process.stderr.write(`[tool:${toolCall.name}] ${observation}\n`);
      }
      messages.push({ role: 'tool', name: toolCall.name, content: observation });
    }
  }

  process.stderr.write('[ag] max tool calls per turn reached\n');
}

async function runRepl(ctx, modelEnum, mcpData) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT(process.cwd()) }];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });

  const prompt = () => process.stdout.write('ag> ');
  prompt();

  try {
    for await (const line of rl) {
      const input = line.trim();
      if (!input) { prompt(); continue; }
      if (input === 'exit' || input === 'quit') break;

      messages.push({ role: 'user', content: input });

      try {
        await replTurn(ctx, messages, modelEnum, mcpData);
      } catch (err) {
        process.stderr.write(`[ag] error: ${err.message}\n`);
      }

      prompt();
    }
  } finally {
    rl.close();
    await shutdownMcpServers(mcpData.clients);
  }

  process.exit(0);
}

module.exports = { runRepl, replTurn };
