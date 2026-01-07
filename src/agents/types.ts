import { CaseState, Question, Hypothesis, Evidence } from '../types';

/**
 * Status of the agent session
 */
export enum AgentStatus {
  Active = 'active',
  Paused = 'paused',
  Completed = 'completed',
  Failed = 'failed',
  Terminated = 'terminated'
}

/**
 * Current action the agent is performing
 */
export enum AgentState {
  Idle = 'idle',
  Thinking = 'thinking',
  Acting = 'acting',
  Waiting = 'waiting'
}

/**
 * Commands that can be sent to the agent
 */
export type AgentCommand = 
  | { type: 'analyze-evidence'; evidenceId: string }
  | { type: 'answer-question'; questionId: string; answer: string }
  | { type: 'test-hypothesis'; hypothesisId: string }
  | { type: 'transition-state'; targetState: CaseState }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'terminate' };

/**
 * Events emitted by the agent
 */
export type AgentEvent =
  | { type: 'thought-process'; content: string; timestamp: Date }
  | { type: 'action-proposed'; action: any; timestamp: Date }
  | { type: 'question-generated'; question: Question; timestamp: Date }
  | { type: 'question-answered'; questionId: string; answer: string; timestamp: Date }
  | { type: 'hypothesis-updated'; hypothesisId: string; status: string; timestamp: Date }
  | { type: 'state-changed'; from: CaseState; to: CaseState; timestamp: Date }
  | { type: 'error'; error: string; timestamp: Date }
  | { type: 'iteration-complete'; iteration: number; timestamp: Date };

/**
 * Action that the agent wants to take
 */
export interface AgentAction {
  id: string;
  type: string;
  description: string;
  payload: any;
  requiresApproval: boolean;
  estimatedImpact: 'low' | 'medium' | 'high';
}

/**
 * Message in the agent's conversation history
 */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * Agent personality derived from template
 */
export interface AgentPersonality {
  specialization: string; // e.g., "Azure Deployment Troubleshooting"
  domainKnowledge: string[]; // Keywords and patterns
  investigationPlan: Question[]; // Questions to answer
  workingTheories: Hypothesis[]; // Initial hypotheses
  communicationStyle: string; // How agent should respond
  evidenceRequirements: string[]; // Required question IDs
}

/**
 * Configuration for agent behavior
 */
export interface AgentConfig {
  maxIterations: number;
  maxDuration: number; // milliseconds
  autoApprove: boolean;
  deniedActions: string[];
  allowedActions?: string[];
  iterationDelay?: number; // ms between iterations
  model?: string; // LLM model to use
}

/**
 * Metrics tracked during agent execution
 */
export interface AgentMetrics {
  iterations: number;
  startTime: Date;
  lastActivity: Date;
  tokenUsage: number;
  questionsAnswered: number;
  hypothesesTested: number;
  stateTransitions: number;
  errorsEncountered: number;
}

/**
 * Context maintained by the agent
 */
export interface AgentContext {
  evidence: Evidence[];
  answeredQuestions: Question[];
  hypotheses: Hypothesis[];
  lastAction?: string;
  conversationHistory: AgentMessage[];
  pendingActions: AgentAction[];
}

/**
 * Complete agent session state
 */
export interface AgentSession {
  // Identity
  id: string;
  caseId: string;
  profile: string; // Specialist profile name
  
  // Status
  status: AgentStatus;
  state: AgentState;
  currentCaseState: CaseState;
  
  // Personality
  personality: AgentPersonality;
  
  // Memory
  context: AgentContext;
  
  // Control
  config: AgentConfig;
  
  // Metrics
  metrics: AgentMetrics;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  pausedAt?: Date;
  completedAt?: Date;
}

/**
 * Result of an agent action execution
 */
export interface AgentActionResult {
  success: boolean;
  action: AgentAction;
  output?: any;
  error?: string;
  timestamp: Date;
}

/**
 * Safety check result
 */
export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  violations?: string[];
}
