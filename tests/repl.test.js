'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { replTurn } = require('../src/repl.js');

test('replTurn appends assistant message when no tool calls', async () => {
  const messages = [{ role: 'user', content: 'hello' }];
  const mockCtx = {};
  const mockMcpData = { tools: [], clients: new Map() };
  const fakeInfer = async () => ({ content: 'hi there', toolCalls: [] });

  await replTurn(mockCtx, messages, 1018, mockMcpData, fakeInfer);

  assert.equal(messages.length, 2);
  assert.equal(messages[1].role, 'assistant');
  assert.equal(messages[1].content, 'hi there');
});

test('replTurn executes tool call then gets final response', async () => {
  const messages = [{ role: 'user', content: 'read a file' }];
  const mockCtx = {};
  const mockMcpData = { tools: [], clients: new Map() };

  let call = 0;
  const fakeInfer = async () => {
    call++;
    if (call === 1) {
      return {
        content: '',
        toolCalls: [{ name: 'read_file', arguments: '{"path":"test.txt"}' }],
      };
    }
    return { content: 'file says: hello', toolCalls: [] };
  };

  await replTurn(mockCtx, messages, 1018, mockMcpData, fakeInfer);

  // messages: user, assistant(tool_calls), tool result, assistant(final)
  assert.equal(call, 2);
  assert.equal(messages[messages.length - 1].role, 'assistant');
  assert.equal(messages[messages.length - 1].content, 'file says: hello');
});

test('replTurn stops after MAX_TOOL_CALLS_PER_TURN if model keeps calling tools', async () => {
  const messages = [{ role: 'user', content: 'loop' }];
  const mockCtx = {};
  const mockMcpData = { tools: [], clients: new Map() };

  // Always returns a tool call — should stop after 15 iterations
  const fakeInfer = async () => ({
    content: '',
    toolCalls: [{ name: 'run_bash', arguments: '{"command":"echo hi"}' }],
  });

  // Should not throw — just stop after max
  await replTurn(mockCtx, messages, 1018, mockMcpData, fakeInfer);
  // 15 tool calls → 15 assistant + 15 tool messages + original user = 31 total
  assert.ok(messages.length <= 32, `too many messages: ${messages.length}`);
});
