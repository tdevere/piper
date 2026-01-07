# Specialist: ADO Pipelines Troubleshooter

## Scope
- Azure DevOps YAML Pipelines
- Classic Release Pipelines
- Agent Pool Connectivity
- Service Connections (ARM, Docker, etc.)

## Required Evidence
- Build Logs (.log)
- Pipeline Definition (.yaml)

## Common Failure Domains
1. **Authentication**: Service connection expired, PAT expired.
2. **Network**: Agent cannot reach Maven/npm/PyPI or Azure.
3. **Version**: Task version mismatch (e.g., UsePythonVersion@0 vs @2).
