# Evidence-First Troubleshooting Workflow

## Problem Solved

**Before:** AI analyzed evidence in `piper scope` and understood the problem, but then asked users to manually answer questions about information already in the logs.

**After:** System automatically extracts answers from existing evidence FIRST, only asking users for information not found in uploaded files.

---

## New Workflow: 3-Step Analysis

### Step 1: Triage Evidence (Optional but Recommended)

After ingesting evidence, help the AI focus on the most relevant files:

```bash
piper triage <case-id>
```

**What it does:**
- Lists all evidence files with current priorities
- Asks which files are HIGH priority (contain key errors/configs)
- Asks which files are LOW priority (tangential information)
- Updates metadata so AI focuses on important files first

**Example:**
```
📋 EVIDENCE TRIAGE: deployment failed in production

1. pipeline-logs.txt
   Tags: log | Size: 45KB | Priority: normal
   ID: abc123

2. service-connection-screenshot.png
   Tags: screenshot | Size: 120KB | Priority: normal
   ID: def456

3. readme.md
   Tags: documentation | Size: 5KB | Priority: normal
   ID: ghi789

Enter numbers of HIGH priority files (comma-separated): 1,2
Enter numbers of LOW priority files (comma-separated): 3

✅ Evidence priorities updated

Next steps:
  • Search evidence: piper search abc123 "error"
  • Define scope: piper scope abc123
```

---

### Step 2: Search Evidence (Optional)

Before analysis, search through redacted evidence to understand what's available:

```bash
piper search <case-id> "error"
piper search <case-id> "401"
piper search <case-id> "subscription"
```

**What it does:**
- Searches ALL evidence files (already redacted)
- Shows matches with line numbers
- Displays up to 5 matches per file
- Helps you understand what information exists

**Example:**
```
🔍 Searching evidence for: "401"

📄 pipeline-logs.txt (3 matches)
   Evidence ID: abc123
   Line 145: ##[error]StatusCode=401, Unauthorized access to Azure Resource
   Line 156: Response: 401 Client Error: Unauthorized for url: https://...
   Line 203: Service connection returned 401 - check credentials

✅ Found matches in 1 file(s)
```

**Use cases:**
- Verify specific errors are in logs before analysis
- Find which file contains configuration details
- Confirm subscription IDs or resource names (redacted) are present

---

### Step 3: Analyze with Auto-Extraction

Run analysis with automatic answer extraction from evidence:

```bash
piper analyze <case-id>
```

**New 2-Phase Process:**

#### Phase 1: Auto-Extract from Evidence (NEW!)

System automatically searches evidence for answers:

```
🔍 Step 1: Extracting answers from existing evidence...

✅ Auto-extracted 3 answer(s) from evidence

📋 Q: What is the exact deployment error code and message?
   [q1] HIGH confidence
   Answer: [From Evidence] 401 Unauthorized - Service connection authentication failed
   Found in: 2 file(s)

   ✅ Auto-applied (high confidence)

📋 Q: Which Azure resource type was being deployed?
   [q2] MEDIUM confidence
   Answer: [From Evidence] Microsoft.Web/sites (Azure App Service)
   Found in: 1 file(s)

   Apply this answer? [Y/n/edit]: y
   ✅ Applied

📋 Q: What is the subscription ID?
   [q3] HIGH confidence
   Answer: [From Evidence] [REDACTED-GUID] (automatically redacted for security)
   Found in: 2 file(s)

   ✅ Auto-applied (high confidence)
```

**Confidence Levels:**
- **HIGH**: Evidence clearly contains the answer → Auto-applied
- **MEDIUM**: Evidence partially answers → Ask for confirmation
- **LOW**: Uncertain answer → Ask for confirmation or edit

**User Options:**
- Press Enter or `y` → Accept extracted answer
- Type `n` → Skip, will ask later
- Type `edit` → Modify the extracted answer before applying

#### Phase 2: AI-Powered Suggestions

For questions NOT answered by evidence, AI suggests possibilities:

```
🤖 Step 2: AI-powered answer suggestions...

💡 SUGGESTION [q4]: "Have you checked service connection expiration?"
   HIGH confidence suggestion based on 401 error pattern
   
   1) Yes, checked - connection is valid [HIGH]
   2) Yes, connection expired (needs renewal) [MEDIUM]
   3) Have not checked yet [LOW]
   4) Other (enter custom answer)
   5) Skip

   Select option [1-5]:
```

#### Phase 3: Manual Evidence Collection

For questions with no evidence and no AI suggestion:

```
╔══════════════════════════════════════════════════════════════════
║ EVIDENCE REQUEST [q5] ★ REQUIRED
╚══════════════════════════════════════════════════════════════════

Have you verified IAM role assignments in Azure Portal?

📚 HOW TO COLLECT THIS EVIDENCE:
═══════════════════════════════════════

   EXACT STEPS:
   1. Open Azure Portal
   2. Navigate to the resource or subscription
   3. Click "Access control (IAM)"
   4. Click "Check access"
   5. Search for the service principal or user
   6. Screenshot the role assignments

💡 EXAMPLES OF ACCEPTABLE EVIDENCE:
   1. Screenshot showing IAM role assignments
   2. Export of role assignments (JSON)

📁 REQUIRED: Provide evidence file path
   • Screenshot (PNG, JPG)
   • Log file (TXT, LOG)
   • Configuration export (JSON, YAML, XML)
   • Or type "skip" to continue without evidence

   📎 Evidence file path (or "skip"): C:\screenshots\iam-roles.png

   ✅ Evidence captured: iam-roles.png
   🔒 Sensitive data automatically redacted
   Evidence ID: xyz789
```

