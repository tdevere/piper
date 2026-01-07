# Continuous Engagement Principle

## Core Philosophy

**The system should maintain momentum and keep engaging the user until resolution is reached or blocked by external actions.**

With the `-a` (auto-analyze) flag, the user should NEVER have to run follow-up commands manually. The system maintains the conversation and only stops when:
1. User explicitly quits
2. External action required (apply a fix, restart a service, etc.)
3. Resolution achieved

## Complete Auto-Analyze Flow

```bash
piper ingest "Problem description" evidence.zip --context "domain" -a
```

### Phase 1: Problem Understanding (Interactive)
```
💬 Help us understand the problem better:
   
   📍 What specific error message or code did you see?
   → User provides error details
   
   🔍 What behavior did you observe?
   → User describes what failed
   
   ✓ What should have happened instead?
   → User explains expected behavior

✓ Problem statement captured
```

### Phase 2: Evidence Processing & Template Matching
```
📦 Extracting 21 files from evidence...
✓ Extracted to staging

🔍 Searching for matching template...
📋 Found template: Azure Deployment Failed (v1.0.0)
   Classification: Configuration
   Questions: 6
   Hypotheses: 0

   Apply this template? [Y/n]: y
   ✓ Template applied
```

### Phase 3: Scope Confirmation & Refinement
```
📋 Analyzing evidence to define problem scope...

PROBLEM SCOPE ANALYSIS

■ SUMMARY:
  ARM template deployment fails with policy scope validation error

■ KEY ERROR PATTERNS:
  ✗ ValidationError on line 17, column 10
  ✗ Policy is not allowed in the specified scope
  ...

❓ SCOPE CONFIRMATION:
   1) Confirm scope and proceed
   2) Refine scope (update problem statement)
   3) Need more evidence first

   Select option [1-3]: 1

✅ PROBLEM SCOPE CONFIRMED

📋 Confirmed Scope Statement:
   "ARM template deployment for Azure API Management fails with 
    ValidationError on quota element..."

   Would you like to:
   1) Keep this statement
   2) Edit the statement manually
   3) Regenerate with AI using your feedback

   Select option [1-3]: 1
```

### Phase 4: Template Application & Question Answering
```
🔍 Searching for specialized troubleshooting templates...

   📚 Found 2 matching template(s):
   
   1. Azure APIM Configuration
   2. Azure Deployment Failed

   Select template [1-2] or Enter for best match: [Enter]

   ✓ Applied template: "Azure APIM Configuration"

📋 INTERACTIVE QUESTION FLOW
   3 required + 2 optional questions remaining

🚀 Starting interactive question answering...

[REQUIRED] Q: Have you verified the Service Connection is authorized?
   💡 Check Project Settings > Service connections > Security
   Your answer (or "skip", "quit"): yes, verified and authorized

   ✓ Answer saved

[REQUIRED] Q: What scope level should the quota policy be applied at?
   Your answer: tenant level

   ✓ Answer saved

[OPTIONAL] Q: Have you checked the APIM policy documentation?
   Your answer: skip

   ⊘ Skipped

✅ All required questions answered!
```

### Phase 5: **NEW - Auto-Progress to Troubleshooting Plan**
```
⚡ Auto-progressing to troubleshooting plan...

⚡ Auto-progressed through analytical states to Plan

🔍 TROUBLESHOOTING PLAN GENERATED

   3 hypotheses to validate:

   1. Quota policy incorrectly applied at API level instead of tenant level
   2. Service Connection lacks necessary RBAC permissions
   3. ARM template has syntax error in policy XML

   Continue with hypothesis validation? [Y/n]: y
```

### Phase 6: **NEW - Interactive Hypothesis Validation**
```
🔬 Starting hypothesis validation...

📋 Hypothesis: Quota policy incorrectly applied at API level instead of tenant

   Status: [v]alidated, [d]isproven, [s]kip, or [q]uit: v

   ✓ Hypothesis validated
   Provide evidence/notes: Checked ARM template, quota element has scope="api"

   ✓ Evidence recorded

📋 Hypothesis: Service Connection lacks necessary RBAC permissions

   Status: [v]alidated, [d]isproven, [s]kip, or [q]uit: d

   ✗ Hypothesis disproven

📋 Hypothesis: ARM template has syntax error in policy XML

   Status: [v]alidated, [d]isproven, [s]kip, or [q]uit: s

   ⊘ Skipped

✅ 1 hypothesis validated!

⚡ Auto-progressing to execution phase...
```

