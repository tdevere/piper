# Enhanced Scope Confirmation Flow

## Overview

The scope confirmation workflow has been enhanced to provide a clearer, more interactive experience with automatic progression to troubleshooting.

## New Workflow (Auto-Analyze Mode)

When running `piper ingest <problem> <evidence.zip> --context <context> -a`:

### 1. Problem Statement Collection (Interactive)
```
💬 Help us understand the problem better:
   This will help match the right template and focus our analysis.

   📍 What specific error message or code did you see? (if any):
   🔍 What behavior did you observe? (what failed/broke):
   ✓ What should have happened instead?:

✓ Problem statement captured
```

**Stored in**: `case.metadata.detailedProblemStatement`

**Skip with**: `--problem-statement "detailed description"`

### 2. Template Confirmation (During Ingestion)
```
📋 Found template: Azure Deployment Failed (v1.0.0)
   Classification: Configuration
   Questions: 6
   Hypotheses: 0

   Apply this template? [Y/n]:
```

**Skip with**: `--auto-approve-template`

### 3. Evidence Analysis & Scope Generation
```
📋 Analyzing evidence to define problem scope...

   📂 Loading 5 evidence files...
   📊 Evidence content: 23 KB
   🔍 Running context-specific analysis (azure devops)...
   🤖 Preparing AI analysis prompt...

PROBLEM SCOPE ANALYSIS

■ SUMMARY:
  ValidationError in Azure DevOps policy configuration preventing deployment

■ KEY ERROR PATTERNS:
  ✗ Error in element 'quota' on line 17, column 10
  ✗ Policy is not allowed in the specified scope
  ...
```

### 4. Scope Confirmation with Options
```
❓ SCOPE CONFIRMATION:
   1) Confirm scope and proceed to diagnostic questions
   2) Refine scope (update problem statement)
   3) Need more evidence first

   Select option [1-3, default=1]: 1
```

### 5. **NEW: Clear Confirmed Scope Display**
```
✅ PROBLEM SCOPE CONFIRMED

📋 Confirmed Scope Statement:
   "ValidationError in Azure DevOps policy configuration at line 17 preventing deployment due to incorrect scope specification"

   Would you like to:
   1) Keep this statement
   2) Edit the statement manually
   3) Regenerate with AI using your feedback

   Select option [1-3, default=1]:
```

#### Option 1: Keep Statement
- Proceeds directly to template selection

#### Option 2: Edit Manually
```
   Enter updated statement: <your edited statement>

   ✓ Statement updated
```

#### Option 3: Regenerate with AI
```
   What should be different? (your feedback): Focus more on the policy scope issue

   🤖 Regenerating scope statement with your feedback...

   ✓ Regenerated scope statement:
   "Azure DevOps policy validation fails due to quota policy being applied at incorrect scope level, blocking deployment pipeline"
```

### 6. **NEW: Automatic Template Selection**
```
🔍 Searching for specialized troubleshooting templates...

   📚 Found 2 matching template(s):

   1. Azure DevOps Policy Configuration
      Classification: Configuration
      Questions: 8 | Hypotheses: 3

   2. Azure Deployment Failed
      Classification: Configuration
      Questions: 6 | Hypotheses: 0

   Select template [1-2], 0 to skip, or Enter for best match: 
```

**Auto-applies best match on Enter** or user can:
- Select 1-2: Apply specific template
- Enter 0: Skip templates (manual workflow)

```
   ✓ Applied template: "Azure DevOps Policy Configuration"
   Diagnostic questions: 8
   Hypotheses: 3
```

### 7. **Automatic Progression to Troubleshooting**
```
🔍 Step 1: Auto-extracting answers from evidence...

📋 Q: What is the exact policy that is failing?
   [q1] HIGH confidence
   Answer: quota policy at line 17
   Found in: 2 file(s)
   ✅ Auto-applied (high confidence)

✓ Applied 3 high-confidence answer(s)

🚨 REQUIRED ACTIONS TO PROCEED:
   5 REQUIRED questions must be answered:
   1. What scope level is the policy currently applied at?
   2. What scope level should the policy be applied at?
   ...

   Run: piper analyze <case-id>
```

