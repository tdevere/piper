# Piper - Systematic Troubleshooting CLI

A systematic troubleshooting tool with AI-powered persistent agents for evidence-based investigation of deployment failures, pipeline issues, and infrastructure problems.

## Features

### 🎯 Systematic Investigation
- **Template-based workflows** - Pre-defined investigation paths for common issues
- **Evidence management** - Automated log ingestion with PII redaction
- **State machine** - Deterministic progression with validation gates
- **Strict mode** - Enforces question answering before state transitions

### 🤖 Persistent AI Agents
- **Autonomous investigation** - Agents work through diagnostic questions systematically
- **Template-derived personality** - Domain expertise from issue templates
- **Safety controls** - Iteration limits, time limits, action approval
- **Conversation persistence** - Resume investigations across sessions

### 📦 Evidence Processing
- **ZIP extraction** - Automatic extraction to staging area
- **🔒 PII redaction** - Automatic detection and removal of sensitive data
  - Emails, IPs, API keys, tokens, connection strings
  - Azure/AWS/GitHub credentials protected
  - Pre-redaction before AI analysis
- **Template matching** - Auto-identifies issue types from logs
- **Multi-file analysis** - Processes entire log collections

### 💡 Interactive User Guidance
- **Help system** - Type `help` to see verification steps for any question
- **Examples** - Type `example` to see sample answers
- **Evidence verification** - "Trust but verify" with file-backed answers
- **Retry-friendly** - Clear error messages with guidance on how to fix

### ✅ Validation & Control
- **Required questions** - Gates progression until critical info gathered
- **Hypothesis tracking** - Evidence-based validation
- **Event sourcing** - Complete audit trail
- **Backup system** - Safe case deletion with restore capability

## Quick Start

### Installation
```bash
npm install
npm run build
npm link  # Makes 'piper' globally available
```

### Basic Usage
```bash
# Create a case
piper new "Deployment failed in production"

# Ingest evidence from logs
piper ingest "Azure deployment failed" ./logs.zip

# Show case details
piper show <case-id>

# Analyze evidence and suggest answers
piper analyze <case-id>

# Answer questions
piper answer <case-id> q1 "DeploymentFailed error"

# Progress case through states
piper next <case-id>
```

## 🔒 PII Protection & Security

**Automatic PII Redaction** - All evidence is automatically scanned and redacted before storage or AI analysis.

### What Gets Protected?
- ✅ Email addresses → `[REDACTED-EMAIL]`
- ✅ IP addresses → `[REDACTED-IP]`
- ✅ API keys & tokens → `[REDACTED-TOKEN]`
- ✅ Azure/AWS credentials → `[REDACTED]`
- ✅ Connection strings → Fully redacted
- ✅ Private keys → `[REDACTED-PRIVATE-KEY]`

### Example
```bash
$ piper add-evidence abc123 deployment.log

Added evidence xyz789 (WARNING: PII Detected and Redacted)

# Original content:
# User: john@company.com, Key: abc123def456

# Stored content:
# User: [REDACTED-EMAIL], Key: [REDACTED-API-KEY]
```

**AI Safety:** All evidence is pre-redacted before being sent to OpenAI, GitHub Copilot, or Azure OpenAI.

📖 **Full documentation:** [docs/PII-PROTECTION.md](docs/PII-PROTECTION.md) | [PII-USER-GUIDE.md](PII-USER-GUIDE.md)

## 💡 Interactive User Guidance

**Never stuck on a question** - Built-in help system guides you through verification.

### Available Commands During Q&A

| Command | What It Does |
|---------|-------------|
| `help` or `?` | Shows step-by-step verification instructions |
| `example` | Shows sample answers |
| `<file-path>` | Ingests evidence file (with PII redaction) |
| `<text-answer>` | Provides text response |
| `Enter` (blank) | Skips question |

