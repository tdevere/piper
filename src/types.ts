export enum CaseState {
  Intake = "Intake",           // Initial problem intake and evidence collection
  Normalize = "Normalize",     // Standardize and structure data
  Classify = "Classify",       // Categorize issue type
  Plan = "Plan",               // Generate remediation plan
  Execute = "Execute",         // Apply fixes
  PendingExternal = "PendingExternal",  // Waiting for external input
  Evaluate = "Evaluate",       // Verify if fix worked
  Resolve = "Resolve",         // Mark as resolved with postmortem
  ReadyForSolution = "ReadyForSolution", // Compile solution for knowledge base
  Postmortem = "Postmortem"    // Final analysis (deprecated - use ReadyForSolution)
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

export interface ScopingCategory {
  category: string;
  requiredFields: string[];
}

export interface ScopingTemplate {
  id: string;
  title: string;
  description: string;
  templateType: 'scoping';
  classification: {
    domain: string;
    area: string;
    subArea?: string;
    tags: string[];
  };
  metadata: {
    source: string;
    stage: 'intake';
    customerFacing: boolean;
    createdAt: string;
  };
  scopingCategories: ScopingCategory[];
  totalRequiredFields?: number; // Count of all required fields
  externalReferences?: Array<{ title: string; url: string }>;
}

export interface IssueTemplate {
  id: string;
  version: string;
  name: string;
  description: string;
  templateType?: 'troubleshooting' | 'scoping'; // Template usage stage
  keywords: string[]; // For matching
  errorPatterns?: string[]; // Regex patterns for error matching
  patterns?: string[]; // Alternative name for compatibility
  questions: Omit<Question, 'status' | 'answer'>[]; // Template questions
  initialHypotheses?: Omit<Hypothesis, 'status' | 'evidenceRefs'>[];
  classification?: string; // Issue type: Configuration, Network, Permissions, etc.
  externalReferences?: Array<{ title: string; url: string }>; // Links to documentation
  
  // Learned template metadata
  enabled?: boolean; // Can be disabled without deleting
  createdFrom?: string; // Case ID this was learned from
  basedOnTemplate?: string; // Parent template ID if this is a refinement
  created?: string; // ISO timestamp
  disabled_at?: string; // When it was disabled
  
  metadata?: {
    source?: string;
    createdAt: string;
    updatedAt: string;
    usageCount?: number;
    incomplete?: boolean; // Template has no content yet
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
  metadata?: { // Additional tracking and audit information
    rejectedTemplates?: Array<{
      templateId: string;
      templateName: string;
      score?: number;
      timestamp: string;
      reason: string;
    }>;
    scopeRefinements?: Array<{
      version: number;
      oldSummary: string;
      newSummary: string;
      timestamp: string;
      userInitiated: boolean;
    }>;
    detailedProblemStatement?: string; // Enhanced problem description with error details
    decisionJournal?: Array<{
      timestamp: string;
      stage: CaseState;
      agent: string;
      decision: string;
      reasoning: string;
      evidenceRefs: string[];
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
      leadAgentReview?: {
        quality: 'PASS' | 'NEEDS_IMPROVEMENT' | 'FAIL';
        concerns: string[];
      };
    }>;
    scopeAnalysis?: { // AI-generated scope analysis stored for reference
      timestamp: string;
      agent: string;
      summary: string;
      errorPatterns: string[];
      affectedComponents: string[];
      impact: string;
      confidence: number; // 0-100
    };
    remediationPlan?: { // AI-generated troubleshooting plan
      timestamp: string;
      agent: string;
      rootCause: string;
      steps: Array<{
        order: number;
        action: string;
        commands?: string[];
        expectedOutcome: string;
      }>;
      verificationSteps: string[];
      planMarkdown?: string; // Full markdown version of the plan
    };
    templateEffectiveness?: { // Track how well templates matched the actual problem
      templateId?: string;
      templateName?: string;
      initialScore?: number; // Match score when template was applied (0-100)
      accuracyScore?: number; // How accurate was the template after resolution (0-100)
      wasAccurate: boolean; // Did template lead to correct diagnosis?
      shouldCreateLearnedTemplate: boolean; // Should we generate improved template?
      timestamp: string;
    };
  };
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
