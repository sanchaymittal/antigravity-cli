'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

function readMcpConfig() {
  const configPath = path.join(process.cwd(), '.ag', 'mcp.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { mcpServers: {} };
  }
}

function spawnMcpServer(serverName, config) {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.command, config.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let buffer = '';
    let requestId = 0;
    const pending = new Map();

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && pending.has(msg.id)) {
            const { resolve: res, reject: rej } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
            else res(msg.result);
          }
        } catch { /* ignore parse errors */ }
      }
    });

    proc.stderr.on('data', (chunk) => {
      if (process.env.AG_DEBUG) process.stderr.write(`[mcp:${serverName}] ${chunk}`);
    });

    proc.on('error', reject);

    const send = (method, params) => {
      const id = ++requestId;
      return new Promise((res, rej) => {
        pending.set(id, { resolve: res, reject: rej });
        const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
        proc.stdin.write(msg);
      });
    };

    send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ag', version: '0.1.0' },
    })
      .then(() => {
        proc.stdin.write(
          JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n',
        );
        resolve({ proc, send });
      })
      .catch(reject);

    proc.once('exit', (code) => {
      reject(new Error(`MCP server "${serverName}" exited with code ${code} before initialization`));
    });
  });
}

function httpPost(url, body, sessionId) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    const req = http.request(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: 'POST', headers },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function connectHttpMcpServer(serverName, url) {
  // initialize
  const id1 = 1;
  const initRes = await httpPost(url, {
    jsonrpc: '2.0', id: id1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ag', version: '0.1.0' },
    },
  }, null);

  if (initRes.status !== 200) throw new Error(`initialize HTTP ${initRes.status}: ${initRes.body.slice(0, 200)}`);
  const sessionId = initRes.headers['mcp-session-id'];
  if (!sessionId) throw new Error('No mcp-session-id in initialize response');

  // notifications/initialized (notification — no id)
  await httpPost(url, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, sessionId);

  const send = async (method, params) => {
    const id = Date.now();
    const res = await httpPost(url, { jsonrpc: '2.0', id, method, params }, sessionId);
    if (!res.body) return {};
    try { return JSON.parse(res.body).result ?? {}; } catch { return {}; }
  };

  return { send, sessionId, url, isHttp: true };
}

async function initMcpServers() {
  const config = readMcpConfig();
  const servers = config.mcpServers || {};
  const clients = new Map();
  const tools = [];

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    try {
      const client = serverConfig.transport === 'http'
        ? await connectHttpMcpServer(serverName, serverConfig.url)
        : await spawnMcpServer(serverName, serverConfig);

      if (!client.isHttp) {
        client.proc.removeAllListeners('exit');
        client.proc.on('exit', (code) => {
          if (process.env.AG_DEBUG) process.stderr.write(`[mcp:${serverName}] exited with code ${code}\n`);
          clients.delete(serverName);
        });
      }

      const result = await client.send('tools/list', {});
      const serverTools = result.tools || [];
      clients.set(serverName, client);

      for (const tool of serverTools) {
        tools.push({
          definition: {
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description || '',
              parameters: tool.inputSchema || { type: 'object', properties: {} },
            },
          },
          serverName,
          toolName: tool.name,
        });
      }
    } catch (err) {
      process.stderr.write(`Warning: MCP server "${serverName}" failed: ${err.message}\n`);
    }
  }

  return { tools, clients };
}

async function callMcpTool(clients, serverName, toolName, args) {
  const client = clients.get(serverName);
  if (!client) return `Error: MCP server "${serverName}" not available`;
  try {
    const result = await client.send('tools/call', { name: toolName, arguments: args });
    const content = result.content || [];
    return content.map((c) => (c.type === 'text' ? c.text : JSON.stringify(c))).join('\n');
  } catch (err) {
    return `Error calling tool "${toolName}": ${err.message}`;
  }
}

async function shutdownMcpServers(clients) {
  for (const [, client] of clients) {
    if (client.isHttp) continue;
    try {
      client.proc.stdin.end();
      client.proc.kill('SIGTERM');
    } catch { /* already dead */ }
  }
}

module.exports = { initMcpServers, callMcpTool, shutdownMcpServers };