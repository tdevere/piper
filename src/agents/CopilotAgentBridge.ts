import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as dotenv from 'dotenv';
import { AgentSession, AgentEvent, AgentMessage, SafetyCheckResult } from './types';

dotenv.config();

/**
 * Configuration for Copilot CLI agent process
 */
export interface CopilotAgentConfig {
  maxIterations: number;
  maxDuration: number; // milliseconds
  deniedTools: string[];
  allowAllPaths?: boolean;
  model?: string;
  timeout?: number; // per-request timeout in ms
}

/**
 * Wraps GitHub Copilot CLI as a persistent agent process
 * Inspired by tdevere/copilot-cli auto-approval wrapper
 */
export class CopilotAgentBridge extends EventEmitter {
  private process: ChildProcess | null = null;
  private sessionActive: boolean = false;
  private iterations: number = 0;
  private startTime: number = 0;
  private buffer: string = '';
  private currentPromptResolve: ((value: string) => void) | null = null;
  private config: CopilotAgentConfig;

  constructor(config: Partial<CopilotAgentConfig> = {}) {
    super();
    
    this.config = {
      maxIterations: config.maxIterations || 50,
      maxDuration: config.maxDuration || 30 * 60 * 1000,
      deniedTools: config.deniedTools || [
        'rm -rf',
        'git push',
        'npm publish',
        'curl -X POST',
        'wget'
      ],
      allowAllPaths: config.allowAllPaths || false,
      model: config.model || 'claude-sonnet-4.5',
      timeout: config.timeout || 60000
    };
  }

  /**
   * Start persistent Copilot CLI session
   */
  async start(session: AgentSession): Promise<void> {
    if (this.sessionActive) {
      throw new Error('Agent session already active');
    }

    this.iterations = 0;
    this.startTime = Date.now();
    this.sessionActive = true;

    // Check if gh copilot is available
    const isAvailable = await this.checkCopilotAvailability();
    if (!isAvailable) {
      throw new Error('GitHub Copilot CLI not available. Install with: gh extension install github/gh-copilot');
    }

    this.emit('started', { sessionId: session.id, timestamp: new Date() });
  }

  /**
   * Send prompt to Copilot and get response
   */
  async prompt(message: string, conversationHistory: AgentMessage[]): Promise<string> {
    if (!this.sessionActive) {
      throw new Error('Agent session not active');
    }

    // Safety checks
    const safetyCheck = this.checkSafety();
    if (!safetyCheck.allowed) {
      throw new Error(`Safety check failed: ${safetyCheck.reason}`);
    }

    this.iterations++;
    this.emit('iteration', { iteration: this.iterations, timestamp: new Date() });

    try {
      // Use gh copilot suggest with context
      const response = await this.executeCopilotCommand(message, conversationHistory);
      
      this.emit('response', { response, timestamp: new Date() });
      return response;
    } catch (error) {
      this.emit('error', { error: (error as Error).message, timestamp: new Date() });
      throw error;
    }
  }

  /**
   * Execute a command through Copilot CLI
   */
  private async executeCopilotCommand(
    prompt: string,
    conversationHistory: AgentMessage[]
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Build context from conversation history
      const context = conversationHistory
        .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n\n');

      const fullPrompt = context 
        ? `${context}\n\nUSER: ${prompt}`
        : prompt;

      // Use gh copilot suggest with JSON output
      const args = [
        'copilot',
        'suggest',
        fullPrompt,
        '--format', 'json'
      ];

      if (this.config.model) {
        args.push('--model', this.config.model);
      }

      const copilot = spawn('gh', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        env: {
          ...process.env,
          GH_COPILOT_AUTO_APPROVE: 'false' // We handle approval
        }
      });

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        copilot.kill();
        reject(new Error('Copilot command timeout'));
      }, this.config.timeout);

      copilot.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      copilot.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      copilot.on('close', (code: number) => {
        clearTimeout(timeout);

        if (code !== 0) {
          reject(new Error(`Copilot command failed: ${stderr}`));
          return;
        }

        try {
          // Parse JSON response
          const response = JSON.parse(stdout);
          resolve(response.suggestion || response.text || stdout);
        } catch (err) {
          // If not JSON, return raw output
          resolve(stdout);
        }
      });

      copilot.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn copilot: ${err.message}`));
      });
    });
  }

  /**
   * Stop the agent session
   */
  async stop(): Promise<void> {
    if (!this.sessionActive) {
      return;
    }

    this.sessionActive = false;

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.emit('stopped', { 
      iterations: this.iterations,
      duration: Date.now() - this.startTime,
      timestamp: new Date()
    });
  }

  /**
   * Check if agent should continue
   */
  private checkSafety(): SafetyCheckResult {
    const elapsed = Date.now() - this.startTime;

    // Check iteration limit
    if (this.iterations >= this.config.maxIterations) {
      return {
        allowed: false,
        reason: `Maximum iterations reached (${this.config.maxIterations})`,
        violations: ['MAX_ITERATIONS']
      };
    }

    // Check time limit
    if (elapsed >= this.config.maxDuration) {
      return {
        allowed: false,
        reason: `Maximum duration exceeded (${this.config.maxDuration}ms)`,
        violations: ['MAX_DURATION']
      };
    }

    return { allowed: true };
  }

  /**
   * Check if tool/command should be denied
   */
  validateAction(action: string): SafetyCheckResult {
    for (const denied of this.config.deniedTools) {
      if (action.includes(denied)) {
        return {
          allowed: false,
          reason: `Action contains denied tool: ${denied}`,
          violations: [denied]
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check if GitHub Copilot CLI is available
   */
  private async checkCopilotAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const check = spawn('gh', ['copilot', '--version'], {
        stdio: 'ignore',
        shell: true
      });

      check.on('close', (code: number) => {
        resolve(code === 0);
      });

      check.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      iterations: this.iterations,
      duration: Date.now() - this.startTime,
      active: this.sessionActive
    };
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.sessionActive;
  }
}
