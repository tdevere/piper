# Implementation Status: Interactive Question Guidance

## ✅ Completed Features

### 1. Enhanced Question Type System
**File:** [src/types.ts](src/types.ts)

Added fields to `Question` interface:
```typescript
guidance?: string;              // Step-by-step verification instructions
examples?: string[];            // Example answers
verificationRequired?: boolean; // Requires evidence proof
evidenceRef?: string;          // Reference to supporting evidence
```

### 2. Interactive Question Handler
**File:** [src/cli.ts](src/cli.ts) - `handleInteractiveQuestion()` function

Features:
- ✅ Loop until answered or skipped
- ✅ Recognize `help` and `?` commands
- ✅ Show guidance when requested
- ✅ Recognize `example`/`examples` commands
- ✅ Display example answers
- ✅ Validate file paths for evidence-required questions
- ✅ Auto-ingest evidence via `EvidenceManager`
- ✅ Link evidence to question answers
- ✅ Accept text answers for optional questions
- ✅ Clear visual feedback with colored output

### 3. Template Enhancement
**File:** [templates/deployment-failed.json](templates/deployment-failed.json)

Enhanced questions with:
- ✅ `guidance` fields with step-by-step instructions
- ✅ `examples` arrays with sample answers
- ✅ `verificationRequired` flags for critical questions

Sample enhanced question:
```json
{
  "id": "q1",
  "ask": "What is the exact deployment error code and message?",
  "required": true,
  "expectedFormat": "text",
  "guidance": "1. Navigate to Azure Portal → Deployments\n2. Find the failed deployment\n3. Click 'Error details' to see full error\n4. Copy entire error message including code",
  "examples": [
    "DeploymentFailed: The resource operation completed with terminal provisioning state 'Failed'",
    "Code: InvalidTemplateDeployment, Message: The template deployment failed..."
  ],
  "verificationRequired": true
}
```

## 🎯 Implementation Philosophy: "Trust but Verify"

### Core Principle
**"Ingestion is the only way - we need evidence"**

Instead of accepting text answers at face value:
1. Request proof (screenshots, logs, configs)
2. Ingest evidence into case artifacts
3. Link evidence to specific question answers
4. Create audit trail of verification

### Benefits
- **Verifiable:** Answers backed by actual files
- **Traceable:** Clear link between Q&A and proof
- **Auditable:** Complete record of what was checked
- **Trustworthy:** Not based on memory or assumptions

## 📋 User Experience Flow

### When User Doesn't Know How to Answer

```bash
piper analyze be27c452
```

**Output:**
```
Q: Have you verified the Service Connection is authorized in Project Settings?
   [q2] REQUIRED
   ⚠️  Evidence required - "trust but verify"
   Answer, "help" for guidance, "example" for samples, or Enter to skip: help
```

### Help Display
```
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
```

### Example Display
```
   Answer, "help" for guidance, "example" for samples, or Enter to skip: example
   
   💡 EXAMPLES:
   1. Yes, verified - connection shows 'Ready' status
   2. No, connection shows 'Authorization Required'
   3. Yes, authorized for all pipelines in project
```

### Evidence Submission
```
   Answer, "help" for guidance, "example" for samples, or Enter to skip: ./screenshots/service-connection-auth.png
   ✓ Evidence captured: service-connection-auth.png
   ✓ Answer linked to evidence
```

## 🔧 Technical Implementation

### Interactive Loop
```typescript
while (!answered) {
    const input = await readline.question(...);
    
    if (input === 'help' || input === '?') {
        // Show guidance + evidence requirements
    } else if (input === 'example') {
        // Display example answers
    } else if (input === '') {
        // Skip question
    } else if (q.verificationRequired) {
        // Validate file path + ingest evidence
    } else {
        // Accept text answer
    }
}
```

### Evidence Ingestion
When user provides file path for evidence-required question:
1. Validate file exists: `fs.existsSync(filePath)`
2. Ingest: `evidenceMgr.addFile(caseId, filePath)`
3. Record answer: `"Verified via evidence: {fileName}"`
4. Link evidence to question via answer text

### Readline Management
- Created lazily when needed
- Closed immediately after question answered
- Prevents CLI hanging issues

## 📁 Modified Files

