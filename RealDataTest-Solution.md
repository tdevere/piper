# RealDataTest

## Problem Summary
Azure DevOps pipeline for APIM (API Management) ARM template deployment failed due to variable expansion failures. Runtime variables from the variable group `[REDACTED-USER]-NonProd` were not being resolved properly and appeared as literal syntax strings (e.g., `$[ variablegroups.[REDACTED-USER]-NonProd.PolicyFiles ]`) instead of actual values, causing complete deployment blockage.

## Environment
- **System/Service Affected**: Azure API Management (APIM) ARM template deployment pipeline
- **Platform**: Azure DevOps Pipelines
- **Variable Group**: `[REDACTED-USER]-NonProd`
- **Feature Branch**: `feature/arm-deployment-diagnostics`
- **Affected Stages**: Build stage (PackageTemplates job), Deploy stage (DeployAPIM job)
- **Affected Tasks**: AzureCLI@2, AzureResourceManagerTemplateDeployment@3, PowerShell validation scripts
- **When Occurred**: 2026-01-07, resolved after 3 events starting at 15:56:36.692Z

## Root Cause
Cache corruption in the Azure DevOps agent pool prevented proper variable resolution during pipeline execution. The pipeline decorator system showed null variable expansion (`Expanded: eq('true', Null)`), indicating that variables from the variable group were unavailable during the job preparation phase. The runtime variable syntax `$[ variablegroups.* ]` was not being processed by the pipeline engine due to corrupted cache state, causing all critical deployment parameters (service names, subscription IDs, authentication tokens) to remain as literal unexpanded strings.

## Solution Steps
1. **Restart the Azure DevOps agent pool**
   - Navigate to Project Settings → Agent Pools
   - Select the agent pool running the pipeline
   - Restart all agents in the pool
   
2. **Clear the pipeline cache**
   - In Azure DevOps, go to Pipelines → Select the affected pipeline
   - Click "Run pipeline" → Advanced options
   - Check "Clear pipeline cache" option
   - Run the pipeline again

3. **Verify variable group access**
   - Navigate to Pipelines → Library
   - Confirm `[REDACTED-USER]-NonProd` variable group exists
   - Verify the pipeline has proper access permissions to the variable group
   - Confirm the Service Connection is authorized (validated via Screenshot 2026-01-07 091002.png)

## Verification
### Commands to run:
```bash
# Trigger a new pipeline run
az pipelines run --name "APIM-Deployment-Pipeline" --branch feature/arm-deployment-diagnostics

# Check variable expansion in pipeline logs
az pipelines runs show --id <run-id> --open
```

### Expected output:
- Variables should show actual values in pipeline logs, not literal syntax strings
- Example: `PolicyFiles` should resolve to actual file paths, not `$[ variablegroups.[REDACTED-USER]-NonProd.PolicyFiles ]`
- Pipeline decorator evaluation should show: `Expanded: eq('true', 'false')` or similar with actual values, not `Null`
- AzureCLI@2 task should successfully upload files with resolved SAS tokens
- AzureResourceManagerTemplateDeployment@3 task should complete with resolved subscription IDs and service names

### Success indicators:
- ✅ Build stage completes without variable expansion errors
- ✅ Deploy stage successfully deploys ARM templates to APIM
- ✅ All variables from `[REDACTED-USER]-NonProd` group resolve correctly
- ✅ No null values in pipeline decorator evaluations
- ✅ Pipeline logs show actual values instead of `$[ ... ]` syntax

## Prevention
### Monitoring to add:
- Set up alerts for pipeline failures with "variable expansion" errors
- Monitor agent pool health and cache state metrics
- Track variable group access failures in pipeline analytics
- Create dashboard showing variable resolution success rates

### Process improvements:
- Schedule periodic agent pool restarts (e.g., weekly maintenance window)
- Implement automatic cache clearing for failed pipeline runs
- Add validation step at pipeline start to test variable resolution before deployment
- Document variable group dependencies in pipeline YAML comments

### Configuration best practices:
- Use pipeline templates with explicit variable validation
- Add early-stage variable expansion tests:
  ```yaml
  - script: |
      echo "PolicyFiles: $(PolicyFiles)"
      echo "StorageSASToken: [length=$(StorageSASToken.length)]"
    displayName: 'Validate Variable Expansion'
  ```
- Regularly audit variable group permissions and service connection authorizations
- Keep agent pool software updated to avoid cache corruption issues
- Use runtime expressions consistently: prefer `${{ }}` for compile-time, `$[ ]` for runtime only when necessary

## Tools & Methods Used
### piper CLI commands:
- Evidence collection and analysis across 22 files
- Diagnostic question tracking (1 question answered)
- Hypothesis testing framework (3 hypotheses evaluated)
- Timeline tracking from problem identification to resolution

### Analysis techniques:
- Variable expansion pattern analysis in pipeline logs
- Pipeline decorator evaluation trace review
- Service connection authorization verification via screenshot evidence
- Systematic hypothesis elimination process

### Evidence sources:
- Pipeline execution logs from Build and Deploy stages
- Variable group configuration screenshots
- Service connection authorization evidence (Screenshot 2026-01-07 091002.png)
- Pipeline decorator evaluation traces
- AzureCLI@2 and AzureResourceManagerTemplateDeployment@3 task outputs

## Key Evidence
1. **Screenshot 2026-01-07 091002.png (4f2b46b3-0acf-4945-a6d8-a04dfe72d7a7)**: Confirmed Service Connection authorization in Project Settings
2. **Pipeline Logs**: Showed literal variable syntax `$[ variablegroups.[REDACTED-USER]-NonProd.PolicyFiles ]` not expanding
3. **Decorator Evaluation Trace**: Revealed `Expanded: eq('true', Null)` indicating null variable resolution during job preparation
4. **Variable Group Evidence**: All 8 variables (PolicyFiles, StorageSASToken, StorageUri, AzureSubscription, StorageAccount, SubscriptionId, Location, ApimServiceName) remained unexpanded

## Related Issues
### Common variations or similar problems:
1. **Variable group not linked to pipeline**: Ensure variable groups are explicitly referenced in YAML or linked in pipeline settings
2. **Service connection not authorized**: Check Project Settings → Pipelines → Service Connections → Approve for all pipelines
3. **Runtime vs. compile-time variable syntax confusion**: `${{ }}` expands at queue time, `$[ ]` expands at runtime - mixing these can cause issues
4. **Agent pool version incompatibility**: Outdated agents may not support certain variable expansion features
5. **Variable group scoping issues**: Variable groups may be scoped to specific pipelines or stages - verify scope settings
6. **Cached credential expiration**: Service principal credentials cached in agent may expire, requiring pool restart
7. **Pipeline decorator interference**: Custom decorators may interfere with variable resolution - review decorator configurations

---
**Tags**: azure devops, Deployment Configuration, variable expansion, variable groups, pipeline cache, agent pool, APIM deployment, ARM templates, runtime variables, pipeline decorators, cache corruption
