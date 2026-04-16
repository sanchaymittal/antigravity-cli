#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const { callRawInference } = require('./sidecar/raw');
const { discoverSidecar } = require('./sidecar/discovery');
const { MODEL_MAP, DEFAULT_MODEL_KEY, resolveModel } = require('./models');
const { version } = require('../package.json');
const { VALUE_TO_MODEL_ENUM } = require('./model-enum');
const { runAgent } = require('./agent');
const { initMcpServers, shutdownMcpServers } = require('./mcp/client');
const { snapshotUsage, diffUsage, persistRunUsage, loadHistory } = require('./sidecar/usage');

function makeCtx() {
  return { sidecarInfo: null, sidecarInfoTimestamp: 0, SIDECAR_CACHE_TTL: 30000 };
}

function fatalNoSidecar() {
  console.error('Error: Antigravity sidecar not found. Make sure Antigravity is running.');
  console.error('       Set AG_DEBUG=1 for discovery details.');
  process.exit(1);
}

// ─────────────────────────────────────────────

const program = new Command();
program
  .name('ag')
  .description('CLI for Antigravity — chat with Claude, Gemini, and GPT-OSS via your subscription')
  .version(version);

// ── ag models ────────────────────────────────

program
  .command('models')
  .description('List available Antigravity models')
  .action(() => {
    const visible = Object.entries(MODEL_MAP).filter(([, v]) => !v.hidden);
    console.log('Available models:\n');
    for (const [id, info] of visible) {
      const tag = id === DEFAULT_MODEL_KEY ? '  (default)' : '';
      console.log(`  ${id}${tag}`);
      console.log(`    ${info.name}  ·  ${info.owned_by}  ·  ctx ${(info.context / 1000).toFixed(0)}k\n`);
    }
  });

// ── ag status ────────────────────────────────

program
  .command('status')
  .description('Check if Antigravity sidecar is reachable')
  .action(async () => {
    const ctx = makeCtx();
    process.stdout.write('Discovering sidecar...');
    const info = await discoverSidecar(ctx);
    if (!info) {
      console.log(' not found.');
      fatalNoSidecar();
    }
    console.log(` OK`);
    console.log(`  PID:    ${info.pid}`);
    console.log(`  Ports:  ${info.actualPorts.join(', ')}`);
    console.log(`  Tokens: ${info.csrfTokens.length}`);
    console.log(`  Cert:   ${info.certPath || 'not found (will connect without)'}`);
  });

// ── ag chat ──────────────────────────────────

program
  .command('chat [message]')
  .description('Send a one-shot message to Antigravity (reads stdin if no message given)')
  .option('-m, --model <model>', 'Model to use', DEFAULT_MODEL_KEY)
  .option('-s, --system <prompt>', 'System prompt')
  .action(async (message, opts) => {
    const ctx = makeCtx();

    // Resolve model — error on unknown, don't silently fall back
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

    // Read from stdin if no message arg provided
    if (!message) {
      if (process.stdin.isTTY) {
        console.error('Usage: ag chat <message>  or  echo "..." | ag chat');
        process.exit(1);
      }
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      message = Buffer.concat(chunks).toString('utf8').trim();
      if (!message) {
        console.error('No message provided (stdin was empty).');
        process.exit(1);
      }
    }

    const messages = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: message });

    try {
      const result = await callRawInference(ctx, messages, modelEnum, null);
      if (!result || !result.content) {
        console.error('No response from sidecar.');
        process.exit(1);
      }
      process.stdout.write(result.content);
      if (!result.content.endsWith('\n')) process.stdout.write('\n');
    } catch (err) {
      if (err.message.includes('not discovered') || err.message.includes('not found') || err.message.includes('No reachable')) {
        fatalNoSidecar();
      }
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ── ag run ──────────────────────────────────

program
  .command('run <intent>')
  .description('Run an agentic task (reads/writes files, runs commands, uses MCP tools)')
  .option('-m, --model <model>', 'Model to use', DEFAULT_MODEL_KEY)
  .action(async (intent, opts) => {
    const ctx = makeCtx();

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

    const usageBefore = snapshotUsage();

    const info = await discoverSidecar(ctx);
    if (!info) fatalNoSidecar();

    const mcpData = await initMcpServers({ cwd: process.cwd() });

    const cleanup = async () => {
      await shutdownMcpServers(mcpData.clients);
    };

    try {
      const result = await runAgent(ctx, intent, modelEnum, mcpData, { cwd: process.cwd() });
      const usageAfter = snapshotUsage();
      const tokenDelta = diffUsage(usageBefore, usageAfter);
      if (tokenDelta) {
        persistRunUsage(tokenDelta);
        const total = tokenDelta.inputTokens + tokenDelta.outputTokens;
        process.stderr.write(
          `\n--- Token Usage ---\n` +
          (tokenDelta.model ? `  Model:  ${tokenDelta.model}\n` : '') +
          `  Input:  ${tokenDelta.inputTokens.toLocaleString()} tokens\n` +
          `  Output: ${tokenDelta.outputTokens.toLocaleString()} tokens\n` +
          `  Total:  ${total.toLocaleString()} tokens\n` +
          `-------------------\n`
        );
      }
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

// ── ag quota ─────────────────────────────────

program
  .command('quota')
  .description('Show token usage history across ag run sessions')
  .action(() => {
    const history = loadHistory();
    if (history.length === 0) {
      console.log('No token usage recorded yet. Run `ag run` first.');
      console.log('For quota limits: Antigravity app Settings > Model.');
      return;
    }
    const totals = history.reduce((acc, e) => {
      acc.input += e.inputTokens || 0;
      acc.output += e.outputTokens || 0;
      return acc;
    }, { input: 0, output: 0 });
    const lastModel = history[history.length - 1].model;
    console.log('');
    console.log(`--- Token Usage (last ${history.length} runs) ---`);
    if (lastModel) console.log(`  Last model: ${lastModel}`);
    console.log(`  Input:  ${totals.input.toLocaleString()} tokens`);
    console.log(`  Output: ${totals.output.toLocaleString()} tokens`);
    console.log(`  Total:  ${(totals.input + totals.output).toLocaleString()} tokens`);
    console.log('------------------------------------------');
    console.log('For quota limits: Antigravity app Settings > Model.');
  });

program.parse();