1. **[src/types.ts](src/types.ts)**
   - Added guidance fields to `Question` interface
   
2. **[src/cli.ts](src/cli.ts)**
   - Added `handleInteractiveQuestion()` function (lines 34-130)
   - Modified analyze command to call handler (line 181)
   - Imported additional types: `Question`, `SuggestedAnswer`

3. **[templates/deployment-failed.json](templates/deployment-failed.json)**
   - Enhanced questions q1, q2, q4 with guidance/examples
   - Added `verificationRequired: true` to q1 and q4

4. **[cases/be27c452/case.json](cases/be27c452/case.json)** (Test case)
   - Added guidance/examples/verificationRequired to q2

## 🧪 Testing

### Test Case Created
- **ID:** `be27c452`
- **Title:** "Test deployment failed with error code"
- **State:** Normalize
- **Question:** q2 - Service Connection verification (with guidance)
- **Evidence:** test-screenshot.txt (mock)

### Manual Test Commands
```bash
# Build
npm run build

# Show test case
piper show be27c452

# Run interactive analysis (will prompt with new guidance)
piper analyze be27c452

# Test help command by typing: help
# Test examples by typing: example
# Test evidence by typing: ./test-screenshot.txt
# Test skip by pressing: Enter
```

## 🚀 Next Steps

### Immediate
1. ✅ Basic help/example commands working
2. ✅ Evidence file validation
3. ✅ Evidence ingestion integration
4. ⏳ Full integration testing with real screenshots

### Future Enhancements
1. **Screenshot Capture Integration**
   - Prompt user to take screenshot
   - Auto-capture from clipboard
   - Integrate with Windows Snipping Tool

2. **Evidence Preview**
   - Show first few lines of log files
   - Display image thumbnails for screenshots
   - Validate evidence content matches question

3. **Hypothesis Linking**
   - Link evidence to specific hypotheses
   - Auto-validate hypotheses with evidence
   - Show which hypotheses have supporting proof

4. **Smart Evidence Suggestions**
   - Based on question type, suggest evidence formats
   - "This looks like a permission issue - provide Azure IAM screenshot"

5. **Evidence Quality Checks**
   - Verify screenshots contain relevant information
   - Check log files for error patterns
   - Validate config files are complete

## 📊 Metrics & Success Criteria

### Before (Old System)
- Accepted any text answer
- No guidance for users
- No verification required
- No evidence linking

### After (New System)
- Interactive help on demand
- Step-by-step verification guidance
- Evidence required for critical questions
- Automatic evidence ingestion and linking
- Complete audit trail

### Success Indicators
- Users can self-serve when stuck ("help" command)
- All critical answers backed by evidence files
- Reduced back-and-forth questioning
- Improved diagnostic quality
- Clear verification trail for audits

## 🎓 Design Decisions

### Why Loop Instead of Single Prompt?
Allows users to explore help/examples before answering without restarting.

### Why Separate `help` and `example`?
Different information needs:
- Help = "How do I find this?"
- Example = "What format should the answer be?"

### Why File Path Instead of Copy/Paste?
Forces proper evidence ingestion rather than text claims. Maintains "trust but verify" philosophy.

### Why Mark Questions as `verificationRequired`?
Not all questions need evidence (e.g., "When did this start?"). But critical verification points (configs, permissions, errors) must have proof.

### Why Close Readline After Each Question?
Prevents process hanging (learned from previous bug). Lazy initialization pattern.

## 📝 Code Quality

### Type Safety
- All new fields properly typed
- Question interface extended cleanly
- No `any` types used

### Error Handling
- File not found: Clear error message
- Evidence ingestion failure: Allows retry
- Invalid input: Helpful feedback

### User Experience
- Color-coded output (chalk)
- Clear visual hierarchy
- Emoji indicators for status
- Consistent formatting

### Maintainability
- Handler function is self-contained
- Clear separation of concerns
- Well-documented with inline comments
- Follows existing code patterns

## ✨ Summary

The interactive question guidance system is **fully implemented** and ready for testing. It transforms the question-answering experience from a basic text prompt to an intelligent, guided, evidence-based verification system.

**Key Achievement:** Implemented the "trust but verify" philosophy throughout the diagnostic workflow, ensuring all critical information is backed by verifiable evidence files rather than user claims.
