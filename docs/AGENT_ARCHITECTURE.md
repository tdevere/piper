# Persistent Agent Architecture

## Overview

The Piper CLI now includes a persistent agent system that can autonomously investigate cases using GitHub Copilot CLI as the AI engine. Agents maintain conversation context, execute actions with safety controls, and systematically work through diagnostic questions and hypotheses.

## Architecture Components

### 1. AgentSessionManager
**Location:** `src/agents/AgentSessionManager.ts`

Manages the complete lifecycle of agent sessions:
- **createSession()** - Creates new agent from case data and template
- **loadSession()** / **saveSession()** - Persistence to `.sessions/` directory
- **pauseSession()** / **resumeSession()** - Control agent execution
- **completeSession()** / **terminateSession()** - Cleanup
- **listActiveSessions()** - Query running agents

**Key Features:**
- Builds agent personality from `IssueTemplate` (specialization, domain knowledge, investigation plan)
- Generates system prompts with context from template
- Maintains conversation history across sessions
- Tracks comprehensive metrics (iterations, questions answered, state transitions)

### 2. CopilotAgentBridge
**Location:** `src/agents/CopilotAgentBridge.ts`

Wraps GitHub Copilot CLI as a persistent process:
- Spawns `gh copilot suggest` with conversation context
- Implements safety controls:
  - Iteration limits (default: 50)
  - Time limits (default: 30 minutes)
  - Denied actions (rm, git push, npm publish, etc.)
- Event emission for monitoring
- Checks Copilot CLI availability

**Process Management:**
```typescript
// Spawns: gh copilot suggest <prompt> --format json --model claude-sonnet-4.5
const response = await bridge.prompt(message, conversationHistory);
```

### 3. AgentRunner
**Location:** `src/agents/AgentRunner.ts`

Orchestrates agent execution:
- Main execution loop with action approval workflow
- Coordinates between LLMClient, Orchestrator, and CaseStore
- Handles four action types:
  - `answer-question` - Answer diagnostic questions
  - `test-hypothesis` - Update hypothesis status with evidence
  - `request-evidence` - Ask for additional files
  - `transition-state` - Move case through state machine
- Displays metrics and progress

**Approval Workflow:**
- **Low Impact** (auto-approved): answer-question, test-hypothesis
- **Medium Impact** (requires approval): request-evidence
- **High Impact** (requires approval): transition-state
- Override with `--autoApprove` for fully autonomous mode

### 4. Enhanced LLMClient
**Location:** `src/llm/LLMClient.ts`

Added streaming and conversation support:
- **consultStream()** - Async generator for real-time responses
- **consultWithHistory()** - Chat with conversation context
- **buildAgentPrompt()** - Creates prompts from session state
- OpenAI streaming API integration

## Agent Personality System

Each agent derives its personality from the `IssueTemplate`:

### Template → Personality Mapping

```typescript
{
  specialization: template.name + template.classification,
  domainKnowledge: template.keywords + template.errorPatterns,
  investigationPlan: template.questions,
  workingTheories: template.initialHypotheses,
  communicationStyle: template.description
}
```

### System Prompt Example

```
You are an expert troubleshooting agent specialized in: Azure Deployment Failed

Your role is to systematically investigate issues by:
1. Analyzing evidence to answer diagnostic questions
2. Testing hypotheses against available evidence
3. Proposing state transitions when validation gates are met
4. Generating new questions or hypotheses as needed

DOMAIN EXPERTISE:
deployment, azure, arm, bicep, error, failed

INVESTIGATION PLAN:
You must answer these 6 diagnostic questions:
1. [q1] What is the exact deployment error code and message? (REQUIRED)
2. [q2] Which Azure resource type was being deployed? (REQUIRED)
...

WORKING THEORIES:
1. Insufficient permissions or missing role assignments
2. Resource quota exceeded in subscription
3. Template syntax error or invalid parameter values
...

CURRENT CASE STATE: Intake

Your responses should be in JSON format:
{
  "thought": "Your reasoning process",
  "action": {
    "type": "answer-question" | "test-hypothesis" | "request-evidence" | "transition-state",
    "payload": { ... }
  },
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "evidenceRefs": ["evidence-id-1", "evidence-id-2"]
}
```

## CLI Commands

### Create Agent Session
```bash
piper agent-start <caseId> [options]

Options:
  --autoApprove       Automatically approve all actions [default: false]
  --maxIterations     Maximum iterations [default: 50]
  --maxDuration       Maximum duration in minutes [default: 30]

Example:
piper agent-start a525126d --maxIterations 100 --maxDuration 60
```

### Run Agent
```bash
# Interactive mode (manual approval for high-impact actions)
piper agent-run <sessionId>

# Autonomous mode (auto-approve all actions)
piper agent-run <sessionId> --autoApprove

Example:
piper agent-run 32b006c1-0992-4c22-bcb6-3f0730f09278
```

### Control Agent
```bash
# Pause running agent
piper agent-pause <sessionId>

# Resume paused agent
piper agent-resume <sessionId> [--autoApprove]

# Terminate agent (stop permanently)
piper agent-terminate <sessionId>
```

### Monitor Agents
```bash
piper agent-status

Output:
📊 Active Agent Sessions (1):

32b006c1-0992-4c22-bcb6-3f0730f09278
  Case: a525126d
  Status: active
  Profile: generic
  Iterations: 0/20
  Duration: 0m
  Questions Answered: 0
  State: Intake
```

## Agent Actions

### 1. Answer Question
Analyzes evidence to answer diagnostic questions.

