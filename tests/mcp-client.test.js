'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('initMcpServers resolves config from provided cwd', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-test-'));
  const agDir = path.join(tmpDir, '.ag');
  fs.mkdirSync(agDir);
  fs.writeFileSync(path.join(agDir, 'mcp.json'), JSON.stringify({ mcpServers: {} }));
  const { initMcpServers } = require('../src/mcp/client');
  return initMcpServers({ cwd: tmpDir }).then((result) => {
    assert.ok(result.tools !== undefined);
    assert.ok(result.clients !== undefined);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

test('initMcpServers returns empty when no config found', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-test-empty-'));
  const { initMcpServers } = require('../src/mcp/client');
  return initMcpServers({ cwd: tmpDir }).then((result) => {
    assert.deepEqual([...result.clients.keys()], []);
    assert.deepEqual(result.tools, []);
    fs.rmSync(tmpDir, { recursive: true });
  });
});