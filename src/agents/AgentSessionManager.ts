import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentSession,
  AgentStatus,
  AgentState,
  AgentPersonality,
  AgentConfig,
  AgentMetrics,
  AgentContext,
  AgentMessage
} from './types';
import { Case, IssueTemplate, Question, Hypothesis } from '../types';

/**
 * Manages agent session lifecycle: create, load, save, list
 */
export class AgentSessionManager {
  constructor(private basePath: string) {}

  /**
   * Create a new agent session for a case
   */
  async createSession(
    caseData: Case,
    template: IssueTemplate | null,
    config?: Partial<AgentConfig>
  ): Promise<AgentSession> {
    const sessionId = uuidv4();
    const personality = this.buildPersonality(caseData, template);
    
    const defaultConfig: AgentConfig = {
      maxIterations: 50,
      maxDuration: 30 * 60 * 1000, // 30 minutes
      autoApprove: false,
      deniedActions: [
        'shell(rm *)',
        'shell(git push)',
        'shell(npm publish)',
        'file_delete_recursive'
      ],
      iterationDelay: 1000,
      model: process.env.LLM_PROVIDER || 'copilot',
      ...config
    };

    const session: AgentSession = {
      id: sessionId,
      caseId: caseData.id,
      profile: caseData.specialistProfile || 'generic',
      status: AgentStatus.Active,
      state: AgentState.Idle,
      currentCaseState: caseData.state,
      personality,
      context: {
        evidence: [...caseData.evidence],
        answeredQuestions: caseData.questions.filter(q => q.status === 'Answered'),
        hypotheses: [...caseData.hypotheses],
        conversationHistory: this.buildInitialHistory(caseData, personality),
        pendingActions: []
      },
      config: defaultConfig,
      metrics: {
        iterations: 0,
        startTime: new Date(),
        lastActivity: new Date(),
        tokenUsage: 0,
        questionsAnswered: 0,
        hypothesesTested: 0,
        stateTransitions: 0,
        errorsEncountered: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.saveSession(session);
    return session;
  }

  /**
   * Load an existing session
   */
  async loadSession(sessionId: string): Promise<AgentSession> {
    const sessionPath = this.getSessionPath(sessionId);
    
    if (!await fs.pathExists(sessionPath)) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const data = await fs.readJSON(sessionPath);
    
    // Convert date strings back to Date objects
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      pausedAt: data.pausedAt ? new Date(data.pausedAt) : undefined,
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      metrics: {
        ...data.metrics,
        startTime: new Date(data.metrics.startTime),
        lastActivity: new Date(data.metrics.lastActivity)
      },
      context: {
        ...data.context,
        conversationHistory: data.context.conversationHistory.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }
    };
  }

  /**
   * Save session state
   */
  async saveSession(session: AgentSession): Promise<void> {
    session.updatedAt = new Date();
    const sessionPath = this.getSessionPath(session.id);
    await fs.ensureDir(path.dirname(sessionPath));
    await fs.writeJSON(sessionPath, session, { spaces: 2 });
  }

  /**
   * List all active sessions
   */
  async listActiveSessions(): Promise<AgentSession[]> {
    const sessions: AgentSession[] = [];
    
    // Scan .sessions directory
    const sessionsDir = path.join(this.basePath, '.sessions');
    if (!await fs.pathExists(sessionsDir)) {
      return sessions;
    }

    const entries = await fs.readdir(sessionsDir);
    
    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        const sessionPath = path.join(sessionsDir, entry);
        try {
          const session = await this.loadSessionFromPath(sessionPath);
          if (session.status === AgentStatus.Active || session.status === AgentStatus.Paused) {
            sessions.push(session);
          }
        } catch (err) {
          console.error(`Failed to load session from ${sessionPath}:`, err);
        }
      }
    }

