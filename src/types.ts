export enum CaseState {
  Intake = "Intake",
  Normalize = "Normalize",
  Classify = "Classify",
  Plan = "Plan",
  Execute = "Execute",
  PendingExternal = "PendingExternal",
  Evaluate = "Evaluate",
  Resolve = "Resolve",
  Postmortem = "Postmortem"
}

export interface CaseEvent {
  ts: string;
  type: string;
  actor: string;
  detail: string;
}

export interface EvidenceExtract {
  extractorName: string;
  type: "Text" | "Json" | "Yaml" | "LogIndex";
  summary: string;
  contentRef?: string; // Path to derived file
}

export interface Evidence {
  id: string;
  kind: string; // file, text, link
  path: string; // stored path
  originalPath: string;
  mediaType: string;
  hash: string;
  sizeBytes: number;
  tags: string[];
  isRedacted?: boolean; // New field
  extracts: EvidenceExtract[];
  metadata?: {
    size?: number;
    priority?: 'high' | 'normal' | 'low';
    [key: string]: any;
  };
}

export interface Question {
  id: string;
  ask: string;
  required: boolean;
  status: "Open" | "Answered" | "Skipped";
  answer?: string;
  expectedFormat: "text" | "json" | "path";
  guidance?: string; // How to gather this information
  examples?: string[]; // Example answers
  verificationRequired?: boolean; // Requires evidence proof
  evidenceRef?: string; // Reference to supporting evidence
}

export interface Constraint {
  id: string;
  questionId: string;
  reason: "Security" | "Technical" | "Not Relevant" | "Process";
  description: string;
}

export interface Hypothesis {
  id: string;
  description: string;
  status: "Open" | "Validated" | "Disproven";
  evidenceRefs: string[];
}

export interface IssueTemplate {
  id: string;
  version: string;
  name: string;
  description: string;
  keywords: string[]; // For matching
  errorPatterns?: string[]; // Regex patterns for error matching
  questions: Omit<Question, 'status' | 'answer'>[]; // Template questions
  initialHypotheses?: Omit<Hypothesis, 'status' | 'evidenceRefs'>[];
  classification?: string; // Issue type: Configuration, Network, Permissions, etc.
  metadata?: {
    createdAt: string;
    updatedAt: string;
    usageCount?: number;
  };
}

export interface Case {
  id: string;
  strictMode?: boolean;
  constraints?: Constraint[];
  principlesVersion: string;
  title: string;
  state: CaseState;
  formal: { expected: string; actual: string; boundaries?: string; definitions?: any };
  hypotheses: Hypothesis[];
  questions: Question[];
  evidence: Evidence[];
  events: CaseEvent[];
  unknowns: string[];
  context?: string; // Analysis context: pipelines, azure, kubernetes, etc.
  templateId?: string; // Reference to the template used
  classification?: string; // Auto-classified issue type
  scopeConfirmed?: boolean; // Whether user has confirmed the problem scope
  problemScope?: { // Current detailed problem scope after evidence analysis
    summary: string; // Concise problem statement
    errorPatterns: string[]; // Key error patterns found
    affectedComponents: string[]; // Components/services affected
    timeframe?: string; // When did this start
    impact: string; // Business/technical impact
    evidenceSummary: string; // What evidence we have
    version?: number; // Version number for tracking changes
    timestamp?: string; // When this scope was generated
  };
  scopeHistory?: Array<{ // Historical record of scope changes
    version: number;
    timestamp: string;
    summary: string;
    errorPatterns: string[];
    affectedComponents: string[];
    timeframe?: string;
    impact: string;
    evidenceSummary: string;
    reason?: string; // Why the scope was updated
  }>;
  final?: {
    desiredOutcome: string;
    acceptanceCriteria: string[];
  };
  outcome?: {
    verdict: string;
    explanation: string;
    evidenceRefs: string[];
  };
  specialistProfile?: string; // name of the specialist profile used
}

export interface AgentResponse {
  thoughtProcess: string;
  newHypotheses?: Hypothesis[];
  newQuestions?: Question[];
  recommendedState?: CaseState;
  classification?: string; // Agent can suggest classification
  outcome?: Case["outcome"];
  actions?: { type: string; payload: any }[];
}
