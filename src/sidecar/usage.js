'use strict';

let _accumulated = { inputTokens: 0, outputTokens: 0, model: null };

function recordUsage(usage) {
  if (!usage) return;
  if (usage.inputTokens) _accumulated.inputTokens += usage.inputTokens;
  if (usage.outputTokens) _accumulated.outputTokens += usage.outputTokens;
  if (usage.model) _accumulated.model = usage.model;
}

function snapshotUsage() {
  return {
    timestamp: Date.now(),
    inputTokens: _accumulated.inputTokens,
    outputTokens: _accumulated.outputTokens,
    model: _accumulated.model,
  };
}

function diffUsage(before, after) {
  const inputDelta = after.inputTokens - before.inputTokens;
  const outputDelta = after.outputTokens - before.outputTokens;
  if (inputDelta === 0 && outputDelta === 0) return null;
  return {
    model: after.model || before.model,
    inputTokens: inputDelta,
    outputTokens: outputDelta,
  };
}

module.exports = { recordUsage, snapshotUsage, diffUsage };