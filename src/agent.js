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

  let turn;
  for (turn = 0; turn < MAX_TURNS; turn++) {
    const currentToolDefs = turn === 0
      ? allToolDefs.filter((t) => t.function.name !== 'task_complete')
      : allToolDefs;

    let result;
    try {
      result = await callRawInference(ctx, messages, modelEnum, currentToolDefs);
    } catch (err) {
      console.error(`Inference error: ${err.message}`);
      process.exit(1);
    }

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
      } catch (parseErr) {
        console.error(`Malformed tool args for ${name}: ${parseErr.message}`);
        continue;
      }

      const taskCompleteAvailable = currentToolDefs.some(t => t.function && t.function.name === "task_complete");

      const entry = toolIndex.get(name);
      let observation;

      if (!entry || (name === 'task_complete' && !taskCompleteAvailable)) {
        observation = `Error: unknown tool "${name}"`;
      } else if (entry.isMcp) {
        observation = await callMcpTool(clients, entry.serverName, entry.toolName, args);
      } else {
        observation = await entry.execute(args);
      }

      if (name === 'task_complete' && taskCompleteAvailable) {
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

  if (turn > 0) {
    process.stderr.write('Warning: agent reached max turns without calling task_complete\n');
  }

  return { done: false };
}

module.exports = { runAgent };
