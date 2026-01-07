import chalk from 'chalk';
import * as readline from 'readline';
import { AgentSessionManager } from './AgentSessionManager';
import { CopilotAgentBridge } from './CopilotAgentBridge';
import { LLMClient } from '../llm/LLMClient';
import { Orchestrator } from '../orchestration/Orchestrator';
import { CaseStore } from '../storage/CaseStore';
import {
  AgentSession,
  AgentStatus,
  AgentState,
  AgentAction,
  AgentMessage,
  AgentActionResult,
  AgentEvent
} from './types';
import { Case, CaseState, Question, Hypothesis } from '../types';

/**
 * Orchestrates agent execution with LLM and case management
 */
export class AgentRunner {
  private rl: readline.Interface | null = null;

  constructor(
    private sessionManager: AgentSessionManager,
    private llmClient: LLMClient,
    private orchestrator: Orchestrator,
    private caseStore: CaseStore
  ) {
    // Don't create readline interface until needed
  }

  /**
   * Create readline interface lazily
   */
  private getReadlineInterface(): readline.Interface {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
    }
    return this.rl;
  }

  /**
   * Run agent session until completion or manual stop
   */
  async runAgent(sessionId: string, autoApprove: boolean = false): Promise<void> {
    const session = await this.sessionManager.loadSession(sessionId);
    
    console.log(chalk.blue(`\n🤖 Starting agent session: ${session.id}`));
    console.log(chalk.gray(`Case: ${session.caseId}`));
    console.log(chalk.gray(`Profile: ${session.profile}`));
    console.log(chalk.gray(`Specialization: ${session.personality.specialization}\n`));

    const bridge = new CopilotAgentBridge({
      maxIterations: session.config.maxIterations,
      maxDuration: session.config.maxDuration,
      deniedTools: session.config.deniedActions,
      model: session.config.model
    });

    // Set up event listeners
    this.setupEventListeners(bridge, session);

    try {
      await bridge.start(session);

      session.state = AgentState.Thinking;
      await this.sessionManager.saveSession(session);

      while (this.shouldContinue(session)) {
        // Get next action from agent
        const action = await this.getNextAction(bridge, session);
        
        if (!action) {
          console.log(chalk.yellow('\n⚠️ Agent has no more actions to perform'));
          break;
        }

        // Display proposed action
        this.displayAction(action);

        // Request approval if not auto-approve
        let approved = autoApprove;
        if (!autoApprove && action.requiresApproval) {
          approved = await this.requestApproval(action);
        }

        if (approved) {
          session.state = AgentState.Acting;
          await this.sessionManager.saveSession(session);

          // Execute action
          const result = await this.executeAction(session, action);
          
          // Update session with result
          await this.updateSessionWithResult(session, action, result);
          
          session.metrics.iterations++;
          session.metrics.lastActivity = new Date();
          
        } else {
          console.log(chalk.yellow('✗ Action rejected\n'));
        }

        // Check if we should pause
        if (session.config.iterationDelay) {
          await this.sleep(session.config.iterationDelay);
        }

        // Reload case data to get latest state
        const caseData = await this.caseStore.load(session.caseId);
        session.currentCaseState = caseData.state;
        session.context.evidence = caseData.evidence;
        session.context.answeredQuestions = caseData.questions.filter(q => q.status === 'Answered');
        session.context.hypotheses = caseData.hypotheses;

        session.state = AgentState.Thinking;
        await this.sessionManager.saveSession(session);
      }

      // Check why we stopped
      if (session.metrics.iterations >= session.config.maxIterations) {
        console.log(chalk.yellow(`\n⚠️ Reached maximum iterations (${session.config.maxIterations})`));
      }

      const elapsed = new Date().getTime() - session.metrics.startTime.getTime();
      if (elapsed >= session.config.maxDuration) {
        console.log(chalk.yellow(`\n⚠️ Reached maximum duration`));
      }

      await bridge.stop();
      await this.sessionManager.completeSession(session.id);

      console.log(chalk.green(`\n✅ Agent session completed`));
      this.displayMetrics(session);

    } catch (error) {
      console.error(chalk.red(`\n❌ Agent error: ${(error as Error).message}`));
      session.metrics.errorsEncountered++;
      await this.sessionManager.completeSession(session.id, false);
      throw error;
    } finally {
      if (this.rl) {
        this.rl.close();
        this.rl = null;
      }
    }
  }

  /**
   * Get next action from agent
   */
  private async getNextAction(
    bridge: CopilotAgentBridge,
    session: AgentSession
  ): Promise<AgentAction | null> {
    // Build prompt based on current state
    const prompt = this.buildPrompt(session);
    
    try {
      const response = await bridge.prompt(prompt, session.context.conversationHistory);
      
      // Parse response as JSON
      let parsed: any;
      try {
        parsed = JSON.parse(response);
      } catch {
        // If not JSON, treat as text response
        parsed = { thought: response, action: null };
      }

      // Add to conversation history
      session.context.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });

      // Display agent's thought process
      if (parsed.thought) {
        console.log(chalk.cyan(`\n💭 Agent: ${parsed.thought}\n`));
      }

      // Extract action
      if (parsed.action) {
        return this.parseAction(parsed);
      }

      return null;
    } catch (error) {
      console.error(chalk.red(`Failed to get action: ${(error as Error).message}`));
      return null;
    }
  }

  /**
   * Build prompt for current context
   */
  private buildPrompt(session: AgentSession): string {
    const caseData = session.context;
    const openQuestions = session.personality.investigationPlan.filter(
      q => !caseData.answeredQuestions.find(aq => aq.id === q.id)
    );

    return `Current State: ${session.currentCaseState}
Iterations: ${session.metrics.iterations}/${session.config.maxIterations}

Open Questions (${openQuestions.length}/${session.personality.investigationPlan.length}):
${openQuestions.map(q => `- [${q.id}] ${q.ask}${q.required ? ' (REQUIRED)' : ''}`).join('\n')}

Available Evidence: ${caseData.evidence.length} files

What should be the next action? Consider:
1. Answering open questions by analyzing evidence
2. Testing hypotheses against evidence
3. Requesting additional evidence if needed
4. Transitioning case state when gates are met

Provide your response in JSON format:
{
  "thought": "your reasoning",
  "action": {
    "type": "answer-question|test-hypothesis|request-evidence|transition-state",
    "payload": { ... }
  },
  "confidence": "HIGH|MEDIUM|LOW"
}`;
  }

  /**
   * Parse action from agent response
   */
  private parseAction(parsed: any): AgentAction {
    const actionType = parsed.action.type;
    
    return {
      id: `action-${Date.now()}`,
      type: actionType,
      description: this.getActionDescription(parsed.action),
      payload: parsed.action.payload,
      requiresApproval: this.requiresApproval(actionType),
      estimatedImpact: this.estimateImpact(actionType)
    };
  }

  /**
   * Get human-readable description for action
   */
  private getActionDescription(action: any): string {
    switch (action.type) {
      case 'answer-question':
        return `Answer question ${action.payload.questionId}: ${action.payload.answer}`;
      case 'test-hypothesis':
        return `Test hypothesis ${action.payload.hypothesisId}`;
      case 'request-evidence':
        return `Request additional evidence: ${action.payload.description}`;
      case 'transition-state':
        return `Transition to state: ${action.payload.targetState}`;
      default:
        return `Unknown action: ${action.type}`;
    }
  }

  /**
   * Check if action requires approval
   */
  private requiresApproval(actionType: string): boolean {
    const highImpactActions = ['transition-state', 'request-evidence'];
    return highImpactActions.includes(actionType);
  }

  /**
   * Estimate impact of action
   */
  private estimateImpact(actionType: string): 'low' | 'medium' | 'high' {
    switch (actionType) {
      case 'answer-question':
      case 'test-hypothesis':
        return 'low';
      case 'request-evidence':
        return 'medium';
      case 'transition-state':
        return 'high';
      default:
        return 'medium';
    }
  }

  /**
   * Display action to user
   */
  private displayAction(action: AgentAction): void {
    const impactColor = action.estimatedImpact === 'high' ? 'red' : 
                       action.estimatedImpact === 'medium' ? 'yellow' : 'green';
    
    console.log(chalk.bold(`\n🎯 Proposed Action:`));
    console.log(`   Type: ${action.type}`);
    console.log(`   ${action.description}`);
    console.log(chalk[impactColor](`   Impact: ${action.estimatedImpact.toUpperCase()}`));
  }

  /**
   * Request user approval for action
   */
  private async requestApproval(action: AgentAction): Promise<boolean> {
    const rl = this.getReadlineInterface();
    return new Promise((resolve) => {
      rl.question(chalk.yellow('Approve this action? [y/N] '), (answer) => {
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  /**
   * Execute approved action
   */
  private async executeAction(
    session: AgentSession,
    action: AgentAction
  ): Promise<AgentActionResult> {
    console.log(chalk.blue(`\n⚡ Executing action...`));

    const caseData = await this.caseStore.load(session.caseId);

    try {
      switch (action.type) {
        case 'answer-question':
          await this.executeAnswerQuestion(caseData, action.payload);
          break;
        
        case 'test-hypothesis':
          await this.executeTestHypothesis(caseData, action.payload);
          break;
        
        case 'transition-state':
          await this.executeTransitionState(caseData, action.payload);
          break;
        
        case 'request-evidence':
          console.log(chalk.yellow('   Evidence request logged (requires manual upload)'));
          break;
        
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      console.log(chalk.green('   ✓ Action completed\n'));

      return {
        success: true,
        action,
        timestamp: new Date()
      };

    } catch (error) {
      console.log(chalk.red(`   ✗ Action failed: ${(error as Error).message}\n`));
      
      return {
        success: false,
        action,
        error: (error as Error).message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Execute answer-question action
   */
  private async executeAnswerQuestion(caseData: Case, payload: any): Promise<void> {
    const { questionId, answer, confidence, evidenceRefs } = payload;
    
    await this.orchestrator.addAnswer(
      caseData.id,
      questionId,
      answer
    );

    console.log(chalk.green(`   ✓ Answered question ${questionId}`));
    console.log(chalk.gray(`     Answer: ${answer}`));
    if (confidence) {
      console.log(chalk.gray(`     Confidence: ${confidence}`));
    }
  }

  /**
   * Execute test-hypothesis action
   */
  private async executeTestHypothesis(caseData: Case, payload: any): Promise<void> {
    const { hypothesisId, status, evidenceRefs } = payload;
    
    // Update hypothesis status
    const hypothesis = caseData.hypotheses.find(h => h.id === hypothesisId);
    if (hypothesis) {
      hypothesis.status = status;
      if (evidenceRefs) {
        hypothesis.evidenceRefs = evidenceRefs;
      }
      await this.caseStore.save(caseData);
      
      console.log(chalk.green(`   ✓ Updated hypothesis ${hypothesisId} to ${status}`));
    }
  }

  /**
   * Execute transition-state action
   */
  private async executeTransitionState(caseData: Case, payload: any): Promise<void> {
    const { targetState } = payload;
    
    // Use orchestrator.next() which handles state transitions
    await this.orchestrator.next(caseData.id);
    
    // Reload case to get new state
    const updatedCase = await this.caseStore.load(caseData.id);
    console.log(chalk.green(`   ✓ Transitioned to ${updatedCase.state}`));
  }

  /**
   * Update session with action result
   */
  private async updateSessionWithResult(
    session: AgentSession,
    action: AgentAction,
    result: AgentActionResult
  ): Promise<void> {
    // Update metrics
    if (action.type === 'answer-question' && result.success) {
      session.metrics.questionsAnswered++;
    }
    if (action.type === 'test-hypothesis' && result.success) {
      session.metrics.hypothesesTested++;
    }
    if (action.type === 'transition-state' && result.success) {
      session.metrics.stateTransitions++;
    }
    if (!result.success) {
      session.metrics.errorsEncountered++;
    }

    await this.sessionManager.saveSession(session);
  }

  /**
   * Check if agent should continue
   */
  private shouldContinue(session: AgentSession): boolean {
    if (session.status !== AgentStatus.Active) {
      return false;
    }

    if (session.metrics.iterations >= session.config.maxIterations) {
      return false;
    }

    const elapsed = new Date().getTime() - session.metrics.startTime.getTime();
    if (elapsed >= session.config.maxDuration) {
      return false;
    }

    return true;
  }

  /**
   * Set up event listeners for agent bridge
   */
  private setupEventListeners(bridge: CopilotAgentBridge, session: AgentSession): void {
    bridge.on('iteration', (data: any) => {
      console.log(chalk.gray(`[Iteration ${data.iteration}/${session.config.maxIterations}]`));
    });

    bridge.on('error', (data: any) => {
      console.error(chalk.red(`Agent error: ${data.error}`));
    });
  }

  /**
   * Display session metrics
   */
  private displayMetrics(session: AgentSession): void {
    const elapsed = new Date().getTime() - session.metrics.startTime.getTime();
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);

    console.log(chalk.bold('\n📊 Session Metrics:'));
    console.log(`   Iterations: ${session.metrics.iterations}`);
    console.log(`   Duration: ${minutes}m ${seconds}s`);
    console.log(`   Questions Answered: ${session.metrics.questionsAnswered}`);
    console.log(`   Hypotheses Tested: ${session.metrics.hypothesesTested}`);
    console.log(`   State Transitions: ${session.metrics.stateTransitions}`);
    console.log(`   Errors: ${session.metrics.errorsEncountered}`);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
