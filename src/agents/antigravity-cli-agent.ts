import { execSync, spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import type { ChildProcess } from 'child_process'
import type { CodingAgent } from './index'
import { AGENT_STDIO_CONFIG } from './constants'

const AGENT_BOOTSTRAP_RULES = [
  '# Agent Rules',
  '',
  '1. Use tools to complete the task — read files, write files, run commands as needed.',
  '2. When your work is complete, call task_complete with a summary of what you did.',
  '3. Do not ask for clarification — proceed with reasonable assumptions.',
  '4. Do not hallucinate tool results — wait for real observations before continuing.',
].join('\n')

export class AntigravityCliAgent implements CodingAgent {
  name = 'antigravity'

  constructor(private model: string = 'antigravity-claude-sonnet-4-6') {}

  async available(): Promise<boolean> {
    try {
      execSync(`node ${path.join(process.cwd(), 'src', 'cli.js')} run --help 2>&1`, { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  isOneShot(): boolean {
    return true
  }

  async bootstrap(sandboxRoot: string): Promise<void> {
    fs.writeFileSync(path.join(sandboxRoot, 'AGENTS.md'), AGENT_BOOTSTRAP_RULES)
  }

  async start(sessionId: string, mcpUrl: string, intent: string, workdir?: string): Promise<ChildProcess> {
    if (workdir) {
      const agDir = path.join(workdir, '.ag')
      fs.mkdirSync(agDir, { recursive: true })
      fs.writeFileSync(
        path.join(agDir, 'mcp.json'),
        JSON.stringify(
          {
            mcpServers: {
              chanakya: {
                command: 'npx',
                args: ['-y', 'mcp-remote', `${mcpUrl}/mcp`, '--allow-http', '--transport', 'http-only'],
              },
            },
          },
          null,
          2,
        ),
      )
    }

    return spawn('ag', ['run', '-m', this.model, intent], {
      cwd: workdir,
      stdio: AGENT_STDIO_CONFIG,
      env: { ...process.env },
    })
  }
}
