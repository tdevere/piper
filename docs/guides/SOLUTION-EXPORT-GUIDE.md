# Solution Document Export Guide

## Overview

After resolving a troubleshooting case, Piper can generate a comprehensive solution document for knowledge base indexing. This enables organizational learning by documenting what went wrong, how it was fixed, and how to prevent it in the future.

## Workflow

### 1. Complete Troubleshooting

Follow the standard troubleshooting workflow:
```bash
# Create case
piper ingest "Pipeline deployment failed" ./logs.txt

# Analyze and gather evidence
piper scope <id>
piper analyze <id>
piper add-evidence <id> ./more-logs.txt

# Apply fixes and verify
piper next <id>
piper add-evidence <id> ./fixed-logs.txt
```

### 2. Mark Case as Resolved

Once the issue is fixed:
```bash
piper resolve <id>
```

You'll be prompted for:
- **Resolution summary**: Brief description of what fixed the issue
- **Root cause**: (Optional) What actually caused the problem

Example:
```
Resolution: Fixed by restarting the agent pool and clearing pipeline cache

Root cause: Cache corruption in agent pool causing deployment failures
```

### 3. Generate Solution Document

After resolving, generate the comprehensive solution document:
```bash
piper solution <id>
```

Options:
- `--format markdown|json|github` - Output format (default: markdown)
- `--output <path>` - Custom output path (default: cases/<id>/solution.md)

Example:
```bash
# Generate with defaults
piper solution b9816a24

# Custom output location
piper solution b9816a24 --output ./kb/pipeline-cache-issue.md

# GitHub issue format
piper solution b9816a24 --format github
```

## Solution Document Contents

The generated solution includes:

### 📋 Problem Summary
Clear, concise description of what went wrong

### 🖥️ Environment
- System/service affected
- Context (Azure DevOps, deployment, etc.)
- When it occurred
- Affected components

### 🔍 Root Cause
Detailed explanation of what caused the issue based on evidence collected during troubleshooting

### ✅ Solution Steps
Numbered, specific steps that fixed the problem:
1. Exact commands or actions taken
2. Configuration changes with before/after states
3. Specific fixes applied

### ✔️ Verification
How to confirm the fix worked:
- Commands to run
- Expected output
- Success indicators

### 🛡️ Prevention
How to avoid this in the future:
- Monitoring to add
- Process improvements
- Configuration best practices

### 🛠️ Tools & Methods Used
- piper CLI commands used during investigation
- Analysis techniques applied
- Evidence sources examined

### 📁 Key Evidence
References to critical log files, screenshots, or other evidence that revealed the issue

### 🔗 Related Issues
Common variations or similar problems users might encounter

### 🏷️ Tags
Automatically generated tags from case context, classification, and error patterns for searchability

## AI-Powered Generation

The solution document is generated using **GitHub Copilot CLI** AI which:
- Analyzes all case data (questions, evidence, timeline, hypotheses)
- Synthesizes information into a coherent narrative
- Structures content for easy knowledge base consumption
- Includes specific details from evidence files
- Suggests prevention strategies based on root cause

Generation typically takes 30-60 seconds depending on case complexity.

## Example Output

```markdown
# RealDataTest

## Problem Summary
Azure DevOps pipeline for APIM ARM template deployment was experiencing 
complete variable expansion failures...

## Environment
- **System/Service**: Azure DevOps Pipelines, Azure API Management
- **Context**: Multi-stage YAML pipeline with variable group
- **When it occurred**: 2026-01-07

## Root Cause
Cache corruption in the Azure DevOps agent pool caused the runtime 
variable expansion engine to fail...

## Solution Steps
1. **Restart the agent pool**:
   - Navigate to Project Settings → Agent Pools
   - Select the agent pool running the deployment
   - Restart all agents to force cache clear

2. **Clear pipeline cache**:
   - Go to pipeline → Run pipeline
   - Expand "Advanced options"
   - Enable "Clear cache" option

...
```

## Knowledge Base Integration

After generating the solution document:

### GitHub Issues/Discussions
```bash
# View the solution
cat cases/b9816a24/solution.md

# Create GitHub issue/discussion with the content
# (Manual step - copy solution content to GitHub)
```

### Internal Documentation
```bash
# Copy to docs repository
cp cases/b9816a24/solution.md ../docs/troubleshooting/pipeline-cache-corruption.md

# Commit and push
cd ../docs
git add troubleshooting/pipeline-cache-corruption.md
git commit -m "Add solution for pipeline cache corruption"
git push
```

### Search Indexing
The solution documents are:
- Formatted with clear headings for easy parsing
- Tagged with relevant keywords for searchability
- Structured consistently for machine readability
- Include error patterns and component names for matching

## Case State Transitions

```
Intake → Normalize → Classify → Plan → Execute → Evaluate
                                  ↑______________|
                                  (Loop if not resolved)
                                         ↓
Resolve → ReadyForSolution → Postmortem
          (solution generated)
```

After running `piper solution <id>`, the case state transitions to **ReadyForSolution**, indicating the knowledge is documented and ready for sharing.

## Best Practices

### 1. Complete Evidence Collection
Before resolving, ensure you have:
- ✅ Original error logs
- ✅ Fixed/successful logs (verification)
- ✅ Screenshots of configurations
- ✅ Relevant pipeline/deployment files

More evidence = better solution documents.

### 2. Detailed Resolution Summary
When resolving, provide specific details:
- ❌ Bad: "Fixed the issue"
- ✅ Good: "Fixed by restarting agent pool and clearing pipeline cache"

### 3. Document Root Cause
Always provide root cause when known:
- ❌ Bad: Skip root cause
- ✅ Good: "Cache corruption in agent pool"

This helps AI generate accurate prevention strategies.

### 4. Review Before Sharing
Always review the generated solution:
```bash
# View solution
cat cases/<id>/solution.md

# Edit if needed
code cases/<id>/solution.md
```

The AI does excellent work but may need minor refinements for your organization's style.

### 5. Tag and Categorize
The solution includes auto-generated tags. You can enhance GitHub/KB posts with additional:
- Labels/tags specific to your team
- Links to related documentation
- Cross-references to similar issues

## Troubleshooting

### "Case must be resolved before generating solution"
Run `piper resolve <id>` first to mark the case as resolved.

### Solution is too generic
Ensure you:
- Provided detailed resolution summary during resolve
- Collected relevant evidence files
- Answered diagnostic questions during troubleshooting

More context = better solutions.

### AI generation takes too long
Large cases with many evidence files can take 60-120 seconds. The AI is analyzing all content to provide comprehensive solutions. Wait for the generation to complete.

### Solution format needs customization
Edit the generated markdown file directly:
```bash
code cases/<id>/solution.md
```

Or modify the prompt template in [src/cli.ts](src/cli.ts) lines 1920-2020 for organization-specific formatting.

## Next Steps

After generating solution documents:

1. **Share Knowledge**: Post to GitHub, internal wiki, or documentation site
2. **Improve Templates**: Use common solutions to enhance diagnostic templates
3. **Build KB**: Accumulate solutions into searchable knowledge base
4. **Train Team**: Use solutions as training materials for onboarding
5. **Prevent Recurrence**: Implement prevention strategies from solutions

## Related Commands

- `piper resolve <id>` - Mark case as resolved (prerequisite)
- `piper show <id>` - View complete case details
- `piper events <id>` - View troubleshooting timeline
- `piper list` - List all cases and their states
