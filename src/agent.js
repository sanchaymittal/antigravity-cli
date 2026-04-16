'use strict';

const _raw = require('./sidecar/raw');
const { buildAllTools, executeTool } = require('./tools/dispatch.js');
const { createSpinner, printToolCall, printError, printSuccess } = require("./ui");

const MAX_TURNS = 50;

function makeSystemPrompt(cwd) {
  return [
    `You are a coding agent working in ${cwd}.`,
    'Use tools to complete the task. When done, call task_complete with a summary.',
    'Do not ask for clarification — proceed with reasonable assumptions.',
    'Do not hallucinate tool results — wait for real observations before continuing.',
  ].join('\n');
}

async function runAgent(ctx, intent, modelEnum, mcpData, opts = {}) {
  const logger = opts.logger ?? {
    log: (...a) => console.log(...a),
    error: (...a) => console.error(...a),
    write: (s) => process.stdout.write(s),
  };
  const cwd = opts.cwd ?? process.cwd();

  const { clients } = mcpData;
  const allTools = buildAllTools(mcpData);
  const allToolDefs = allTools.map(t => t.definition);

  const messages = [
    { role: 'system', content: makeSystemPrompt(cwd) },
    { role: 'user', content: intent },
  ];

  const spinner = createSpinner("Running...");
  spinner.start();

  let turn;
  for (turn = 0; turn < MAX_TURNS; turn++) {
    const currentToolDefs = turn === 0
      ? allToolDefs.filter((t) => t.function.name !== 'task_complete')
      : allToolDefs;

    let result;
    try {
      result = await _raw.callRawInference(ctx, messages, modelEnum, currentToolDefs);
    } catch (err) {
      spinner.fail("Error");
      throw new Error(`Inference error: ${err.message}`);
    }

    if (result.content) {
      spinner.stop();
      logger.write(result.content);
      if (!result.content.endsWith('\n')) logger.write('\n');
      spinner.start();
    }

    if (!result.toolCalls || result.toolCalls.length === 0) {
      spinner.succeed("Done");
      break;
    }

    messages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls,
    });

    for (const toolCall of result.toolCalls) {
      const name = toolCall.function?.name || toolCall.name;
      const args = toolCall.function?.arguments || toolCall.arguments || toolCall.args_parsed;
      const taskCompleteAvailable = currentToolDefs.some(t => t.function && t.function.name === "task_complete");

      spinner.stop();
      printToolCall(name, typeof args === 'string' ? JSON.parse(args) : args);
      spinner.start();
      spinner.text = "Running...";

      let observation;
      if (name === 'task_complete' && !taskCompleteAvailable) {
        observation = `Error: unknown tool "${name}"`;
      } else {
        observation = await executeTool(allTools, clients, toolCall);
      }

      if (name === 'task_complete' && taskCompleteAvailable) {
        spinner.succeed("Done");
        logger.write(`\nDone: ${observation}\n`);
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

  if (turn >= MAX_TURNS) {
    spinner.fail("Max turns reached");
    logger.error('Warning: agent reached max turns without calling task_complete');
  }

  return { done: false };
}

module.exports = { runAgent };