**Agent Output:**
```json
{
  "thought": "Examining deployment logs for error codes...",
  "action": {
    "type": "answer-question",
    "payload": {
      "questionId": "q1",
      "answer": "DeploymentFailed: Resource quota exceeded",
      "confidence": "HIGH",
      "evidenceRefs": ["evidence-1", "evidence-2"]
    }
  }
}
```

**Effect:** Updates question status to "Answered" with provided answer.

### 2. Test Hypothesis
Validates or disproves hypotheses using evidence.

**Agent Output:**
```json
{
  "thought": "Evidence shows 'QuotaExceeded' error, validating quota hypothesis...",
  "action": {
    "type": "test-hypothesis",
    "payload": {
      "hypothesisId": "h2",
      "status": "Validated",
      "evidenceRefs": ["evidence-1"]
    }
  }
}
```

**Effect:** Updates hypothesis status and evidence references.

### 3. Request Evidence
Identifies missing information needed for investigation.

**Agent Output:**
```json
{
  "thought": "Need subscription quota details to confirm...",
  "action": {
    "type": "request-evidence",
    "payload": {
      "description": "Azure subscription quota limits for the region",
      "evidenceType": "api-response"
    }
  }
}
```

**Effect:** Logs request (requires manual upload with `piper add-evidence`).

### 4. Transition State
Progresses case when validation gates are met.

**Agent Output:**
```json
{
  "thought": "All required questions answered, ready to normalize...",
  "action": {
    "type": "transition-state",
    "payload": {
      "targetState": "Normalize"
    }
  }
}
```

**Effect:** Calls orchestrator to validate and execute state transition.

## Safety Controls

### Iteration Limits
Prevents infinite loops by limiting action count:
```typescript
config: {
  maxIterations: 50  // Default, configurable via CLI
}
```

### Time Limits
Prevents runaway execution with duration caps:
```typescript
config: {
  maxDuration: 30 * 60000  // 30 minutes default
}
```

### Denied Actions
Blocks dangerous operations:
```typescript
deniedActions: [
  'shell(rm *)',
  'shell(git push)',
  'shell(npm publish)',
  'file_delete_recursive'
]
```

### Approval Workflow
High-impact actions require user confirmation unless `--autoApprove` is set:
- State transitions
- Evidence requests
- External API calls

## Session Storage

Sessions are persisted in `cases/.sessions/<sessionId>.json`:

```json
{
  "id": "32b006c1-0992-4c22-bcb6-3f0730f09278",
  "caseId": "a525126d",
  "profile": "generic",
  "status": "active",
  "state": "thinking",
  "currentCaseState": "Intake",
  "personality": {
    "specialization": "Azure Deployment Failed",
    "domainKnowledge": ["deployment", "azure", "arm"],
    "investigationPlan": [...],
    "workingTheories": [...]
  },
  "context": {
    "evidence": [...],
    "answeredQuestions": [...],
    "hypotheses": [...],
    "conversationHistory": [
      {
        "role": "system",
        "content": "You are an expert troubleshooting agent...",
        "timestamp": "2026-01-06T17:59:00Z"
      }
    ]
  },
  "config": {
    "maxIterations": 20,
    "maxDuration": 600000,
    "autoApprove": false,
    "deniedActions": [...]
  },
  "metrics": {
    "iterations": 0,
    "startTime": "2026-01-06T17:59:00Z",
    "questionsAnswered": 0,
    "hypothesesTested": 0,
    "stateTransitions": 0,
    "errorsEncountered": 0
  }
}
```

## Complete Workflow Example

```bash
# 1. Ingest evidence (creates case with template matching)
piper ingest "Deployment failed with quota error" logs.zip
# Output: Case ID: a525126d

# 2. Create persistent agent
piper agent-start a525126d --maxIterations 100
# Output: Agent session created: 32b006c1-...

# 3. Run agent interactively
piper agent-run 32b006c1-0992-4c22-bcb6-3f0730f09278

# Agent output:
🤖 Starting agent session: 32b006c1-...
Case: a525126d
Profile: generic
Specialization: Azure Deployment Failed

[Iteration 1/100]

💭 Agent: Analyzing deployment logs to identify error code and resource type...

🎯 Proposed Action:
   Type: answer-question
   Answer question q1: DeploymentFailed - QuotaExceeded for VM cores
   Impact: LOW

Approve this action? [y/N] y
⚡ Executing action...
   ✓ Answered question q1
     Answer: DeploymentFailed - QuotaExceeded for VM cores
     Confidence: HIGH

[Iteration 2/100]
...

✅ Agent session completed

📊 Session Metrics:
   Iterations: 15
   Duration: 3m 45s
   Questions Answered: 6
   Hypotheses Tested: 2
   State Transitions: 1
   Errors: 0

# 4. Check final case state
piper show a525126d
```

## Requirements

### GitHub Copilot CLI
```bash
# Install GitHub CLI
gh --version

# Install Copilot extension
gh extension install github/gh-copilot

# Verify
gh copilot --version
```

### Alternative: OpenAI API
If GitHub Copilot CLI is not available, configure OpenAI:

```bash
# .env
LLM_ENABLED=true
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

## Future Enhancements

1. **Multi-Agent Coordination** - Multiple agents working on different aspects
2. **Agent Memory** - Long-term memory beyond conversation history
3. **Tool Calling** - Allow agents to invoke external APIs and scripts
4. **Human-in-Loop Notifications** - Slack/Teams alerts for critical decisions
5. **Agent Templates** - Pre-configured agent behaviors for common scenarios
6. **Learning from Past Cases** - Agent improves based on historical resolutions

## References

- Inspired by: https://github.com/tdevere/copilot-cli (auto-approval wrapper)
- Architecture patterns: Auto-GPT, LangChain agents
- Safety controls: OpenAI safety best practices
