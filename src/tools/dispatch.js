'use strict';
const { BUILTIN_TOOLS } = require('./builtin.js');
const { callMcpTool } = require('../mcp/client.js');

/**
 * Build unified tool list from builtin + MCP tools.
 * Returns array of { name, definition, isMcp, execute?, serverName?, toolName? }
 */
function buildAllTools(mcpData) {
  const builtin = BUILTIN_TOOLS.map(t => ({
    name: t.definition.function.name,
    definition: t.definition,
    execute: t.execute,
    isMcp: false,
  }));

  const mcp = (mcpData.tools || []).map(t => ({
    name: t.toolName || t.definition.function.name,
    definition: t.definition,
    serverName: t.serverName,
    toolName: t.toolName,
    isMcp: true,
  }));

  return [...builtin, ...mcp];
}

/**
 * Execute a tool call. Always returns a string (never throws).
 */
async function executeTool(allTools, clients, toolCall) {
  const name = toolCall.name || toolCall.function?.name;
  let args;
  try {
    args = typeof toolCall.arguments === 'string' 
      ? JSON.parse(toolCall.arguments)
      : (toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : toolCall.arguments || {});
  } catch {
    args = {};
  }

  const tool = allTools.find(t => t.name === name);
  if (!tool) return `Error: unknown tool ${name}`;

  try {
    if (tool.isMcp) {
      return await callMcpTool(clients, tool.serverName, tool.toolName, args);
    }
    return await tool.execute(args);
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

module.exports = { buildAllTools, executeTool };