---

## Complete Example Session

```bash
# 1. Ingest evidence
piper ingest "deployment failed with 401" logs.zip --context azure
# Created case: a10b4869

# 2. Triage files (focus AI on important files)
piper triage a10b4869
# Mark pipeline-logs.txt and error-details.txt as HIGH priority

# 3. Search to verify content
piper search a10b4869 "401"
# Confirms: 401 errors found in pipeline-logs.txt, line 145

piper search a10b4869 "subscription"
# Confirms: Subscription ID ([REDACTED-GUID]) in multiple files

# 4. Define scope (AI analyzes evidence)
piper scope a10b4869
# AI: "401 Unauthorized error in Azure deployment via Service Connection"
# User confirms scope

# 5. Auto-analyze (NEW WORKFLOW!)
piper analyze a10b4869

# Step 1: AUTO-EXTRACTION
# ✅ Extracted 4 answers from evidence:
#    - Error code: 401 Unauthorized (HIGH confidence, auto-applied)
#    - Resource type: Microsoft.Web/sites (MEDIUM, user confirmed)
#    - Subscription: [REDACTED-GUID] (HIGH, auto-applied)
#    - Timeline: Last 24 hours (MEDIUM, user confirmed)

# Step 2: AI SUGGESTIONS
# 💡 Suggests: Service connection likely expired (user selects option 2)

# Step 3: MANUAL COLLECTION
# 📋 Asks for: IAM role verification screenshot
# User provides: C:\evidence\iam-screenshot.png

# ✅ All questions answered
# ⚡ Auto-progressed to Plan state

# [Plan] Root cause: Service connection expired. Recommendation: Renew connection.

# 6. Resolve
piper resolve a10b4869
# Resolution: Renewed service connection, deployment succeeded
```

---

## Key Improvements

### 1. **Eliminates Redundant Questions**

**Before:**
```
Q: What is the error code?
User: "It's in the logs I already uploaded..."
```

**After:**
```
✅ Auto-extracted: 401 Unauthorized (from pipeline-logs.txt)
Auto-applied (high confidence)
```

### 2. **Guides Evidence Focus**

Use `piper triage` to mark which files matter most:
- **HIGH priority**: Error logs, configuration files
- **LOW priority**: README files, general documentation

AI analyzes high-priority files more thoroughly.

### 3. **Searchable Evidence**

Use `piper search` to:
- Verify information exists before analysis
- Find specific error codes or patterns
- Identify which files contain what

### 4. **Transparency**

Every auto-extracted answer shows:
- Source files where answer was found
- Confidence level (high/medium/low)
- Option to confirm, edit, or skip

### 5. **Progressive Collection**

Only ask for NEW evidence:
1. Try to answer from existing evidence
2. If not found, show AI suggestions
3. If no suggestions, request new evidence with guidance

---

## Command Reference

### New Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `piper triage <id>` | Prioritize evidence files | `piper triage abc123` |
| `piper search <id> <query>` | Search through evidence | `piper search abc123 "error"` |

### Enhanced Commands

| Command | What Changed | Benefit |
|---------|--------------|---------|
| `piper analyze <id>` | Now 3-phase: extract → suggest → request | Fewer redundant questions |
| `piper scope <id>` | Shows evidence summary after confirmation | Understand what AI sees |

---

## Best Practices

### 1. **Triage Immediately After Ingest**

```bash
piper ingest "problem" logs.zip
piper triage <id>  # Mark important files
piper search <id> "key error"  # Verify content
piper scope <id>  # AI analyzes focused evidence
```

### 2. **Search Before Providing Evidence**

Before uploading a new screenshot:
```bash
piper search <id> "service connection"
```

If it's already in logs, don't upload duplicate evidence.

### 3. **Trust High-Confidence Extractions**

Auto-applied high-confidence answers are based on clear evidence. If incorrect, you can:
- Add clarifying evidence
- Re-run analysis
- Manually correct with `piper answer <qid> <value>`

### 4. **Review Medium/Low Confidence**

Always review medium/low confidence extractions:
- They might need editing
- Evidence might be ambiguous
- Context might be missing

### 5. **Use Edit Mode**

When auto-extraction is close but not perfect:
```
Apply this answer? [Y/n/edit]: edit
Edit answer: [corrected version]
✅ Applied edited answer
```

---

## Troubleshooting

### "No answers extracted"

**Cause:** Evidence doesn't contain the information yet.

**Solution:**
1. Run `piper search <id> <relevant-term>` to verify
2. If not found, provide new evidence
3. Re-run `piper analyze <id>` after adding evidence

### "Extracted wrong answer"

**Cause:** Evidence is ambiguous or contains conflicting information.

**Solution:**
1. Use `edit` mode to correct the answer
2. Add clarifying evidence
3. Mark conflicting files as LOW priority with `piper triage`

### "AI asks questions I already answered"

**Cause:** Answers were extracted but with low confidence (skipped).

**Solution:**
- Re-run `piper analyze <id>`
- This time, confirm the medium/low confidence extractions
- Or use `piper answer <qid> <value>` to answer directly

---

## Summary: The Flow

```
1. piper ingest → Upload evidence
2. piper triage → Mark important files
3. piper search → Verify content exists  
4. piper scope → AI defines problem (using evidence)
5. piper analyze → AUTO-EXTRACT answers from evidence
   ├─ High confidence → Auto-applied
   ├─ Medium/low → Ask for confirmation
   └─ Not found → AI suggests OR request new evidence
6. piper resolve → Mark as fixed
```

**The Result:** Users spend less time re-typing information already in their logs, and more time on actual troubleshooting.