### Phase 7: **NEW - Execution Guidance**
```
🔧 READY FOR EXECUTION

   Based on validated hypotheses, apply the recommended fixes:

   1. Update quota policy scope from "api" to "tenant" in ARM template
   2. Redeploy the ARM template
   3. Verify deployment succeeds

   Current state: Execute

   Run: piper next <case-id> when fixes are applied
```

## User Control Points

The user maintains control at key decision points:

| Prompt | Options | Default | Purpose |
|--------|---------|---------|---------|
| Apply template? | Y/n | Y | Confirm template match |
| Confirm scope? | 1/2/3 | 1 | Validate problem understanding |
| Keep/Edit/Regenerate? | 1/2/3 | 1 | Refine scope statement |
| Select template | 1-N/Enter | 1 | Choose specific template |
| Your answer | text/skip/quit | - | Provide information |
| Continue validation? | Y/n | Y | Start hypothesis validation |
| Hypothesis status | v/d/s/q | - | Validate/disprove/skip |

## Stopping Points

The system only stops engagement when:

### 1. User Explicitly Quits
```
   Your answer: quit
   
   Exiting interactive flow. Progress saved.
   Resume with: piper analyze <case-id>
```

### 2. External Action Required
```
🔧 READY FOR EXECUTION

   Apply the recommended fixes:
   1. Update ARM template quota scope
   2. Redeploy template
   
   Run: piper next <case-id> when fixes are applied
```

### 3. Need More Evidence
```
❓ SCOPE CONFIRMATION:
   3) Need more evidence first

   📎 Additional evidence needed
   Add evidence: piper add-evidence <id> <file>
   Then run: piper scope <id>
```

### 4. Resolution Achieved
```
✅ ISSUE RESOLVED

   The problem has been successfully resolved:
   - Quota policy scope corrected in ARM template
   - Template deployed successfully
   - No validation errors

   Case closed: <case-id>
```

## Implementation Details

### Auto-Progression Logic ([src/cli.ts](src/cli.ts#L1977-L2115))

**After all required questions answered:**
1. ✅ Auto-run `orchestrator.next()` 
2. ✅ Display troubleshooting plan
3. ✅ Prompt to continue hypothesis validation
4. ✅ Interactive hypothesis validation loop
5. ✅ Auto-progress to execution when validated
6. ✅ Provide clear next steps

**Key Methods:**
- `orchestrator.next(caseId)` - Progress state machine
- `orchestrator.analyzeEvidenceForAnswers()` - Extract answers
- `orchestrator.autoExtractAnswers()` - AI-powered extraction
- `store.appendEvent()` - Track all actions

### Continuous Engagement Flow

```
Ingest (-a flag)
    ↓
Problem Statement (interactive)
    ↓
Template Match & Confirm
    ↓
Scope Analysis & Confirmation
    ↓
Scope Refinement Options
    ↓
Template Selection
    ↓
Auto-Extract Answers
    ↓
Interactive Questions ← YOU ARE HERE
    ↓
Auto-Progress to Plan
    ↓
Interactive Hypothesis Validation
    ↓
Auto-Progress to Execution
    ↓
[STOP] Apply Fixes
    ↓
Continue on next run...
```

## Benefits

1. **Momentum**: Never breaks the flow with "Run this command"
2. **Efficiency**: One command does everything until user action needed
3. **Clarity**: Clear status at each phase, obvious next steps
4. **Control**: User can quit/skip/pause at any point
5. **Audit**: Every decision tracked in case events

## Testing

```bash
# Full auto-analyze run
piper ingest "APIM policy validation error" logs.zip --context "azure devops" -a

# What happens:
# 1. Prompts for error details (interactive)
# 2. Matches template and confirms (interactive)
# 3. Generates scope and refines (interactive)
# 4. Asks diagnostic questions (interactive)
# 5. Generates troubleshooting plan (automatic)
# 6. Validates hypotheses (interactive)
# 7. Progresses to execution (automatic)
# 8. Stops only at "apply fixes" (requires external action)
```

## Key Principle

**The system should be like a conversation with an expert troubleshooter who keeps asking questions and providing guidance until the problem is solved. It never hands you a business card and says "call me later" - it stays engaged.**
