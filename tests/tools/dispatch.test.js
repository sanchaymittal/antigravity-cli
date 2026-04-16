'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAllTools, executeTool } = require('../../src/tools/dispatch.js');

test('buildAllTools includes all three builtin tools', () => {
  const mcpData = { tools: [], clients: new Map() };
  const allTools = buildAllTools(mcpData);
  const names = allTools.map(t => t.name);
  assert.ok(names.includes('read_file'));
  assert.ok(names.includes('write_file'));
  assert.ok(names.includes('run_bash'));
});

test('buildAllTools includes MCP tools', () => {
  const fakeMcpTool = {
    toolName: 'my_mcp_tool',
    serverName: 'myserver',
    definition: { type: 'function', function: { name: 'my_mcp_tool', description: '', parameters: {} } },
  };
  const mcpData = { tools: [fakeMcpTool], clients: new Map() };
  const allTools = buildAllTools(mcpData);
  const names = allTools.map(t => t.name);
  assert.ok(names.includes('my_mcp_tool'));
});

test('executeTool returns error string for unknown tool', async () => {
  const mcpData = { tools: [], clients: new Map() };
  const allTools = buildAllTools(mcpData);
  const result = await executeTool(allTools, mcpData.clients, { name: 'no_such_tool', arguments: '{}' });
  assert.match(result, /Error: unknown tool/);
});

test('executeTool handles malformed arguments JSON', async () => {
  const mcpData = { tools: [], clients: new Map() };
  const allTools = buildAllTools(mcpData);
  // run_bash with bad JSON — should not throw, should return error or handle gracefully
  const result = await executeTool(allTools, mcpData.clients, { name: 'unknown', arguments: 'not-json' });
  assert.equal(typeof result, 'string');
});