## Key Improvements

### 1. Clear Scope Statement Display
- After confirmation, shows the exact scope statement in a highlighted box
- Gives user confidence in what was captured

### 2. Flexible Refinement Options
- **Keep**: Trust the AI-generated statement
- **Edit**: Quick manual correction
- **Regenerate**: Use AI with your feedback to improve the statement

### 3. Automatic Template Application
- No need for separate `piper scope` command
- Template selection happens immediately after scope confirmation
- Best match auto-selected on Enter for speed

### 4. Seamless Flow
- From ingestion → scope confirmation → template selection → diagnostic questions
- All in one command with `-a` flag
- User only stops at decision points

## Use Cases

### Quick Case (Trust AI)
```bash
piper ingest "Deployment failed" evidence.zip -a --auto-approve-template

# User only inputs:
# - Error message (interactive prompt)
# - Behavior (interactive prompt)  
# - Expected (interactive prompt)
# - Press Enter at scope confirmation
# - Press Enter at template selection
```

### Controlled Case (Review Everything)
```bash
piper ingest "Complex issue" evidence.zip -a

# User reviews and approves:
# - Problem statement details
# - Template selection (Y/n)
# - Scope analysis (1=confirm)
# - Scope statement refinement (1/2/3)
# - Template choice (1-3 or Enter)
```

### Non-Interactive Case (CI/CD)
```bash
piper ingest "Known issue type" evidence.zip \
  --problem-statement "Full detailed description with error codes" \
  --auto-approve-template \
  -a

# Zero prompts - fully automated
```

## Audit Trail

All decisions are tracked:

### In case.metadata:
```json
{
  "detailedProblemStatement": "Problem: ... Error/Code: ... Observed: ... Expected: ...",
  "rejectedTemplates": [
    {
      "templateId": "azure-deployment-failed",
      "templateName": "Azure Deployment Failed",
      "timestamp": "2026-01-07T...",
      "reason": "User declined during ingestion"
    }
  ],
  "scopeRefinements": [
    {
      "version": 2,
      "oldSummary": "Original AI-generated summary",
      "newSummary": "User-refined summary",
      "timestamp": "2026-01-07T...",
      "userInitiated": true
    }
  ]
}
```

### In case.events:
```
[CaseCreated] Ingested from problem: ...
[ScopeConfirmed] User confirmed problem scope
[TemplateApplied] Applied template: Azure DevOps Policy Configuration
[AnswerAutoApplied] Auto-applied 3 high-confidence answers
```

## Command Reference

### Flags

- `-a, --auto-analyze`: Enable auto-analyze mode (full workflow)
- `--problem-statement <text>`: Skip interactive problem statement prompts
- `--auto-approve-template`: Auto-apply matched template without confirmation
- `--context <domain>`: Specify analysis context (azure devops, pipelines, kubernetes, etc.)

### Example Commands

```bash
# Interactive full workflow
piper ingest "Error message" evidence.zip --context "azure devops" -a

# Non-interactive with detailed problem statement
piper ingest "Brief title" evidence.zip \
  --context pipelines \
  --problem-statement "Detailed: error AADSTS70016, WIF auth failed, expected federated credential to work" \
  --auto-approve-template \
  -a

# Manual step-by-step (no auto-analyze)
piper ingest "Issue" evidence.zip --context azure
piper scope <case-id>
piper analyze <case-id>
```

## Benefits

1. **Clarity**: Users see exactly what scope was captured
2. **Control**: Multiple refinement options (keep/edit/regenerate)
3. **Speed**: Automatic template selection and progression
4. **Audit**: Complete tracking of all decisions
5. **Flexibility**: Works in interactive, semi-interactive, and fully automated modes
