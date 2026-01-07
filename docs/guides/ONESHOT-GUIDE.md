# One-Shot Analysis Guide

The `oneshot` command provides quick troubleshooting analysis without the full interactive workflow. Perfect for when you have all evidence upfront and need immediate insights.

## Quick Reference

```bash
# Basic usage
piper oneshot <file|folder|zip> [description]

# Common options
-p, --previous <report.md>    # Load previous report for context
-o, --output <filename.md>    # Custom output filename (default: oneshot-report.md)
```

## When to Use OneShot vs Full Workflow

### Use `oneshot` when:
- ⚡ **Speed matters** - Need quick analysis in seconds/minutes
- 📦 **Evidence is ready** - All logs/files already collected
- 📝 **Sharing report** - Want markdown document for team/tickets
- 🔄 **Iterative investigation** - Building on previous analysis with new evidence
- 🎯 **Single-focus problem** - Clear, specific issue to investigate

### Use full workflow (`ingest`) when:
- 🎯 **Need guidance** - Interactive questions help collect right evidence
- 🔍 **Complex troubleshooting** - Multi-step investigation with hypothesis validation
- 📚 **Template learning** - Want system to learn from resolution
- 💬 **Uncertain scope** - Problem scope needs refinement through Q&A
- 🧪 **Test hypotheses** - Interactive validation of multiple theories

## Usage Examples

### 1. Single File Analysis

Analyze a single error log:

```bash
piper oneshot error-log.txt "Pipeline failing at deploy step"
```

**Output:** `oneshot-report.md` with:
- Problem summary and error patterns
- Affected components
- Root cause hypotheses
- Next investigation steps

### 2. Directory Analysis

Analyze multiple log files in a folder:

```bash
piper oneshot logs/ "Authentication failures across multiple services"
```

Automatically processes all files in the directory and generates comprehensive analysis.

### 3. ZIP Archive Analysis

Process compressed evidence bundle:

```bash
piper oneshot deployment-logs.zip "Intermittent timeout issues"
```

Extracts and analyzes all files in the archive.

### 4. Follow-Up Analysis

Build on previous investigation with new evidence:

```bash
# Initial analysis
piper oneshot error-log.txt "Connection timeouts" -o report1.md

# Gather more evidence, then follow-up
piper oneshot network-diagnostics/ --previous report1.md -o report2.md
```

The second analysis:
- References findings from `report1.md`
- Correlates new evidence with previous patterns
- Provides updated root cause analysis
- Shows progression in understanding

### 5. Custom Output Location

Save report to specific file:

```bash
piper oneshot data.txt "Database connection failures" -o analysis-jan7-2025.md
```

## Report Structure

Each oneshot report includes:

### 1. Problem Summary
- One-sentence problem statement
- Key error patterns identified
- Affected components/services
- Timeframe analysis
- Technical and business impact

### 2. Classification & Hypotheses
- Issue type classification
- Initial root cause hypotheses
- Confidence indicators

### 3. Evidence Analysis
- List of processed files
- File types and sizes
- Evidence quality assessment
- Missing evidence identification

### 4. Previous Context (if --previous used)
- Reference to earlier analysis
- Progression notes
- Updated findings

### 5. Next Steps
- Recommended actions
- Additional evidence to gather
- How to use full workflow for deeper investigation

### 6. Metadata
- Analysis timestamp
- Evidence count
- PII redaction status
- Case ID for reference

## Real-World Workflow Example

### Scenario: Pipeline Deployment Failure

**Step 1: Initial Analysis**

```bash
# Received initial error log from team
piper oneshot pipeline-error.txt "Production deploy failing" -o analysis-v1.md
```

**Report finds:**
- Connection timeout to Azure App Service
- 60-second timeout pattern
- Port 443 (HTTPS) issues

**Step 2: Follow-Up with Network Diagnostics**

```bash
# Team runs network tests and provides diagnostics
piper oneshot network-tests/ --previous analysis-v1.md -o analysis-v2.md
```

**Updated report identifies:**
- DNS and TCP successful
- HTTPS layer timing out
- Correlation with recent SSL certificate renewal

**Step 3: Deep Investigation (Switch to Full Workflow)**

```bash
# Now use full workflow for guided collection of SSL config
piper ingest ssl-config.zip -a

# Interactive questions guide you to:
# - SSL certificate binding details
# - SNI configuration
# - Azure Key Vault references
```

**Result:** Root cause found - certificate binding misconfigured after renewal.

## Advanced Tips

### 1. Progressive Investigation

Use oneshot for quick iterations, then switch to full workflow:

```bash
# Quick triage (30 seconds)
piper oneshot initial-logs.zip "Issue summary"

# More evidence? Quick follow-up (40 seconds)
piper oneshot config-files/ --previous oneshot-report.md

# Still unclear? Full investigation (interactive)
piper ingest all-evidence.zip -a
```

### 2. Team Collaboration

Share oneshot reports in tickets/channels:

```bash
# Generate shareable report
piper oneshot evidence.zip "Issue summary" -o TICKET-1234-analysis.md

# Team members can review and provide more evidence
# Then you follow up:
piper oneshot new-evidence/ --previous TICKET-1234-analysis.md -o TICKET-1234-update.md
```

### 3. Batch Analysis

Analyze multiple unrelated issues quickly:

```bash
# Issue 1
piper oneshot issue1-logs/ "Auth failure" -o issue1-analysis.md

# Issue 2
piper oneshot issue2-logs/ "Timeout" -o issue2-analysis.md

# Issue 3
piper oneshot issue3-logs/ "Deploy failure" -o issue3-analysis.md
```

Each gets its own focused analysis without cross-contamination.

## Limitations

**What oneshot does NOT do:**
- ❌ No template learning (not saved as case)
- ❌ No hypothesis validation workflow
- ❌ No evidence restoration (temporary case cleaned up)
- ❌ No question confirmation loop
- ❌ No state tracking across sessions

**For those features, use:** `piper ingest <evidence> -a`

## Performance

Typical execution times:
- **Small file (<1MB):** 20-40 seconds
- **Multiple files (5-10):** 30-60 seconds
- **Large archive (10-50MB):** 60-120 seconds

Times include:
- Evidence ingestion and PII redaction
- AI analysis (copilot-auto)
- Report generation

## Troubleshooting

### "Input not found"
```bash
# Check file path
ls error-log.txt

# Use absolute path if needed
piper oneshot C:\Users\you\logs\error.txt "Description"
```

### "Previous report not found"
```bash
# Verify previous report exists
ls oneshot-report.md

# Use correct relative or absolute path
piper oneshot new.txt --previous ./reports/oneshot-report.md
```

### AI analysis timeout
```bash
# If copilot is slow, check status
copilot -p "test" --allow-all-tools

# Fallback: Use smaller evidence subset
piper oneshot key-files/ "Issue"  # Instead of entire archive
```

## Related Commands

- `piper ingest` - Full interactive workflow with template learning
- `piper show <id>` - View detailed case information
- `piper templates` - View available troubleshooting templates
- `piper evidence <id>` - Manage evidence for saved cases

## See Also

- [QUICK-REFERENCE.md](QUICK-REFERENCE.md) - All commands reference
- [DEMO.md](../DEMO.md) - Full workflow walkthrough
- [PII-USER-GUIDE.md](PII-USER-GUIDE.md) - PII protection details
