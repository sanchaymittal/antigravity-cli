'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Stub child_process.execSync BEFORE builtin.js is loaded so its top-level
// `const { execSync } = require('child_process')` resolves to our spy.
let lastTimeout;
const cpPath = require.resolve('child_process');
require.cache[cpPath] = {
  id: cpPath,
  filename: cpPath,
  loaded: true,
  exports: {
    execSync: (_cmd, opts) => {
      lastTimeout = opts.timeout;
      return '';
    },
  },
};

// Ensure a fresh load of builtin.js picks up the stub.
delete require.cache[require.resolve('../src/tools/builtin')];
const { BUILTIN_TOOLS } = require('../src/tools/builtin');
const runBash = BUILTIN_TOOLS.find((t) => t.definition.function.name === 'run_bash');

async function exec(timeout_ms) {
  lastTimeout = undefined;
  await runBash.execute({ command: 'noop', timeout_ms });
  return lastTimeout;
}

test('run_bash: no timeout_ms → default 120000', async () => {
  await runBash.execute({ command: 'noop' });
  assert.equal(lastTimeout, 120000);
});

test('run_bash: valid timeout_ms honored', async () => {
  assert.equal(await exec(5000), 5000);
});

test('run_bash: timeout_ms above cap clamped to 600000', async () => {
  assert.equal(await exec(999999), 600000);
});

test('run_bash: NaN falls back to 120000', async () => {
  assert.equal(await exec(NaN), 120000);
});

test('run_bash: negative falls back to 120000', async () => {
  assert.equal(await exec(-100), 120000);
});

test('run_bash: zero falls back to 120000', async () => {
  assert.equal(await exec(0), 120000);
});

test('run_bash: non-numeric string falls back to 120000', async () => {
  assert.equal(await exec('invalid'), 120000);
});