    return sessions;
  }

  /**
   * Pause a session
   */
  async pauseSession(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    session.status = AgentStatus.Paused;
    session.state = AgentState.Idle;
    session.pausedAt = new Date();
    await this.saveSession(session);
  }

  /**
   * Resume a paused session
   */
  async resumeSession(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (session.status !== AgentStatus.Paused) {
      throw new Error(`Session ${sessionId} is not paused (status: ${session.status})`);
    }
    session.status = AgentStatus.Active;
    session.pausedAt = undefined;
    await this.saveSession(session);
  }

  /**
   * Mark session as completed
   */
  async completeSession(sessionId: string, success: boolean = true): Promise<void> {
    const session = await this.loadSession(sessionId);
    session.status = success ? AgentStatus.Completed : AgentStatus.Failed;
    session.state = AgentState.Idle;
    session.completedAt = new Date();
    await this.saveSession(session);
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    session.status = AgentStatus.Terminated;
    session.state = AgentState.Idle;
    session.completedAt = new Date();
    await this.saveSession(session);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const sessionPath = this.getSessionPath(sessionId);
    if (await fs.pathExists(sessionPath)) {
      await fs.remove(sessionPath);
    }
  }

  /**
   * Get session file path
   */
  private getSessionPath(sessionId: string): string {
    // Sessions are stored in the case directory
    // We need to find which case this session belongs to
    // For now, use a simple naming convention
    return path.join(this.basePath, '.sessions', `${sessionId}.json`);
  }

  /**
   * Load session from specific path
   */
  private async loadSessionFromPath(sessionPath: string): Promise<AgentSession> {
    const data = await fs.readJSON(sessionPath);
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      pausedAt: data.pausedAt ? new Date(data.pausedAt) : undefined,
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      metrics: {
        ...data.metrics,
        startTime: new Date(data.metrics.startTime),
        lastActivity: new Date(data.metrics.lastActivity)
      },
      context: {
        ...data.context,
        conversationHistory: data.context.conversationHistory.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }
    };
  }

  /**
   * Build agent personality from template and case
   */
  private buildPersonality(caseData: Case, template: IssueTemplate | null): AgentPersonality {
    const specialization = template?.name || caseData.classification || 'General Troubleshooting';
    const domainKnowledge = template?.keywords || [];
    const investigationPlan = template?.questions.map((q, idx) => ({
      id: `q${idx + 1}`,
      ask: q.ask,
      required: q.required,
      status: 'Open' as const,
      expectedFormat: q.expectedFormat
    })) || [];
    
    const workingTheories = template?.initialHypotheses?.map((h, idx) => ({
      id: `h${idx + 1}`,
      description: h.description,
      status: 'Open' as const,
      evidenceRefs: []
    })) || [];

    const evidenceRequirements = investigationPlan
      .filter(q => q.required)
      .map(q => q.id);

    const communicationStyle = template?.description || 
      'Systematic troubleshooting assistant focused on evidence-based investigation';

    return {
      specialization,
      domainKnowledge,
      investigationPlan,
      workingTheories,
      communicationStyle,
      evidenceRequirements
    };
  }

  /**
   * Build initial conversation history with system prompt
   */
  private buildInitialHistory(caseData: Case, personality: AgentPersonality): AgentMessage[] {
    const systemPrompt = this.buildSystemPrompt(caseData, personality);
    
    return [
      {
        role: 'system',
        content: systemPrompt,
        timestamp: new Date()
      },
      {
        role: 'user',
        content: `Begin investigation of case: ${caseData.title}\n\nProblem Statement:\nExpected: ${caseData.formal.expected}\nActual: ${caseData.formal.actual}`,
        timestamp: new Date()
      }
    ];
  }

  /**
   * Build system prompt for agent personality
   */
  private buildSystemPrompt(caseData: Case, personality: AgentPersonality): string {
    return `You are an expert troubleshooting agent specialized in: ${personality.specialization}

Your role is to systematically investigate issues by:
1. Analyzing evidence to answer diagnostic questions
2. Testing hypotheses against available evidence
3. Proposing state transitions when validation gates are met
4. Generating new questions or hypotheses as needed

DOMAIN EXPERTISE:
${personality.domainKnowledge.length > 0 ? personality.domainKnowledge.join(', ') : 'General troubleshooting'}

INVESTIGATION PLAN:
You must answer these ${personality.investigationPlan.length} diagnostic questions:
${personality.investigationPlan.map((q, i) => `${i + 1}. [${q.id}] ${q.ask}${q.required ? ' (REQUIRED)' : ''}`).join('\n')}

WORKING THEORIES:
${personality.workingTheories.map((h, i) => `${i + 1}. ${h.description}`).join('\n')}

CURRENT CASE STATE: ${caseData.state}

COMMUNICATION STYLE:
${personality.communicationStyle}

CONSTRAINTS:
- Always provide evidence references for your conclusions
- Mark confidence level (HIGH/MEDIUM/LOW) for answers
- Request additional evidence when needed
- Follow the state machine validation rules
- Never skip required questions without strong justification

Your responses should be in JSON format with the following structure:
{
  "thought": "Your reasoning process",
  "action": {
    "type": "answer-question" | "test-hypothesis" | "request-evidence" | "transition-state",
    "payload": { ... }
  },
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "evidenceRefs": ["evidence-id-1", "evidence-id-2"]
}`;
  }
}
