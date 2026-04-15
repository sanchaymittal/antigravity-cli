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
        },
        required: ['command'],
      },
    },
  },
  execute: async ({ command }) => {
    try {
      const stdout = execSync(command, { encoding: 'utf8', timeout: 30000, shell: true });
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
