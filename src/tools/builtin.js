'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const readFile = {
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Returns file contents as a string.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file (relative to CWD or absolute)' },
        },
        required: ['path'],
      },
    },
  },
  execute: async ({ path: filePath }) => {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > 1024 * 1024) {
        return 'File too large (>1MB). Use run_bash with head/grep to read portions.';
      }
      return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      return `Error reading file: ${err.message}`;
    }
  },
};

const writeFile = {
  definition: {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  execute: async ({ path: filePath, content }) => {
    try {
      fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf8');
      return 'ok';
    } catch (err) {
      return `Error writing file: ${err.message}`;
    }
  },
};

const runBash = {
  definition: {
    type: 'function',
    function: {
      name: 'run_bash',
      description: 'Run a shell command. Returns stdout, stderr, and exit_code as JSON.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run' },
          timeout_ms: {
            type: 'number',
            description: 'Timeout in ms. Default 120000 (2min). Max 600000 (10min).',
            minimum: 1,
            maximum: 600000,
          },
        },
        required: ['command'],
      },
    },
  },
  execute: async ({ command, timeout_ms }) => {
    try {
      const t = Number(timeout_ms);
      const timeout = Number.isFinite(t) && t > 0 ? Math.min(t, 600000) : 120000;
      const stdout = execSync(command, { encoding: 'utf8', timeout, shell: true });
      return JSON.stringify({ stdout, stderr: '', exit_code: 0 });
    } catch (err) {
      return JSON.stringify({
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exit_code: err.status || 1,
      });
    }
  },
};

const BUILTIN_TOOLS = [readFile, writeFile, runBash];

module.exports = { BUILTIN_TOOLS };
