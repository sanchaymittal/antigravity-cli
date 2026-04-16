'use strict';

const React = require('react');
const { render } = require('ink');
const App = require('./App.cjs');
const { replTurn } = require('../repl');

const boundReplTurn = (ctx, msgs, modelEnum, mcpData) =>
  replTurn(ctx, msgs, modelEnum, mcpData, undefined, { silent: true });

function runTui(ctx, modelEnum, mcpData, modelKey) {
  const SYSTEM_PROMPT = (cwd) =>
    `You are a helpful coding assistant working in ${cwd}.\n` +
    `You have tools to read files, write files, and run bash commands.\n` +
    `Use them when helpful. Be concise.`;

  const initialMessages = [{ role: 'system', content: SYSTEM_PROMPT(process.cwd()) }];

  render(
    React.createElement(App, {
      ctx,
      initialMessages,
      modelEnum,
      mcpData,
      initialModelKey: modelKey,
      replTurn: boundReplTurn
    })
  );
}

module.exports = { runTui };
