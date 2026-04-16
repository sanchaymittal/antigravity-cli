'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('runAgent throws on inference error', async () => {
  const { runAgent } = require('../src/agent');
  const raw = require('../src/sidecar/raw');
  const orig = raw.callRawInference;
  raw.callRawInference = async () => { throw new Error('sidecar down'); };
  let threw = false;
  try {
    await runAgent({}, 'test', 'MODEL', { tools: [], clients: new Map() }, {});
  } catch (err) {
    threw = true;
    assert.match(err.message, /Inference error/);
  } finally {
    raw.callRawInference = orig;
  }
  assert.ok(threw, 'must throw');
});

test('runAgent uses opts.logger', async () => {
  const { runAgent } = require('../src/agent');
  const raw = require('../src/sidecar/raw');
  const orig = raw.callRawInference;
  raw.callRawInference = async () => ({ content: 'hello', toolCalls: [] });
  const logged = [];
  const logger = { log: () => {}, error: () => {}, write: (s) => logged.push(s) };
  try {
    await runAgent({}, 'test', 'MODEL', { tools: [], clients: new Map() }, { logger });
  } finally {
    raw.callRawInference = orig;
  }
  assert.ok(logged.includes('hello'));
});
