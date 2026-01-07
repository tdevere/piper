# P.I.P.E.R - **P**ipeline **I**ntelligent **P**roblem **E**xpert & **R**esolver

An intelligent troubleshooting system powered by a multi-agent AI architecture for systematic investigation of Azure DevOps pipeline failures, deployment issues, and infrastructure problems.

---

## 📋 Prerequisites & Best Experience

**For the best experience, use P.I.P.E.R within VS Code with GitHub Copilot integration:**

### Required Setup
- **VS Code** with GitHub Copilot extension installed
- **GitHub Copilot CLI** - Install via `winget install GitHub.Copilot` ([docs](https://github.com/github/copilot-cli))
- **Copilot Tool Access** - Allow GitHub Copilot to use P.I.P.E.R tools in VS Code chat
- **Authentication** - Launch `copilot`, type `/login` to authenticate, and persist credentials

### System Requirements
- **Operating System:** Windows (tested platform)
- **Runtime:** Node.js 18+ 
- **Shell:** PowerShell (required for terminal operations)
- **AI Provider:** GitHub Copilot (LLM_PROVIDER=copilot)

> ⚠️ **Note:** P.I.P.E.R is currently tested and optimized for Windows environments. Other platforms may require modifications to shell commands and path handling.

---

## 🚀 Quick Start

**See it in action:** Check out [DEMO.md](docs/DEMO.md) for a complete walkthrough with realistic examples showing PII redaction and template learning.

### Installation
```bash
npm install
npm run build
npm link  # Makes 'piper' globally available

# Setup AI capabilities (required for full functionality)
export LLM_ENABLED=true
export LLM_PROVIDER=copilot
```

---

## ✨ Features

### 🤖 Multi-Agent AI Architecture
- **7 Specialized Agents** - Each agent is an expert in one phase of troubleshooting
  - **Intake Agent:** Triages evidence files and identifies missing information
  - **Scope Agent:** Analyzes evidence to define problem scope and boundaries
  - **Classify Agent:** Determines issue category and generates diagnostic hypotheses
  - **Troubleshoot Agent:** Creates detailed remediation plans with verification steps
  - **Resolve Agent:** Validates solution effectiveness and confirms resolution
  - **Solution Agent:** Generates reusable KB articles and learns from resolved cases
  - **Lead Agent:** Validates state transitions and ensures process compliance

- **Dynamic Agent Routing** - State-driven agent selection with fallback strategies
- **Evidence-First Analysis** - AI agents work with redacted, secure evidence
- **Continuous Engagement** - Auto-progression through investigation workflow (`-a` flag)

### 🎓 Template Learning System
- **Auto-Improvement** - Creates refined templates from resolved cases
- **Effectiveness Scoring** - Evaluates template accuracy (0-100 scale)
- **Enable/Disable Control** - Manage learned templates without deletion
- **Version Tracking** - Maintains template lineage and improvements
- **Smart Matching** - Prioritizes high-confidence learned templates

### 📦 Evidence Processing
- **ZIP extraction** - Automatic extraction to staging area
- **🔒 PII redaction** - Pre-analysis detection and removal of sensitive data
  - Emails, IPs, API keys, tokens, connection strings
  - Azure/AWS/GitHub credentials protected
  - Restore capability for authorized troubleshooting
- **Multi-file analysis** - Processes entire log collections
- **Artifact tracking** - Original + redacted versions stored securely

### 🧠 Intelligent Workflows
- **Template-based investigation** - Pre-defined paths for common issues
- **Hypothesis tracking** - Evidence-based validation of theories
- **Interactive Q&A** - Diagnostic question collection with confirmation
- **State machine** - Deterministic progression: Intake → Scope → Classify → Plan → Resolve
- **Decision journal** - Complete audit trail of AI reasoning

### 💾 Persistent Storage
- **Dual Format Plans** - Both JSON metadata and markdown files
- **Scope Analysis Archive** - AI-generated summaries with confidence scores
- **Template Effectiveness Metrics** - Track which templates work best
- **Event Sourcing** - Complete case history with restore capability

---

## 🏗️ Architecture

### State Flow
```
┌─────────┐     ┌───────┐     ┌──────────┐     ┌──────┐     ┌─────────┐
│ Intake  │ --> │ Scope │ --> │ Classify │ --> │ Plan │ --> │ Resolve │
└─────────┘     └───────┘     └──────────┘     └──────┘     └─────────┘
    ↓               ↓              ↓               ↓              ↓
intake-agent   scope-agent   classify-agent  troubleshoot   solution-agent
                                                  -agent
```

### Agent System

Each agent has a specialized profile (`.profile.md`) containing:
- **System Prompt** - Domain expertise and personality
- **Response Schema** - Structured JSON output format
- **Validation Rules** - Quality checks and constraints
- **Fallback Strategy** - Pattern-based analysis if AI unavailable

**Agent Profiles Location:** `agents/stage-agents/`

### Data Model

**Case Metadata Structure:**
```typescript
{
  scopeAnalysis?: {
    timestamp: string;
    agent: 'scope-agent';
    summary: string;
    errorPatterns: string[];
    affectedComponents: string[];
    impact: string;
    confidence: number; // 0-100
  };
  
  remediationPlan?: {
    timestamp: string;
    agent: 'troubleshoot-agent';
    rootCause: string;
    steps: Array<{order, action, commands?, expectedOutcome}>;
    verificationSteps: string[];
    planMarkdown: string; // Full markdown version
  };
  
  templateEffectiveness?: {
    templateId: string;
    accuracyScore: number; // 0-100
    wasAccurate: boolean; // >= 70%
    shouldCreateLearnedTemplate: boolean;
  };
}
```

**Template Learning Scoring:**
- Classification match: 20 points
- Hypothesis validation: 30 points (validated / total)
- Question completion: 20 points
- **Threshold:** Score < 70% triggers learned template creation

---

## 📖 Usage

### Basic Commands
```bash
# Quick one-shot analysis (no interactive workflow)
piper oneshot <file|folder|zip> "Problem description"
piper oneshot logs.zip "Deploy timeout" --previous report.md -o analysis.md

# Create a new case (full interactive workflow)
piper new "Production deployment authentication failure"

# Ingest evidence with AI analysis (auto-progression)
piper ingest case.zip -a

# Manual progression (if not using -a flag)
piper next <case-id>

# Show case details
piper show <case-id>

# Answer questions manually
piper answer <case-id> q1 "Service principal exists in Azure AD"

# Mark case resolved
piper resolve <case-id> --notes "Federated credential was missing"
```

### Template Management
```bash
# List all templates
piper templates                          # List all enabled templates
piper templates --learned                # Show only learned templates
piper templates --stats                  # Show statistics

# View template details
piper templates-show <template-id>       # Show full template information

# Add/Import templates
piper templates-add <file.json>          # Import template from JSON file

# Export templates
piper templates-export <id> <file.json>  # Export template for sharing

# Enable/Disable templates
piper templates-disable <template-id>    # Soft delete (can be re-enabled)
piper templates-enable <template-id>     # Re-enable disabled template

# Permanently remove
piper templates-remove <template-id>     # Hard delete (requires confirmation)
piper templates-remove <template-id> -f  # Force delete without prompt
```

### Evidence Commands
```bash
# List evidence artifacts
piper evidence <case-id>

# Show PII redaction map
piper evidence <case-id> --show-redactions

# Restore original PII (requires confirmation)
piper evidence <case-id> --restore-pii
```

---

## 🔒 PII Protection & Security

**Automatic PII Redaction** - All evidence is scanned and redacted before storage or AI analysis.

### What Gets Protected?
- ✅ Email addresses → `████████@domain.com`
- ✅ IP addresses → `████.████.█.███`
- ✅ GUIDs/UUIDs → `████████-████-████-████-████████████`
- ✅ API keys & tokens → `[REDACTED_TOKEN]`
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

**AI Safety:** All evidence is pre-redacted before being sent to AI agents, ensuring no sensitive data leaves your environment.

📖 **Full documentation:** [PII-USER-GUIDE.md](docs/guides/PII-USER-GUIDE.md) | [docs/PII-PROTECTION.md](docs/PII-PROTECTION.md)

---

## ⚙️ Configuration

### Environment Variables

```bash
# AI Agent Configuration (required for full functionality)
export LLM_ENABLED=true               # Enable AI agents
export LLM_PROVIDER=copilot           # Use GitHub Copilot CLI

# Optional overrides
export COPILOT_PATH=/custom/path/copilot  # Custom copilot binary location
```

### Requirements

**For AI-Powered Features:**
- GitHub Copilot CLI installed: `gh extension install github/gh-copilot`
- Authenticated GitHub account with Copilot access
- `copilot` command available in PATH

**Verification:**
```bash
# Test copilot is working
copilot -p "Say hello" --allow-all-tools

# Should return a response from GitHub Copilot
```

**Fallback Mode:**
If `LLM_ENABLED=false` or copilot is unavailable, system uses pattern-based fallback:
- Classification by error pattern matching
- Basic plan generation from templates
- Resolution detection by keywords

---

## 🎓 How Template Learning Works

PipelineExpert improves automatically by learning from resolved cases:

1. **Resolution Analysis**
   - When you mark a case resolved, the solution-agent evaluates effectiveness
   - Scores template accuracy: classification (20%), hypothesis validation (30%), questions (20%)
   - Overall score: 0-100 scale

2. **Auto-Creation Decision**
   - If score < 70%: Creates improved learned template
   - If no template matched: Creates new template from case patterns
   - Enabled by default, can be disabled later

3. **Learned Template Contents**
   - Refined diagnostic questions (max 8, validated ones only)
   - Validated hypotheses (max 5, evidence-backed)
   - Error patterns extracted from evidence
   - Keywords from problem scope and classification

4. **Template Priority**
   - Learned templates with high confidence ranked higher in matching
   - Original templates remain available as fallback
   - Disabled templates excluded from matching

**Example:**
```
Case resolved: WIF authentication failure
├─ Original template: authentication-wif-v1 (score: 72%)
├─ Analysis: Classification accurate, 4/5 hypotheses validated
├─ Improvement: Added question about federated credentials
└─ Result: learned-c4a7b9d2-v1 created and enabled

Next similar case: Learned template matched first, resolved 40% faster
```

---

## 💡 Interactive User Guidance

**Never stuck on a question** - Built-in help system guides you through verification.

### Available Commands During Q&A

| Command | What It Does |
|---------|-------------|
| `help` or `?` | Shows step-by-step verification instructions |
| `example` | Shows sample answers |
| `y` / `n` | Confirms or rejects auto-extracted answer |
| `e` | Edits the suggested answer |
| `u` | Marks answer as unknown |
| `<text>` | Provides custom text response |

### Example Session
```bash
$ piper ingest case.zip -a

🤖 Consulting scope-agent...

❓ Question 1 of 4 (REQUIRED)

Does the service principal still exist in Azure AD?

Suggested answer (from evidence): "yes"

Confirm this answer? (Y/n/e=edit/u=unknown): y
   ✓ Answer recorded

Continuing workflow...
```

📖 **Full walkthrough:** [DEMO.md](docs/DEMO.md)
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
## 📚 Commands Reference

### Case Management
```bash
piper new <title>                    # Create new case
piper ingest <zipPath> -a            # Ingest evidence with auto-analysis
piper show <id>                      # Display case details
piper list [--state <state>]         # List cases
piper next <id>                      # Manually progress to next state
piper resolve <id> --notes <text>    # Mark case resolved
piper clear                          # Delete all cases (with backup)
```

### Template Management
```bash
piper templates list                 # List all templates
piper templates --stats              # Show statistics (learned, enabled, disabled)
piper templates disable <id>         # Disable a learned template
piper templates enable <id>          # Re-enable a template
```

### Evidence Commands
```bash
piper evidence <id>                  # List case evidence
piper evidence <id> --show-redactions # View PII redaction map
piper evidence <id> --restore-pii    # Restore original PII (requires auth)
piper add-evidence <id> <filePath>   # Add evidence to existing case
```

### Investigation
```bash
piper answer <id> <qid> <answer>     # Answer question manually (if not using -a)
piper resume <id>                    # Resume after external investigation
```

---

## 🗂️ Project Structure

```
PipelineExpert/
├── src/
│   ├── agents/              # Multi-agent system
│   │   ├── AgentRunner.ts   # Agent execution engine
│   │   ├── CopilotAgentBridge.ts  # Copilot CLI integration
│   │   └── types.ts         # Agent interfaces
│   ├── orchestration/       # State machine & workflow
│   │   ├── Orchestrator.ts  # Main orchestrator
│   │   ├── StateMachine.ts  # State transitions
│   │   └── IntakeParser.ts  # Evidence parsing
│   ├── evidence/            # Evidence processing
│   │   ├── EvidenceManager.ts
│   │   └── Redactor.ts      # PII redaction engine
│   ├── storage/
│   │   └── CaseStore.ts     # Persistent storage
│   ├── templates/
│   │   └── TemplateManager.ts  # Template loading & learning
│   ├── llm/
│   │   └── LLMClient.ts     # AI integration layer
│   └── cli.ts               # Command-line interface
├── agents/
│   └── stage-agents/        # Agent profiles
│       ├── intake-agent.profile.md
│       ├── scope-agent.profile.md
│       ├── classify-agent.profile.md
│       ├── troubleshoot-agent.profile.md
│       ├── resolve-agent.profile.md
│       ├── solution-agent.profile.md
│       └── lead-agent.profile.md
├── templates/
│   ├── *.json               # Standard templates
│   └── learned/             # Auto-generated learned templates
├── cases/                   # Case storage (gitignored)
│   └── {case-id}/
│       ├── case.json        # Case metadata
│       ├── artifacts/       # Evidence files (redacted)
│       ├── remediation-plan.md  # Generated plan
│       └── .redaction-map.json  # PII restore info
└── docs/
    ├── DEMO.md              # Complete walkthrough
    ├── guides/
    │   ├── PII-USER-GUIDE.md    # PII protection guide
    │   └── QUICK-REFERENCE.md   # Command cheat sheet
    └── PII-PROTECTION.md    # Technical PII details
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- redactor.test.ts
npm test -- orchestrator.test.ts

# Build and link for local testing
npm run build
npm link
```

---

## 📖 Additional Documentation

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

---

## 📖 Additional Documentation

- **[DEMO.md](docs/DEMO.md)** - Complete walkthrough with fake data showing PII redaction
- **[ONESHOT-GUIDE.md](docs/guides/ONESHOT-GUIDE.md)** - Quick analysis without full workflow
- **[PII-USER-GUIDE.md](docs/guides/PII-USER-GUIDE.md)** - PII protection and redaction details
- **[QUICK-REFERENCE.md](docs/guides/QUICK-REFERENCE.md)** - Command cheat sheet
- **[docs/AGENT_ARCHITECTURE.md](docs/AGENT_ARCHITECTURE.md)** - Multi-agent system design
- **[agents/stage-agents/](agents/stage-agents/)** - Agent profile specifications

---

## 🚦 Requirements

- **Node.js 18+**
- **npm or yarn**
- **GitHub Copilot CLI** - Required for AI features: `gh extension install github/gh-copilot`
- **GitHub account** with Copilot access

---

## 🤝 Contributing

Contributions welcome! This project uses:
- TypeScript with strict mode
- Jest for testing
- Conventional commits
- ESLint + Prettier for code quality

### Adding New Templates

Create a new JSON file in `templates/`:
```json
{
  "id": "my-template-v1",
  "version": "1.0.0",
  "name": "My Issue Type",
  "description": "Description of when to use this template",
  "keywords": ["keyword1", "keyword2"],
  "errorPatterns": ["ERROR.*pattern", "AADSTS\\d+"],
  "questions": [
    {
      "id": "q1",
      "ask": "Have you checked X?",
      "required": true
    }
  ],
  "initialHypotheses": [
    {
      "id": "h1",
      "description": "Possible cause A"
    }
  ],
  "classification": "Configuration"
}
```

### Creating Custom Agents

Agent profiles are markdown files with YAML frontmatter in `agents/stage-agents/`:
```markdown
---
name: My Custom Agent
role: specialist
domain: my-domain
stage: classify
capabilities:
  - pattern-matching
  - hypothesis-generation
---

# System Prompt

You are an expert in my-domain. Your role is to...

## Response Format

Return JSON matching this schema:
\`\`\`json
{
  "classification": "string",
  "hypotheses": [...],
  "confidence": 0-100
}
\`\`\`
```

---

## 🛠️ Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Type check
npm run typecheck

# Link locally for testing
npm link

# Run tests
npm test
```

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🛣️ Roadmap

- [x] Multi-agent architecture with specialized roles
- [x] Template learning from resolved cases
- [x] PII detection and redaction
- [x] Auto-progression workflow
- [ ] Web UI for case visualization
- [ ] Integration with ticketing systems (Jira, Azure DevOps)
- [ ] Advanced analytics and metrics dashboard
- [ ] Template marketplace and sharing
- [ ] Multi-provider AI support (Azure OpenAI, Anthropic)

---

## 🙏 Acknowledgments

- GitHub Copilot CLI for AI integration
- Azure DevOps community for troubleshooting insights
- Contributors and early adopters

---

**Questions or Issues?**
- 📖 Check [DEMO.md](docs/DEMO.md) for complete walkthrough
- 🐛 Open an issue on GitHub
- 💬 Start a discussion for feature requests