### Example Session
```bash
$ piper analyze abc123

Q: Have you verified the Service Connection is authorized?
   [q2] REQUIRED
   ⚠️  Evidence required - "trust but verify"
   Answer: help

   📚 HOW TO VERIFY:
   1. Navigate to Azure DevOps → Project Settings
   2. Click 'Service Connections'
   3. Check 'Security' tab for authorization
   4. Take screenshot showing status
   
   📁 EVIDENCE REQUIRED:
   - Provide file path to screenshot or log

   Answer: ./screenshots/service-connection.png
   
   ✓ Evidence captured: service-connection.png
   ⚠️  PII detected and redacted
   ✓ Answer linked to evidence
```

📖 **Full documentation:** [SUMMARY.md](SUMMARY.md) | [demo-interactive-help.md](demo-interactive-help.md)

## Persistent Agent System

### Setup
```bash
# Install GitHub Copilot CLI
gh extension install github/gh-copilot

# Or configure OpenAI
echo "LLM_ENABLED=true" >> .env
echo "LLM_PROVIDER=openai" >> .env
echo "OPENAI_API_KEY=sk-your-key" >> .env
```

### Agent Commands
```bash
# Create agent session
piper agent-start <case-id> [--maxIterations 50] [--maxDuration 30]

# Run agent interactively (approve each action)
piper agent-run <session-id>

# Run agent autonomously (auto-approve all)
piper agent-run <session-id> --autoApprove

# Monitor active agents
piper agent-status

# Control agents
piper agent-pause <session-id>
piper agent-resume <session-id>
piper agent-terminate <session-id>
```

### Agent Workflow Example
```bash
# 1. Ingest evidence
piper ingest "Deployment failed with quota error" logs.zip
# → Case ID: a525126d

# 2. Start agent
piper agent-start a525126d --maxIterations 100
# → Session: 32b006c1-...

# 3. Run agent
piper agent-run 32b006c1-... --autoApprove

# Agent autonomously:
# - Analyzes evidence
# - Answers diagnostic questions
# - Tests hypotheses
# - Progresses case state
# - Tracks metrics

# 4. Check results
piper show a525126d
```

## Commands Reference

### Case Management
```bash
piper new <title>                    # Create new case
piper show <id>                      # Display case details
piper list [--state <state>]         # List cases
piper clear                          # Delete all cases (with backup)
```

### Evidence
```bash
piper ingest <problem> <zipPath>     # Ingest logs from ZIP
piper add-evidence <id> <filePath>   # Add evidence file
```

### Investigation
```bash
piper analyze <id>                   # AI-powered question answering
piper answer <id> <qid> <answer>     # Answer question manually
piper next <id>                      # Progress to next state
piper resume <id>                    # Resume after external wait
```

### Agent Operations
```bash
piper agent-start <caseId>           # Create agent session
piper agent-run <sessionId>          # Run agent
piper agent-status                   # List active agents
piper agent-pause <sessionId>        # Pause agent
piper agent-resume <sessionId>       # Resume agent
piper agent-terminate <sessionId>    # Stop agent permanently
```

## Case States

```
Intake → Normalize → Classify → Plan → Execute → Evaluate → Resolve → Postmortem
                                  ↓
                            PendingExternal
```

- **Intake**: Initial data gathering, answer diagnostic questions
- **Normalize**: Structure information, validate completeness
- **Classify**: Categorize issue type
- **Plan**: Define remediation approach
- **Execute**: Perform fix/mitigation
- **PendingExternal**: Waiting for external input
- **Evaluate**: Verify resolution
- **Resolve**: Mark case complete
- **Postmortem**: Document learnings

## Templates

Templates define investigation workflows for specific issue types:

```json
{
  "id": "deployment-failed",
  "name": "Azure Deployment Failed",
  "keywords": ["deployment", "azure", "failed"],
  "errorPatterns": ["DeploymentFailed", "QuotaExceeded"],
  "questions": [
    {
      "id": "q1",
      "ask": "What is the exact deployment error code?",
      "required": true,
      "expectedFormat": "text"
    }
  ],
  "initialHypotheses": [
    {
      "id": "h1",
      "description": "Insufficient permissions or missing role assignments"
    }
  ]
}
```

Templates are stored in `templates/` directory.

## Agent Personality

