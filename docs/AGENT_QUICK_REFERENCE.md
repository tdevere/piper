# Agent Quick Reference

## Setup

```bash
# Install copilot-auto (VS Code Copilot CLI wrapper)
# See: https://github.com/tdevere/copilot-auto

# Configure for copilot-auto (default)
echo "LLM_ENABLED=true\nLLM_PROVIDER=copilot-auto" > .env

# Or configure OpenAI
echo "LLM_ENABLED=true\nLLM_PROVIDER=openai\nOPENAI_API_KEY=sk-..." > .env
```

## Basic Commands

```bash
# Create agent for case
piper agent-start <caseId>

# Run agent (interactive)
piper agent-run <sessionId>

# Run agent (autonomous)
piper agent-run <sessionId> --autoApprove

# Monitor agents
piper agent-status

# Control
piper agent-pause <sessionId>
piper agent-resume <sessionId>
piper agent-terminate <sessionId>
```

## Common Workflows

### Autonomous Investigation
```bash
piper ingest "Error message" logs.zip
# → Case: abc123

piper agent-start abc123 --maxIterations 100
# → Session: xyz789

piper agent-run xyz789 --autoApprove
# Agent runs until complete or limits reached
```

### Supervised Investigation
```bash
piper agent-start abc123
piper agent-run xyz789
# Agent asks for approval on each high-impact action
```

### Long-Running Investigation
```bash
piper agent-start abc123 --maxDuration 120  # 2 hours
piper agent-run xyz789

# If interrupted:
piper agent-resume xyz789
```

## Agent Actions

| Action | Impact | Auto-Approve? | Description |
|--------|--------|---------------|-------------|
| answer-question | Low | ✓ | Answer diagnostic questions |
| test-hypothesis | Low | ✓ | Update hypothesis status |
| request-evidence | Medium | ✗ | Ask for additional files |
| transition-state | High | ✗ | Move to next case state |

## Safety Limits

| Limit | Default | Flag |
|-------|---------|------|
| Max Iterations | 50 | `--maxIterations` |
| Max Duration | 30 min | `--maxDuration` |
| Auto-Approve | Off | `--autoApprove` |

## Session Files

- **Location**: `cases/.sessions/<sessionId>.json`
- **Contains**: Personality, context, metrics, conversation history
- **Persistence**: Survives restarts, can resume anytime

## Troubleshooting

### "copilot-auto not available"
```bash
# Verify copilot-auto is installed and in PATH
copilot-auto --version

# Check .env configuration
cat .env | grep LLM_
```

### "Session not found"
```bash
piper agent-status  # List all sessions
ls cases/.sessions/  # Check filesystem
```

### Agent stops unexpectedly
Check session file for:
- `status`: "completed", "failed", or "terminated"
- `metrics.errorsEncountered`: Error count
- `metrics.iterations`: vs `config.maxIterations`

### Agent makes wrong decisions
1. Review conversation history in session file
2. Adjust template questions to be more specific
3. Add more evidence files
4. Use interactive mode to guide agent
