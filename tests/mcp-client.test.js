'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('initMcpServers resolves config from provided cwd', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-test-'));
  const agDir = path.join(tmpDir, '.ag');
  fs.mkdirSync(agDir);
  fs.writeFileSync(path.join(agDir, 'mcp.json'), JSON.stringify({ mcpServers: {} }));
  const { initMcpServers } = require('../src/mcp/client');
  try {
    const result = await initMcpServers({ cwd: tmpDir });
    assert.ok(result.tools !== undefined);
    assert.ok(result.clients !== undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('initMcpServers returns empty when no config found', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-test-empty-'));
  const { initMcpServers } = require('../src/mcp/client');
  try {
    const result = await initMcpServers({ cwd: tmpDir });
    assert.deepEqual([...result.clients.keys()], []);
    assert.deepEqual(result.tools, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('initMcpServers falls back to HOME/.ag/mcp.json when no local config', async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-home-'));
  const homeAgDir = path.join(tmpHome, '.ag');
  fs.mkdirSync(homeAgDir);
  fs.writeFileSync(path.join(homeAgDir, 'mcp.json'), JSON.stringify({ mcpServers: {} }));
  const origHomedir = os.homedir;
  os.homedir = () => tmpHome;
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-empty-'));
  const { initMcpServers } = require('../src/mcp/client');
  try {
    const result = await initMcpServers({ cwd: emptyDir });
    assert.ok(result.tools !== undefined);
  } finally {
    os.homedir = origHomedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});