Agents derive their behavior from templates:
- **Specialization**: From template name and classification
- **Domain Knowledge**: From keywords and error patterns
- **Investigation Plan**: From diagnostic questions
- **Working Theories**: From initial hypotheses

Example system prompt:
```
You are an expert troubleshooting agent specialized in: Azure Deployment Failed

DOMAIN EXPERTISE: deployment, azure, arm, bicep, error

INVESTIGATION PLAN:
1. [q1] What is the exact deployment error code? (REQUIRED)
2. [q2] Which Azure resource type was being deployed?
...

WORKING THEORIES:
1. Insufficient permissions
2. Resource quota exceeded
3. Template syntax error
...
```

## Safety Controls

### Agent Limits
- **Max Iterations**: 50 (configurable)
- **Max Duration**: 30 minutes (configurable)
- **Denied Actions**: rm, git push, npm publish, etc.

### Approval Workflow
| Action | Impact | Requires Approval? |
|--------|--------|--------------------|
| answer-question | Low | No |
| test-hypothesis | Low | No |
| request-evidence | Medium | Yes |
| transition-state | High | Yes |

Override with `--autoApprove` for fully autonomous mode.

## Directory Structure

```
.
├── cases/                      # Case storage
│   ├── {case-id}/
│   │   ├── case.json          # Case data
│   │   └── artifacts/         # Evidence files
│   └── .sessions/             # Agent sessions
│       └── {session-id}.json
├── templates/                  # Issue templates
│   └── deployment-failed.json
├── docs/                       # Documentation
│   ├── AGENT_ARCHITECTURE.md
│   └── AGENT_QUICK_REFERENCE.md
├── src/
│   ├── agents/                # Agent system
│   │   ├── AgentSessionManager.ts
│   │   ├── CopilotAgentBridge.ts
│   │   └── AgentRunner.ts
│   ├── orchestration/         # State machine
│   ├── evidence/              # Evidence processing
│   ├── llm/                   # AI integration
│   └── cli.ts                 # CLI commands
└── .env                        # Configuration
```

## Configuration (.env)

```bash
# LLM Configuration
LLM_ENABLED=true
LLM_PROVIDER=copilot-cli  # or 'openai' or 'azure'
OPENAI_API_KEY=sk-...

# Agent Configuration (optional)
AGENT_MAX_ITERATIONS=50
AGENT_MAX_DURATION=1800000  # 30 minutes in ms
```

## Documentation

- [Agent Architecture](docs/AGENT_ARCHITECTURE.md) - Detailed system design
- [Agent Quick Reference](docs/AGENT_QUICK_REFERENCE.md) - Common commands and workflows
- [Specialist Profiles](agents/) - Domain-specific agent configurations

## Examples

### Full Investigation Workflow
```bash
# 1. Ingest logs
piper ingest "APIM deployment failed with quota error" ~/Downloads/logs_43.zip
# Matched template: Azure Deployment Failed (v1.0.0)
# Case ID: a525126d

# 2. Create autonomous agent
piper agent-start a525126d --maxIterations 100 --autoApprove

# 3. Monitor progress
piper agent-status

# 4. View results
piper show a525126d

# Output shows:
# - 6/6 questions answered
# - 2 hypotheses validated
# - State: Classify
# - Agent completed in 5m 30s
```

### Interactive Agent with Manual Oversight
```bash
piper agent-start abc123
piper agent-run xyz789

# Agent proposes action:
🎯 Proposed Action:
   Type: transition-state
   Transition to state: Normalize
   Impact: HIGH

Approve this action? [y/N] y
✓ Action completed
```

## Requirements

- Node.js 18+
- npm or yarn
- GitHub CLI (for agent system)
- GitHub Copilot CLI extension (optional)

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Type check
npm run typecheck

# Link locally
npm link
```

## License

MIT

## Contributing

1. Fork the repository
2. Create feature branch
3. Implement changes
4. Add tests
5. Submit pull request

## Roadmap

- [ ] Multi-agent coordination
- [ ] Agent learning from past cases
- [ ] Web UI for case visualization
- [ ] Integration with ticketing systems (Jira, Azure DevOps)
- [ ] Custom tool calling for agents
- [ ] Agent templates marketplace
