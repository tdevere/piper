# Enhanced Workflow Testing Guide

## Features Implemented

### 1. Enhanced Problem Statement Collection
- **Interactive prompts** during `piper ingest` to collect:
  - Specific error messages/codes
  - Observed behavior (what failed)
  - Expected behavior (what should happen)
- **Non-interactive mode**: `--problem-statement "detailed text"`
- **Stored in**: `case.metadata.detailedProblemStatement`

### 2. Template Confirmation During Ingestion
- Shows matched template details:
  - Name and version
  - Classification
  - Question count
  - Hypotheses count
- **User confirmation prompt**: "Apply this template? [Y/n]"
- **Skip prompt**: `--auto-approve-template` flag
- **Rejection tracking**: Stored in `case.metadata.rejectedTemplates[]`

### 3. Template Selection After Scope Confirmation
- Displays **top 3 matched templates** with:
  - Name, classification
  - Question and hypothesis counts
- **User options**:
  - Select 1-3: Apply specific template
  - 0: Skip all templates (manual workflow)
  - c: Request custom template (placeholder)
- **Event logging**: TemplateSelected, TemplatesRejected

### 4. Scope Refinement Tracking
- **Audit trail** in `case.metadata.scopeRefinements[]`:
  - Version number
  - Old vs new summary
  - Timestamp
  - User initiated flag
- **Preserved in** `case.scopeHistory[]` (existing)

### 5. Fixed Template Classification
- `azure-artifacts-quick-fqr-guide.json` now has correct `area: "Artifacts"` instead of "Pipelines"

## Test Scenarios

### Test 1: Enhanced Problem Statement Collection (Interactive)
```bash
node dist/src/cli.js ingest "Pipeline authentication failed" test-wif-detailed.zip --context pipelines
```

**Expected Flow:**
1. Shows case ID
2. Prompts: "What specific error message or code did you see?"
   - Enter: `AADSTS700016 Application not found`
3. Prompts: "What behavior did you observe?"
   - Enter: `WIF authentication failed during AzureRM task`
4. Prompts: "What should have happened instead?"
   - Enter: `Should authenticate successfully and deploy resources`
5. Shows: "✓ Problem statement captured"
6. Extracts zip
7. Searches for template, shows match
8. Prompts: "Apply this template? [Y/n]"
   - Enter: `Y` to accept or `n` to reject
9. Creates case with detailed problem statement

**Verify:**
```bash
node dist/src/cli.js show <case-id> --json | jq .metadata.detailedProblemStatement
```

### Test 2: Non-Interactive Problem Statement
```bash
node dist/src/cli.js ingest "Pipeline auth failed" test-wif-detailed.zip \
  --context pipelines \
  --problem-statement "WIF authentication fails with AADSTS700016: App not found in directory. Expected federated credential to work." \
  --auto-approve-template
```

**Expected:**
- Skips interactive prompts
- Uses provided problem statement
- Auto-applies matched template
- No confirmation prompts

### Test 3: Template Rejection Tracking
```bash
node dist/src/cli.js ingest "Pipeline deployment failed" test-wif-detailed.zip --context pipelines
```

**When prompted "Apply this template? [Y/n]"**: Enter `n`

**Verify rejection tracked:**
```bash
node dist/src/cli.js show <case-id> --json | jq .metadata.rejectedTemplates
```

**Expected output:**
```json
[
  {
    "templateId": "azure-deployment-failed",
    "templateName": "Azure Deployment Failed",
    "timestamp": "2026-01-07T...",
    "reason": "User declined during ingestion"
  }
]
```

### Test 4: Template Selection After Scope Confirmation
```bash
# Create case without auto-approve
node dist/src/cli.js ingest "Pipeline WIF auth issue" test-wif-detailed.zip --context pipelines

# Confirm scope and see template selection
node dist/src/cli.js scope <case-id>
```

**Expected Flow:**
1. Shows scoping checklist (if matched)
2. Generates AI problem scope
3. Displays scope analysis
4. Prompts: "Select option [1-3]" → Enter `1` (Confirm)
5. Shows: "Found 2 matching template(s):"
   ```
   1. Azure Deployment Failed
      Classification: Configuration
      Questions: 6 | Hypotheses: 0
   
   2. WIF Authentication Troubleshooting
      Classification: Security
      Questions: 8 | Hypotheses: 3
   ```
6. Prompts: "Select template [1-2], 0 to skip, or 'c' for custom:"
   - Enter `2` to select second template
   - Enter `0` to skip all
   - Enter `c` for custom (not implemented yet)

**Verify selection tracked:**
```bash
node dist/src/cli.js events <case-id>
```

Should show: `TemplateSelected: User selected template: WIF Authentication Troubleshooting (option 2)`

### Test 5: Scope Refinement Tracking
```bash
node dist/src/cli.js scope <case-id>
```

**When prompted**: Enter `2` (Refine scope)  
**New statement**: `WIF federated credential misconfiguration causing AADSTS700016 errors`

**Verify refinement tracked:**
```bash
node dist/src/cli.js show <case-id> --json | jq .metadata.scopeRefinements
```

**Expected:**
```json
[
  {
    "version": 2,
    "oldSummary": "Pipeline authentication failure using WIF...",
    "newSummary": "WIF federated credential misconfiguration causing AADSTS700016 errors",
    "timestamp": "2026-01-07T...",
    "userInitiated": true
  }
]
```

### Test 6: Fixed Artifacts Template Matching
```bash
echo "Artifact feed permissions denied" | Out-File test-artifacts.txt
Compress-Archive -Path test-artifacts.txt -DestinationPath test-artifacts.zip -Force

node dist/src/cli.js ingest "Azure Artifacts feed permission error" test-artifacts.zip --context artifacts
node dist/src/cli.js scope <case-id>
```

**Expected:**
- Scoping template should match **"Azure Artifacts Quick FQR Guide"** (not Pipelines)
- Should show 9 required fields for artifacts scoping

## Validation Checklist

- [ ] Interactive problem statement collection works
- [ ] Non-interactive mode with --problem-statement flag works
- [ ] Template confirmation prompt appears during ingestion
- [ ] --auto-approve-template flag skips confirmation
- [ ] Rejected templates are tracked in metadata
- [ ] Template selection shows top 3 matches after scope confirmation
- [ ] User can select specific template (1-3)
- [ ] User can skip all templates (0)
- [ ] Template selection is logged in events
- [ ] Scope refinements are tracked in metadata with old/new values
- [ ] Azure Artifacts template now matches artifact issues correctly
- [ ] Detailed problem statement is stored and used for better template matching

## Notes

- **Custom template generation** (option 'c') is not yet implemented - shows placeholder message
- **Scope refinement tracking** captures both the history (scopeHistory) and metadata (scopeRefinements)
- **Template rejection** can occur at two points: during ingestion and after scope confirmation
- **Detailed problem statement** improves template matching accuracy by providing more context
