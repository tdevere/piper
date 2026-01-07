# Interactive Question Guidance - Implementation Complete ✅

## 🎯 Problem Solved

**User Request:** *"What if they don't know? They need help on how to verify, what to test, examples..."*

**Solution:** Interactive guidance system with help commands, examples, and evidence verification.

---

## ✅ What Was Built

### 1. Enhanced Type System
**File:** [src/types.ts](src/types.ts)

Added to `Question` interface:
- `guidance?: string` - Step-by-step verification instructions
- `examples?: string[]` - Sample answers
- `verificationRequired?: boolean` - Requires evidence proof
- `evidenceRef?: string` - Reference to supporting evidence

### 2. Interactive Handler
**File:** [src/cli.ts](src/cli.ts) - Lines 34-130

New `handleInteractiveQuestion()` function with:
- Loop until answered or skipped
- `help`/`?` command - Shows verification guidance
- `example`/`examples` command - Displays sample answers
- File path validation for evidence-required questions
- Automatic evidence ingestion via `EvidenceManager`
- Evidence linking to question answers
- Colored, formatted output with emojis
- Friendly error handling with retry

### 3. Template Enhancement
**File:** [templates/deployment-failed.json](templates/deployment-failed.json)

Updated questions with:
- Guidance fields (step-by-step instructions)
- Examples arrays (sample answers)
- `verificationRequired` flags for critical questions

---

## 🎬 How It Works

### Interactive Flow

```
User runs: piper analyze <caseId>
    ↓
System shows unanswered question
    ↓
User types "help"
    ↓
System shows:
  - 📚 HOW TO VERIFY (guidance)
  - 📁 EVIDENCE REQUIRED (for verification questions)
    ↓
User types "example"
    ↓
System shows:
  - 💡 EXAMPLES (sample answers)
    ↓
User provides file path
    ↓
System:
  1. Validates file exists
  2. Ingests via evidenceMgr.addFile()
  3. Records answer: "Verified via evidence: {fileName}"
  4. Links evidence to question
  5. Shows: ✓ Evidence captured
           ✓ Answer linked to evidence
```

### Commands Available
- `help` or `?` → Show verification guidance
- `example` or `examples` → Show sample answers
- `<file-path>` → For evidence-required questions
- `<text-answer>` → For optional text questions
- `Enter` → Skip question

---

## 📋 Example Session

```bash
$ piper analyze be27c452

📝 1 questions could not be auto-answered from evidence

Q: Have you verified the Service Connection is authorized in Project Settings?
   [q2] REQUIRED
   ⚠️  Evidence required - "trust but verify"
   Answer, "help" for guidance, "example" for samples, or Enter to skip: help

   📚 HOW TO VERIFY:
   1. Navigate to Azure DevOps → Project Settings
   2. Click 'Service Connections' in the menu
   3. Find your Azure subscription connection
   4. Check 'Security' tab for authorization status
   5. Take screenshot showing connection name and status
   
   📁 EVIDENCE REQUIRED:
   - Provide file path to screenshot, log, or config
   - Evidence will be ingested and linked to this answer
   - Use: piper add-evidence <caseId> <file>

   Answer, "help" for guidance, "example" for samples, or Enter to skip: example

   💡 EXAMPLES:
   1. Yes, verified - connection shows 'Ready' status
   2. No, connection shows 'Authorization Required'
   3. Yes, authorized for all pipelines in project

   Answer, "help" for guidance, "example" for samples, or Enter to skip: ./screenshots/service-connection.png
   ✓ Evidence captured: service-connection.png
   ✓ Answer linked to evidence

✅ Applied 1 answer(s)
```

---

## 🏗️ Architecture

### Code Structure

```
src/
├── types.ts                     ← Enhanced Question interface
└── cli.ts
    ├── handleInteractiveQuestion()  ← New interactive handler
    └── analyze command              ← Modified to use handler

templates/
└── deployment-failed.json       ← Enhanced with guidance/examples

cases/
└── {caseId}/
    ├── case.json                ← Questions store guidance
    └── artifacts/               ← Evidence files ingested here
```

### Data Flow

```
Template (guidance) → Case (questions) → CLI (interactive) → Evidence (ingestion)
                                              ↓
                                    User types "help"
                                              ↓
                                    Shows guidance from question
                                              ↓
                                    User provides file
                                              ↓
                                    EvidenceManager.addFile()
                                              ↓
                                    Link to answer
```

---

## 🎓 Design Principles

### 1. "Trust but Verify"
**Philosophy:** "Ingestion is the only way - we need evidence"

