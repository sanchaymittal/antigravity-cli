import type { ChildProcess } from 'child_process'

export interface CodingAgent {
  name: string;
  available(): Promise<boolean>;
  isOneShot(): boolean;
  bootstrap(sandboxRoot: string): Promise<void>;
  start(sessionId: string, mcpUrl: string, intent: string, workdir?: string): Promise<ChildProcess>;
}
