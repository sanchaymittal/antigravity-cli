'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const USAGE_FILE = path.join(os.homedir(), '.ag-usage.json');

let _session = { inputTokens: 0, outputTokens: 0, model: null };

function _loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function _appendToHistory(entry) {
  try {
    const history = _loadHistory();
    history.push(entry);
    // Keep last 100 entries
    const trimmed = history.slice(-100);
    fs.writeFileSync(USAGE_FILE, JSON.stringify(trimmed, null, 2));
  } catch { /* non-fatal */ }
}

function recordUsage(usage) {
  if (!usage) return;
  if (usage.inputTokens != null) _session.inputTokens += usage.inputTokens;
  if (usage.outputTokens != null) _session.outputTokens += usage.outputTokens;
  if (usage.model) _session.model = usage.model;
}

function snapshotUsage() {
  return {
    timestamp: Date.now(),
    inputTokens: _session.inputTokens,
    outputTokens: _session.outputTokens,
    model: _session.model,
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

function persistRunUsage(delta) {
  if (!delta) return;
  _appendToHistory({
    timestamp: Date.now(),
    model: delta.model,
    inputTokens: delta.inputTokens,
    outputTokens: delta.outputTokens,
  });
}

function loadHistory() {
  return _loadHistory();
}

module.exports = { recordUsage, snapshotUsage, diffUsage, persistRunUsage, loadHistory };