- Critical questions **require** evidence files
- Evidence is **ingested** into case artifacts
- Evidence is **linked** to specific answers
- Creates **audit trail** of verification

### 2. Progressive Disclosure
- Start with simple prompt
- Offer help if needed
- Show examples on demand
- Don't overwhelm upfront

### 3. Self-Service
- Users can get unstuck without support
- Guidance teaches proper verification
- Examples show what good looks like
- Retry-friendly error handling

### 4. Quality Over Speed
- Maintain pressure to answer questions
- But provide tools to do it right
- Evidence beats text claims
- Verification beats assumptions

---

## 📊 Benefits

### For Users
- ✅ Know how to verify information
- ✅ See examples of good answers
- ✅ Self-serve when stuck
- ✅ Clear feedback on what's needed
- ✅ Friendly retry on errors

### For Diagnostics
- ✅ Higher quality information
- ✅ Verified with evidence files
- ✅ Fewer skipped questions
- ✅ Complete audit trail
- ✅ Traceable verification

### For Organization
- ✅ Reduced support escalations
- ✅ Faster problem resolution
- ✅ Better diagnostic accuracy
- ✅ Auditable process
- ✅ Consistent quality

---

## 🧪 Testing

### Test Case
- **ID:** be27c452
- **Title:** "Test deployment failed with error code"
- **Question:** q2 with full guidance/examples
- **Evidence:** test-screenshot.txt

### Test Commands
```bash
# Build
npm run build

# Show case (verify question has guidance)
piper show be27c452

# Run interactive (test help/example/evidence)
piper analyze be27c452
```

### Test Scenarios
1. ✅ Type "help" → Shows guidance
2. ✅ Type "example" → Shows examples
3. ✅ Provide valid file path → Evidence ingested
4. ✅ Provide invalid path → Friendly error, allows retry
5. ✅ Press Enter → Skips question
6. ✅ Type text for non-evidence question → Accepted

---

## 📁 Modified Files

1. **[src/types.ts](src/types.ts)**
   - Added 4 fields to Question interface

2. **[src/cli.ts](src/cli.ts)**
   - Added handleInteractiveQuestion() (97 lines)
   - Modified analyze command (1 line change)
   - Added imports (Question, SuggestedAnswer types)

3. **[templates/deployment-failed.json](templates/deployment-failed.json)**
   - Added guidance/examples to q1, q2, q4
   - Added verificationRequired to q1, q4

4. **[cases/be27c452/case.json](cases/be27c452/case.json)**
   - Test case with enhanced q2

---

## 📚 Documentation

Created:
1. **[demo-interactive-help.md](demo-interactive-help.md)** - Feature demo and usage
2. **[IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md)** - Complete implementation details
3. **[BEFORE-AFTER-GUIDE.md](BEFORE-AFTER-GUIDE.md)** - Visual before/after comparison
4. **[SUMMARY.md](SUMMARY.md)** - This summary document

---

## 🚀 Next Steps

### Immediate (Ready to Use)
- ✅ Feature complete and tested
- ✅ Build successful
- ✅ Documentation complete
- 🎯 Ready for real-world testing

### Future Enhancements
1. **Screenshot Integration**
   - Auto-capture from clipboard
   - Integrate OS screenshot tools
   - Preview evidence before ingestion

2. **Smart Suggestions**
   - Suggest evidence type based on question
   - Auto-detect file types
   - Validate evidence content

3. **Hypothesis Linking**
   - Link evidence to hypotheses
   - Auto-validate with evidence
   - Show proof coverage

4. **Evidence Quality**
   - Check screenshots contain relevant info
   - Validate log files have errors
   - Ensure configs are complete

---

## ✨ Summary

### What We Built
An interactive guidance system that transforms question answering from a basic text prompt into a **guided, verified, evidence-based process**.

### Key Features
- 📚 Help command with step-by-step guidance
- 💡 Example command with sample answers
- 📁 Evidence verification (required for critical questions)
- 🔄 Friendly retry on errors
- ✓ Evidence ingestion and linking
- 🎨 Clear, colored output

### Philosophy
**"Trust but Verify"** - Ingestion is the only way - we need evidence.

### Impact
- Higher quality diagnostics
- Faster resolution
- Better user experience
- Complete audit trail
- Verified information

---

## 🎯 Mission Accomplished

**User Problem:** "What if they don't know how to answer?"

**Solution Delivered:** Interactive help system with guidance, examples, and evidence verification.

**Status:** ✅ **COMPLETE AND READY TO USE**
