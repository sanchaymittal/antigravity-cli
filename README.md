# antigravity-cli

A local agentic CLI powered by Antigravity sidecar

## Installation

```bash
npm install -g antigravity-cli
ag --version
```

## Requirements

- Node.js >= 18
- Antigravity.app running

## Commands

### `ag models`

List all available Antigravity models.

### `ag status`

Check if the Antigravity sidecar is reachable.

### `ag chat [message]`

Send a one-shot message to Antigravity. Reads from stdin if no message is provided.

**Flags:**
- `-m, --model <model>`: Model to use
- `-s, --system <prompt>`: System prompt

**Examples:**
```bash
ag chat "Hello world"
echo "Explain this code" | ag chat
ag chat -m antigravity-gemini-3.1-pro-high "Deep thought"
```

### `ag run <intent>`

Run an agentic task. This enters an agentic loop where the CLI can read/write files, run commands, and use MCP tools. The loop continues until the agent calls `task_complete`.

**Flags:**
- `-m, --model <model>`: Model to use

**Example:**
```bash
ag run "Fix the bugs in src/cli.js and add tests"
```

## Models

| Model | Use Tier |
| :--- | :--- |
| `antigravity-gemini-3-flash` | coding/fast |
| `antigravity-gemini-3.1-pro-low` | review |
| `antigravity-gemini-3.1-pro-high` | thinking/gemini |
| `antigravity-claude-sonnet-4-6` | thinking/default |
| `antigravity-claude-opus-4-6-thinking` | thinking/most capable |
| `antigravity-gpt-oss-120b` | general |

## MCP (Model Context Protocol)

`ag` reads MCP server configurations from `.ag/mcp.json` in the current working directory. It uses the HTTP transport format.
