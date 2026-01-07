# Evidence-Driven Troubleshooting Workflow

## Overview

Piper uses an **evidence-first approach** to troubleshooting. Instead of accepting "yes/no" answers about verifications, the system **always requests verifiable evidence** (screenshots, logs, configs).

## Key Principles

1. **Show, Don't Tell**: Users must provide files, not just text confirmations
2. **Guidance First**: Every question automatically displays step-by-step instructions
3. **PII Protection**: All evidence is automatically redacted before analysis
4. **Loop Until Resolution**: Continue collecting evidence until issue is resolved

---

## Workflow Stages

### 1. Ingest Evidence
```bash
piper ingest "deployment failed in production" logs.zip --context azure
```

**What happens:**
- Creates new case with unique ID
- Extracts and redacts all evidence files
- Matches appropriate troubleshooting template
- Applies diagnostic questions from template

---

### 2. Define Problem Scope
```bash
piper scope <case-id>
```

**What happens:**
- AI analyzes all evidence to define problem scope
- Shows: Summary, error patterns, affected components, timeframe
- User confirms or requests refinement
- **On confirmation:** Automatically matches specialized template and shows evidence collection plan

**Evidence Collection Plan includes:**
- Top 3 most important evidence files needed
- How-to guidance for collecting each piece
- Examples of acceptable evidence types
- Next steps after collection

---

### 3. Collect Evidence (Interactive Loop)

```bash
piper analyze <case-id>
```

**For each diagnostic question, the system:**

#### a) Shows Evidence Request
```
╔══════════════════════════════════════════════════════════════════
║ EVIDENCE REQUEST [q2] ★ REQUIRED
╚══════════════════════════════════════════════════════════════════

Have you verified the Service Connection is authorized in Project Settings?

📚 HOW TO COLLECT THIS EVIDENCE:
═══════════════════════════════════════

   EXACT STEPS:
   1. Open Azure DevOps portal
   2. Navigate: Project Settings (bottom left) > Service connections
   3. Select your Azure subscription connection
   4. Click "Security" tab
   5. Verify your pipeline is listed under "Pipeline permissions"
   6. Take screenshot showing the Security tab

   DOCS: https://learn.microsoft.com/azure/devops/pipelines/library/service-endpoints

💡 EXAMPLES OF ACCEPTABLE EVIDENCE:
   1. Screenshot showing Security tab with pipeline permissions
   2. Screenshot of service connection configuration
   3. Export of service connection settings (if available)

📁 REQUIRED: Provide evidence file path
   • Screenshot (PNG, JPG)
   • Log file (TXT, LOG)
   • Configuration export (JSON, YAML, XML)
   • Or type "skip" to continue without evidence
```

#### b) User Provides Evidence
```
   📎 Evidence file path (or "skip"): C:\screenshots\service-connection-security.png

   ✅ Evidence captured: service-connection-security.png
   🔒 Sensitive data automatically redacted
   Evidence ID: abc123def
```

#### c) Required Questions Have Protection
If user tries to skip a REQUIRED question:
```
   ⚠️  This is a REQUIRED question
   Skipping will limit diagnostic accuracy
   Are you sure you want to skip? [y/N]:
```

---

### 4. Check Progress
```bash
piper status <case-id>
```

**Shows:**
- Scope confirmation status
- Evidence count (X files, Y redacted)
- Question progress (X/Y answered)
- Next 3 required questions
- Evidence needs with guidance
- Clear next steps

**Example output:**
```
📊 TROUBLESHOOTING PROGRESS

✅ Scope confirmed (v1)
📁 Evidence: 8 files collected (5 redacted)
❓ Questions: 3/6 answered

🎯 NEXT REQUIRED QUESTIONS:

1. [q4] Check IAM role assignments
   Evidence needed: Azure Portal IAM screenshot

2. [q5] Verify resource provider registration  
   Evidence needed: Subscription resource providers list

3. [q6] Check deployment history
   Evidence needed: Deployment logs from Azure portal

💡 NEXT STEPS:
1. Collect evidence listed above
2. Run: piper analyze dfadff64
3. Continue until all questions answered
```

---

### 5. Resolution
```bash
piper resolve <case-id>
```

**Prompts for:**
- Resolution summary (required)
- Root cause (optional)

**Shows:**
- Case statistics (questions answered, evidence collected, timeline events)
- Final problem scope
- Suggested next steps

---

## Evidence Guidelines

### What Makes Good Evidence?

✅ **DO:**
- Screenshots showing configuration screens
- Logs with timestamps and error messages
- Configuration exports (JSON, YAML, XML)
- Portal views showing permissions/settings
- Build/deployment history exports

❌ **DON'T:**
- Text descriptions ("I checked and it looks fine")
- Yes/No answers without proof
- Promises to check later
- Verbal confirmations

