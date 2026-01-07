# Copilot-Auto Integration Setup

## Overview
The system is now fully integrated with your `copilot-auto` wrapper. All AI features use the wrapper via temp file I/O pattern.

## Environment Setup

### Required Environment Variables

```bash
# Enable LLM features
LLM_ENABLED=true

# Specify provider (copilot-auto or openai)
LLM_PROVIDER=copilot-auto

# Path to copilot-auto executable
COPILOT_AUTO_PATH=C:\path\to\copilot-auto.exe
```

### Example .env File
```
LLM_ENABLED=true
LLM_PROVIDER=copilot-auto
COPILOT_AUTO_PATH=C:\Users\azadmin\tools\copilot-auto.exe
```

## How It Works

### Question Analysis
When `--auto-analyze` is used, the system:
1. Builds structured prompt with questions and evidence
2. Executes: `copilot-auto --direct "<prompt>"`
3. Parses plain text response in structured format:
   ```
   QUESTION_ID: q1
   ANSWER: Azure CLI authentication failure
   CONFIDENCE: high
   ALTERNATIVES: Service principal expired; Token refresh needed
   SEARCH: ##[error] in logs
   ```
4. Converts to internal format with alternatives

### Dynamic Guidance
When user types "help" during questions:
1. Executes: `copilot-auto --direct "<guidance prompt>"`
2. Displays plain text response to user
3. Returns to question prompt

## Testing

### Test Auto-Analysis
```bash
# Build first
npm run build

# Test with auto-analyze
piper ingest "Pipeline failing at deploy stage" "logs.zip" --context pipelines --auto-analyze
```

Expected behavior:
- System auto-answers questions using AI
- Progresses through states (Intake → Classify → Normalize)
- Shows multiple-choice options with confidence levels
- Continues until blocked by required questions

### Test Dynamic Guidance
```bash
# Start analysis without auto-analyze
piper analyze <caseId>

# When prompted for a question, type:
help
```

Expected behavior:
- System generates AI guidance for the question
- Shows where to find info, what to look for, how to verify
- Returns to question prompt

### Test Context-Aware Analysis
```bash
# Pipeline context (detects ##[error], ##[warning])
piper ingest "problem" "logs.zip" --context pipelines --auto-analyze

# Azure context (detects ARM template issues, resource conflicts)
piper ingest "problem" "logs.zip" --context azure --auto-analyze

# Kubernetes context (detects pod failures, resource limits)
piper ingest "problem" "logs.zip" --context kubernetes --auto-analyze
```

## Expected copilot-auto Wrapper Behavior

### Input Format (Question Analysis)
Command line:
```bash
copilot-auto --direct "Analyze these diagnostic questions and suggest answers...

Questions:
1. [pipeline-runtime] What is the pipeline runtime?
2. [error-type] What type of error occurred?

Evidence:
- ##[error]Task 'AzureCLI' failed with exit code 1

Provide your answer in this format:
QUESTION_ID: <id>
ANSWER: <answer>
CONFIDENCE: high|medium|low
ALTERNATIVES: <alt1>; <alt2>
SEARCH: <search terms>

(Repeat for each question)"
```

### Input Format (Guidance)
Command line:
```bash
copilot-auto --direct "You are a troubleshooting expert. Provide clear, actionable guidance for answering this diagnostic question:

'What is the pipeline runtime?'

Provide 3-4 bullet points on:
1. Where to find this information
2. What to look for
3. How to verify it

Be specific and practical."
```

### Expected Output
**Question Analysis**: Structured plain text format:
```
QUESTION_ID: error-type
ANSWER: Azure CLI authentication failure
CONFIDENCE: high
ALTERNATIVES: Service principal expired; Network timeout
SEARCH: ##[error] AzureCLI in logs

QUESTION_ID: pipeline-runtime
ANSWER: Azure DevOps
CONFIDENCE: medium
SEARCH: trigger: branches: in YAML files
```

**Guidance**: Markdown-formatted bullet points

## Fallback Behavior

If `copilot-auto` is unavailable:
- System falls back to heuristic pattern matching
- Detects ##[error], ##[warning], auth failures
- Provides alternatives with "low" confidence
- Still functional but less intelligent

## Troubleshooting

### Issue: "Command not found"
- Verify `COPILOT_AUTO_PATH` is set correctly
- Test manually: `copilot-auto --version`

### Issue: "Guidance generation failed"
- Verify copilot-auto responds in --direct mode
- Test: `copilot-auto --direct "Hello"`

### Issue: No suggestions returned
- Check copilot-auto output format matches expected structure
- Verify QUESTION_ID, ANSWER, CONFIDENCE fields present
- Test manually with simple prompt

### Issue: Timeout errors
- copilot-auto must respond within 60 seconds for analysis, 30 seconds for guidance
- Check GitHub Copilot API connectivity
- Adjust timeout in LLMClient.ts if needed

## Architecture Notes

### Why Direct Mode?
- Simpler integration - pass prompts directly as arguments
- No temp file management needed
- Standard CLI interface pattern
- Works with shell escaping for complex prompts

### Why Structured Text Format?
- copilot-auto doesn't have --json flag
- Structured text is easy to parse and debug
- More flexible than JSON parsing
- AI can follow format instructions naturally

### Integration Points
- [src/llm/LLMClient.ts](src/llm/LLMClient.ts#L96-L120) - analyzeWithCopilot()
- [src/llm/LLMClient.ts](src/llm/LLMClient.ts#L172-L190) - generateGuidance()
- [src/llm/LLMClient.ts](src/llm/LLMClient.ts#L193-L263) - parseStructuredResponse()
- [src/cli.ts](src/cli.ts#L88-L107) - Dynamic guidance in handleInteractiveQuestion()

## Next Steps

1. Set environment variables in `.env`
2. Build: `npm run build`
3. Test: `piper ingest "problem" "logs.zip" --context pipelines --auto-analyze`
4. Verify AI suggestions appear with confidence levels
5. Test dynamic guidance by typing "help" during questions
6. Check temp files are created/cleaned up properly
