# antigravity-cli

CLI for [Antigravity](https://codeium.com/antigravity) — chat with Claude, Gemini, and GPT-OSS through your Antigravity subscription. No API keys needed.

```
ag chat "explain this regex: ^(?:https?)://"
```

## How it works

```
ag → sidecar discovery → H2 ConnectRPC → Antigravity sidecar → Cloud AI
```

Talks directly to Antigravity's language server process. No bridge extension required — just Antigravity running.

## Install

```bash
npm install -g antigravity-cli
```

Or run without installing:

```bash
npx antigravity-cli chat "hello"
```

## Usage

```bash
# List available models
ag models

# Check Antigravity sidecar is reachable
ag status

# One-shot chat (default: claude-sonnet-4-6)
ag chat "write a Python hello world"

# Use a different model
ag chat -m antigravity-gemini-3.1-pro-high "explain async/await"
ag chat -m antigravity-claude-opus-4-6-thinking "review this architecture"

# Add a system prompt
ag chat -s "You are a code reviewer" "review this PR description"
```

## Available Models

| Model ID | Description |
|----------|-------------|
| `antigravity-claude-sonnet-4-6` | Claude Sonnet 4.6 with Thinking **(default)** |
| `antigravity-claude-opus-4-6-thinking` | Claude Opus 4.6 with Thinking |
| `antigravity-gemini-3.1-pro-high` | Gemini 3.1 Pro — High thinking |
| `antigravity-gemini-3.1-pro-low` | Gemini 3.1 Pro — Low thinking |
| `antigravity-gemini-3-flash` | Gemini 3 Flash |
| `antigravity-gpt-oss-120b` | GPT-OSS 120B Medium |

## Requirements

- [Antigravity](https://codeium.com/antigravity) installed and running
- Node.js 18+

## Debug

```bash
AG_DEBUG=1 ag chat "hello"    # show discovery + inference logs
AG_DEBUG=2 ag chat "hello"    # verbose payload dumps
```

## Credits

Sidecar communication code vendored from [marcodiniz/ag-local-bridge](https://github.com/marcodiniz/ag-local-bridge).