### Evidence Requirements by Question Type

| Question Type | Required Evidence | Examples |
|--------------|-------------------|----------|
| Permission Verification | IAM/Security screenshots | Azure Portal IAM, ADO Security tab |
| Configuration Check | Config files or exports | JSON, YAML, ARM templates |
| Log Analysis | Log files with errors | Pipeline logs, application logs |
| Resource State | Portal screenshots | Resource overview, deployment history |

---

## PII Protection

**All evidence is automatically redacted before AI analysis:**

### Redacted Items
- Bearer tokens and API keys
- Subscription IDs (GUID format)
- Resource group names (`rg-*`)
- Storage account names (`*storageaccount`, `*.blob.core.windows.net`)
- Windows usernames (`ME-*`, `CN=*`)
- Service principal names
- Build IDs and artifact names
- Machine/agent names

### Example
```
Before: rg-production-eastus2-001 (fcfa67ae-efeb-417c-a966-48b4937d2918)
After:  [REDACTED-RESOURCE-GROUP] ([REDACTED-GUID])
```

---

## Best Practices

### 1. **Follow the Guidance**
Every question includes step-by-step instructions. Follow them precisely.

### 2. **Collect Evidence Immediately**
Don't skip questions to "check later" - collect evidence when asked.

### 3. **Use Screenshots Liberally**
When in doubt, take a screenshot. Better to have too much evidence than too little.

### 4. **Name Files Descriptively**
```
✅ Good: service-connection-security-tab.png
✅ Good: iam-role-assignments-2026-01-07.png
❌ Bad: screenshot1.png
❌ Bad: image.png
```

### 5. **Check Status Regularly**
Use `piper status <id>` to see what's next and track progress.

### 6. **Don't Skip Required Questions**
Required questions are essential for accurate diagnosis. Skipping them reduces diagnostic quality.

---

## Example End-to-End Session

```bash
# 1. Start new case
piper ingest "ARM deployment failed 401 unauthorized" logs.zip --context azure
# Output: Created case dfadff64

# 2. Define scope (AI analyzes logs)
piper scope dfadff64
# Output: Shows scope analysis, matches "deployment-failed" template
# Output: Shows top 3 evidence needs

# 3. Start evidence collection
piper analyze dfadff64

# System shows: EVIDENCE REQUEST [q1] ★ REQUIRED
# "Have you checked the deployment error in Azure Portal?"
# Shows: Step-by-step instructions, examples, guidance
📎 Evidence file path: C:\evidence\portal-deployment-error.png
# ✅ Evidence captured

# System shows: EVIDENCE REQUEST [q2] ★ REQUIRED  
# "Have you verified Service Connection permissions?"
# Shows: How to navigate to Service Connections, what to screenshot
📎 Evidence file path: C:\evidence\service-connection-perms.png
# ✅ Evidence captured

# ... continues for remaining questions ...

# 4. Check progress
piper status dfadff64
# Shows: 6/6 questions answered, analyzing...

# 5. System auto-progresses through states
# Normalize → Classify → Plan

# 6. Displays recommended actions
# Shows: Root cause analysis, suggested fixes

# 7. Mark as resolved
piper resolve dfadff64
Resolution: Updated service connection to use correct subscription
Root cause: Service connection was pointing to wrong Azure subscription
# ✅ Case marked as resolved
```

---

## Troubleshooting the Troubleshooter

### "I don't have the evidence yet"
- Type `skip` to continue
- Come back later with: `piper add-evidence <case-id> <file-path>`
- Resume with: `piper analyze <case-id>`

### "The system keeps asking for evidence"
- That's the design! Every verification requires proof
- Use screenshots, logs, or config exports
- This ensures diagnostic accuracy

### "I provided evidence but it still asks"
- Check that file path is correct and file exists
- Ensure file is readable (not corrupted or locked)
- Try absolute paths instead of relative paths

### "How do I know what evidence is needed?"
- Run: `piper status <case-id>`
- Shows next required questions with evidence guidance
- Each question includes step-by-step collection instructions

---

## Advanced: Adding Evidence Outside Analysis

```bash
# Add evidence anytime
piper add-evidence <case-id> <file-path>

# Evidence is automatically:
# 1. Copied to case directory
# 2. Redacted for PII
# 3. Tagged with timestamp
# 4. Linked to case

# Then re-analyze
piper analyze <case-id>
```

---

## Summary: The Piper Way

1. **Evidence First**: Show, don't tell
2. **Guidance Always**: Never guess what to collect  
3. **Loop Until Done**: Keep collecting until resolved
4. **PII Protected**: Redaction is automatic
5. **Verifiable**: Every claim backed by evidence

This approach ensures **accurate diagnosis** through **verifiable information**, not assumptions.
