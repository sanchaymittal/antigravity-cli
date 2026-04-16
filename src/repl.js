'use strict';
const readline = require('node:readline');
const { callRawInference } = require('./sidecar/raw.js');
const { shutdownMcpServers } = require('./mcp/client.js');
const { buildAllTools, executeTool } = require('./tools/dispatch.js');
const { colors, printBanner, printToolCall, printResponse, printError } = require("./ui");

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
    if (process.stderr.isTTY) process.stderr.write("\x1b[2mThinking...\x1b[0m\n");
    
    let response;
    try {
      response = await infer(ctx, messages, modelEnum, toolDefs);
      if (process.stderr.isTTY) process.stderr.write("\x1b[1A\x1b[2K");
    } catch (err) {
      throw err;
    }

    const { content, toolCalls } = response;

    if (content) printResponse(content);

    if (!toolCalls || toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: content || '' });
      return;
    }

    messages.push({ role: 'assistant', content: content || '', tool_calls: toolCalls });

    for (const toolCall of toolCalls) {
      printToolCall(toolCall.name, toolCall.args_parsed || toolCall.arguments);
      const observation = await executeTool(allTools, mcpData.clients, toolCall);
      if (process.env.AG_DEBUG === '1') {
        process.stderr.write(`[tool:${toolCall.name}] ${observation}\n`);
      }
      messages.push({ role: 'tool', name: toolCall.name, content: observation });
    }
  }

  printError('max tool calls per turn reached');
}

async function runRepl(ctx, modelEnum, mcpData, modelKey) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT(process.cwd()) }];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });

  printBanner(modelKey || modelEnum);

  const promptStr = "\x1b[36m\x1b[1m❯\x1b[0m ";
  rl.setPrompt(promptStr);

  let busy = false;

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }
    if (trimmed === "exit" || trimmed === "quit") {
      if (busy) { rl.prompt(); return; }
      rl.close();
      return;
    }

    rl.pause();
    busy = true;

    messages.push({ role: "user", content: trimmed });

    try {
      await replTurn(ctx, messages, modelEnum, mcpData);
    } catch (err) {
      printError(err.message);
    }

    busy = false;
    rl.resume();
    rl.prompt();
  });

  rl.on("close", async () => {
    process.stdout.write("\n");
    await shutdownMcpServers(mcpData.clients);
    process.exit(0);
  });

  rl.prompt();
}

module.exports = { runRepl, replTurn };
