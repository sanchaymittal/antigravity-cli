const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const builtinTools = {
  read_file: {
    name: 'read_file',
    description: 'Read the contents of a file. Returns file contents as a string.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file (relative to CWD or absolute)'
        }
      },
      required: ['path']
    },
    execute: async ({ path: filePath }) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content;
      } catch (error) {
        return `Error reading file: ${error.message}`;
      }
    }
  },

  write_file: {
    name: 'write_file',
    description: 'Write content to a file. Creates parent directories if needed.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file'
        },
        content: {
          type: 'string',
          description: 'Content to write'
        }
      },
      required: ['path', 'content']
    },
    execute: async ({ path: filePath, content }) => {
      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf8');
        return `File written to ${filePath}`;
      } catch (error) {
        return `Error writing file: ${error.message}`;
      }
    }
  },

  run_bash: {
    name: 'run_bash',
    description: 'Run a shell command. Returns stdout, stderr, and exit_code as JSON.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to run'
        },
        timeout_ms: {
          type: 'number',
          description: 'Timeout in milliseconds',
          minimum: 1,
          maximum: 600000
        }
      },
      required: ['command']
    },
    execute: async ({ command, timeout_ms }) => {
      const t = Number(timeout_ms);
      const timeout = Number.isFinite(t) && t > 0 ? Math.min(t, 600000) : 120000;
      return new Promise((resolve) => {
        exec(command, { timeout }, (error, stdout, stderr) => {
          resolve({
            stdout,
            stderr,
            exit_code: error ? error.code : 0
          });
        });
      });
    }
  }
};

module.exports = builtinTools;
