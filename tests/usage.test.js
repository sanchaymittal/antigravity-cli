'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('diffUsage returns null when no delta', () => {
  const { diffUsage } = require('../src/sidecar/usage');
  const before = { timestamp: 1000, inputTokens: 10, outputTokens: 5, model: 'x' };
  const after  = { timestamp: 2000, inputTokens: 10, outputTokens: 5, model: 'x' };
  assert.strictEqual(diffUsage(before, after), null);
});

test('diffUsage returns delta when usage differs', () => {
  const { diffUsage } = require('../src/sidecar/usage');
  const before = { timestamp: 1000, inputTokens: 100, outputTokens: 50, model: 'gemini' };
  const after  = { timestamp: 2000, inputTokens: 200, outputTokens: 80, model: 'gemini' };
  const delta = diffUsage(before, after);
  assert.strictEqual(delta.inputTokens, 100);
  assert.strictEqual(delta.outputTokens, 30);
  assert.strictEqual(delta.model, 'gemini');
});

test('snapshotUsage returns numeric fields', () => {
  const { snapshotUsage } = require('../src/sidecar/usage');
  const snap = snapshotUsage();
  assert.ok(typeof snap.timestamp === 'number');
  assert.ok(typeof snap.inputTokens === 'number');
  assert.ok(typeof snap.outputTokens === 'number');
});

test('recordUsage accumulates into snapshotUsage', () => {
  const { recordUsage, snapshotUsage } = require('../src/sidecar/usage');
  const before = snapshotUsage();
  recordUsage({ inputTokens: 42, outputTokens: 17, model: 'test-model' });
  const after = snapshotUsage();
  assert.strictEqual(after.inputTokens - before.inputTokens, 42);
  assert.strictEqual(after.outputTokens - before.outputTokens, 17);
  assert.strictEqual(after.model, 'test-model');
});

test('recordUsage handles zero-value tokens (does not drop them)', () => {
  const { recordUsage, snapshotUsage } = require('../src/sidecar/usage');
  const before = snapshotUsage();
  recordUsage({ inputTokens: 0, outputTokens: 5, model: null });
  const after = snapshotUsage();
  assert.strictEqual(after.inputTokens - before.inputTokens, 0);
  assert.strictEqual(after.outputTokens - before.outputTokens, 5);
});