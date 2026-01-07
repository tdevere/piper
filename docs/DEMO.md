# PipelineExpert Demo Walkthrough

This guide provides a complete end-to-end demonstration of PipelineExpert using realistic (but fake) data. It showcases the AI-powered multi-agent troubleshooting system, PII redaction, and template learning capabilities.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Demo Scenario](#demo-scenario)
3. [Step-by-Step Walkthrough](#step-by-step-walkthrough)
4. [PII Redaction Demo](#pii-redaction-demo)
5. [Template Learning Demo](#template-learning-demo)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

**Required:**
- Node.js 18+ installed
- GitHub Copilot CLI installed (`gh extension install github/gh-copilot`)
- Access to `copilot` command in terminal
- PipelineExpert installed: `npm install -g .`

**Environment Setup:**
```bash
# Enable AI agents (required for full functionality)
export LLM_ENABLED=true
export LLM_PROVIDER=copilot

# Optional: Override copilot path if not in PATH
# export COPILOT_PATH=/custom/path/to/copilot
```

**Verify Setup:**
```bash
# Test copilot is available
copilot -p "Say hello" --allow-all-tools

# Should return a response from GitHub Copilot
```

---

## Demo Scenario

**Scenario:** A production Azure DevOps pipeline deployment is failing with authentication errors. The engineering team needs to quickly diagnose and resolve the issue to restore service.

**Fake Data Used:**
- **Azure Subscription:** `a1b2c3d4-e5f6-7890-abcd-ef1234567890` (FAKE)
- **Service Principal:** `sp-contoso-prod-deploy` (FAKE)
- **Application ID:** `12345678-90ab-cdef-1234-567890abcdef` (FAKE)
- **Tenant ID:** `98765432-10ab-cdef-9876-543210fedcba` (FAKE)
- **Pipeline:** `contoso-prod-deployment-pipeline` (FAKE)
- **Engineer:** `john.doe@contoso.com` (FAKE - demonstrates PII redaction)
- **Repository:** `https://dev.azure.com/contoso/MyProject/_git/webapp` (FAKE)

**Error Scenario:** Workload Identity Federation (WIF) authentication failing with AADSTS700016 error code.

---

## Step-by-Step Walkthrough

### 1. Create Demo Evidence Package

First, create a realistic evidence package with fake data:

```bash
# Create a temporary directory for evidence
mkdir demo-evidence
cd demo-evidence
```

**Create: pipeline-logs.txt**
```
##[section]Starting: Deploy to Production
==============================================================================
Task         : Azure CLI
Description  : Run Azure CLI commands against an Azure subscription
Version      : 2.38.3
Author       : Microsoft Corporation
==============================================================================
##[command]az login --service-principal --username 12345678-90ab-cdef-1234-567890abcdef --tenant 98765432-10ab-cdef-9876-543210fedcba --federated-token ***
ERROR: AADSTS700016: Application with identifier '12345678-90ab-cdef-1234-567890abcdef' was not found in the directory 'contoso.onmicrosoft.com'. 
This can happen if the application has not been installed by the administrator of the tenant or consented to by any user in the tenant. 
You may have sent your authentication request to the wrong tenant.
Trace ID: 4f8a9b2c-3d1e-4567-89ab-cdef12345678
Correlation ID: a1b2c3d4-5e6f-7890-abcd-ef1234567890
Timestamp: 2024-01-15 14:23:45Z
##[error]Script failed with exit code: 1
##[section]Finishing: Deploy to Production
```

**Create: service-connection.yaml**
```yaml
# Azure DevOps Service Connection Configuration
# Connection Name: Azure-Production-Connection
# Connection Type: Azure Resource Manager (Workload Identity Federation)

id: sc-prod-001
name: Azure-Production-Connection
type: AzureRM
authorization:
  scheme: WorkloadIdentityFederation
  parameters:
    serviceprincipalid: 12345678-90ab-cdef-1234-567890abcdef
    tenantid: 98765432-10ab-cdef-9876-543210fedcba
data:
  subscriptionId: a1b2c3d4-e5f6-7890-abcd-ef1234567890
  subscriptionName: Contoso-Production
  environment: AzureCloud
  scopeLevel: Subscription
  createdBy: john.doe@contoso.com
  creationMode: Automatic
```

**Create: azure-pipeline.yml**
```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

variables:
  azureSubscription: 'Azure-Production-Connection'
  resourceGroup: 'rg-contoso-prod-eastus'
  webAppName: 'webapp-contoso-prod'

stages:
- stage: Deploy
  displayName: 'Deploy to Production'
  jobs:
  - deployment: DeployWeb
    displayName: 'Deploy Web Application'
    environment: 'production'
    strategy:
      runOnce:
        deploy:
          steps:
          - task: AzureCLI@2
            displayName: 'Deploy Application'
            inputs:
              azureSubscription: $(azureSubscription)
              scriptType: 'bash'
              scriptLocation: 'inlineScript'
              inlineScript: |
                echo "Deploying to Azure Web App..."
                az webapp deployment source config-zip \
                  --resource-group $(resourceGroup) \
                  --name $(webAppName) \
                  --src $(Build.ArtifactStagingDirectory)/app.zip
```

**Create: problem-description.txt**
```
Our production deployment pipeline started failing this morning around 9:30 AM EST. 
The pipeline was working fine yesterday and no changes were made to the service connection 
configuration. The error indicates the service principal is not found in the tenant.

Pipeline: contoso-prod-deployment-pipeline
Branch: main
Last Successful Run: 2024-01-14 18:45:00 UTC
First Failed Run: 2024-01-15 09:32:15 UTC

The deployment is blocking a critical hotfix. Need urgent resolution.

Contact: john.doe@contoso.com
Team: Platform Engineering
```

**Package the evidence:**
```bash
# Zip all files
zip demo-wif-failure.zip pipeline-logs.txt service-connection.yaml azure-pipeline.yml problem-description.txt

# Move to project root
mv demo-wif-failure.zip ../
cd ..
```

---

### 2. Ingest the Case

Start the troubleshooting workflow with auto-analyze mode:

```bash
piper ingest demo-wif-failure.zip -a
```

**Expected Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 CASE INTAKE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Case ID: c4a7b9d2

📋 EXTRACTED INFORMATION:
   Description: Production deployment pipeline failing with authentication errors
   
   Key Details Detected:
   • Error Code: AADSTS700016
   • Authentication Method: Workload Identity Federation
   • Service Principal: ████████-████-████-████-████████████
   • Affected Pipeline: contoso-prod-deployment-pipeline
   • Impact: Critical hotfix blocked

📁 EVIDENCE COLLECTED:
   ✓ pipeline-logs.txt (2.1 KB) - Pipeline execution logs
   ✓ service-connection.yaml (891 B) - Service connection config
   ✓ azure-pipeline.yml (1.3 KB) - Pipeline definition
   ✓ problem-description.txt (548 B) - Issue description

🔒 PII REDACTED:
   • 1 email address redacted: ████████@contoso.com
   • 3 GUIDs redacted (service principal, tenant, subscription)
   • Original values stored securely for restoration

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔬 PROBLEM SCOPE ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 Consulting scope-agent...

📊 ANALYSIS RESULTS:

Problem Summary:
Azure DevOps pipeline authentication failing with AADSTS700016 error. The service 
principal used for Workload Identity Federation is not being recognized by Azure AD, 
despite no recent configuration changes.

Affected Components:
• Azure DevOps Service Connection (WorkloadIdentityFederation)
• Azure AD Service Principal (App Registration)
• Production deployment pipeline
• Azure CLI authentication flow

Error Patterns Identified:
• AADSTS700016: Application not found in directory
• Authentication request potentially sent to wrong tenant
• Trace ID: 4f8a9b2c-3d1e-4567-89ab-cdef12345678

Impact Assessment:
CRITICAL - Production deployment blocked, critical hotfix cannot be deployed.
Immediate resolution required.

Confidence: 92%

Proceed with classification? (Y/n): 
```

Press **Y** to continue.

---

### 3. Classification Phase

The classify-agent analyzes the problem and generates diagnostic hypotheses:

**Expected Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏷️  CLASSIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 Consulting classify-agent...

Classification: Authentication / Service Principal

Confidence: 95%

💡 HYPOTHESES GENERATED:

  1. ✓ Service Principal deleted or expired
     Evidence: AADSTS700016 indicates application not found in directory
     
  2. ✓ Incorrect Tenant ID in configuration
     Evidence: Error suggests auth request sent to wrong tenant
     
  3. ✓ Federated credential configuration missing or invalid
     Evidence: WIF-specific authentication failure pattern
     
  4. ✓ Application ID mismatch between ADO and Azure AD
     Evidence: Service principal identifier not recognized
     
  5. ✓ Azure AD conditional access policy blocking service principal
     Evidence: Recent policy changes could prevent authentication

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❓ DIAGNOSTIC QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

To generate an accurate remediation plan, please answer these questions:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### 4. Interactive Q&A Phase

The system asks diagnostic questions. Here are example responses:

**Question 1:**
```
❓ Question 1 of 5 (REQUIRED)

Does the service principal still exist in Azure AD?

Please verify in Azure Portal: Azure Active Directory > App registrations
Search for Application ID: ████████-████-████-████-████████████

Your answer: yes

Confirm this answer? (Y/n/e=edit/u=unknown): y
   ✓ Answer recorded
```

**Question 2:**
```
❓ Question 2 of 5 (REQUIRED)

Does the Tenant ID in the service connection match your Azure AD tenant?

Service Connection Tenant: ████████-████-████-████-████████████
Verify against Azure Portal > Azure Active Directory > Overview > Tenant ID

Your answer: yes

Confirm this answer? (Y/n/e=edit/u=unknown): y
   ✓ Answer recorded
```

**Question 3:**
```
❓ Question 3 of 5 (REQUIRED)

Was this service connection configured manually or automatically by Azure DevOps?

Your answer: automatic

Confirm this answer? (Y/n/e=edit/u=unknown): y
   ✓ Answer recorded
```

**Question 4:**
```
❓ Question 4 of 5 (OPTIONAL)

When was the last successful pipeline run?

Your answer: yesterday at 6:45pm

Confirm this answer? (Y/n/e=edit/u=unknown): y
   ✓ Answer recorded
```

**Question 5:**
```
❓ Question 5 of 5 (REQUIRED)

Have any Azure AD policies or conditional access rules been changed recently?

Your answer: unknown

Confirm this answer? (Y/n/e=edit/u=unknown): u
   ✓ Marked as unknown
```

**After all questions:**
```
✅ All required questions answered!
   Continuing workflow...

   ✓ Progressed to state: Plan
```

---

### 5. Remediation Plan Generation

The troubleshoot-agent generates a comprehensive action plan:

**Expected Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 REMEDIATION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Case ID: c4a7b9d2
Classification: Authentication / Service Principal
Root Cause: Federated credential missing or misconfigured for automatic service connection

📋 DIAGNOSIS:

Based on the evidence and answers provided, the most likely cause is that the federated 
credential configuration is missing from the Azure AD app registration. When Azure DevOps 
creates service connections automatically, it should create the corresponding federated 
credential in Azure AD, but this can fail silently.

The AADSTS700016 error combined with "application not found" is misleading - the application 
exists, but it lacks the proper federated credential configuration for WIF authentication.

🔧 IMMEDIATE ACTIONS:

1. Verify Federated Credential Exists
   
   PowerShell:
   ```powershell
   az ad app federated-credential list --id 12345678-90ab-cdef-1234-567890abcdef
   ```
   
   Expected: Should show a credential with issuer matching Azure DevOps
   If empty or missing ADO issuer, proceed to step 2.

2. Create Missing Federated Credential
   
   PowerShell:
   ```powershell
   # Get your Azure DevOps organization URL
   $org = "contoso"
   $project = "MyProject"
   $serviceConnectionId = "sc-prod-001"
   
   # Create federated credential
   az ad app federated-credential create \
     --id 12345678-90ab-cdef-1234-567890abcdef \
     --parameters '{
       "name": "AzureDevOps-contoso-MyProject",
       "issuer": "https://vstoken.dev.azure.com/XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
       "subject": "sc://'$org'/'$project'/Azure-Production-Connection",
       "audiences": ["api://AzureADTokenExchange"]
     }'
   ```
   
   Expected Outcome: Credential created successfully

3. Verify Service Principal Permissions
   
   PowerShell:
   ```powershell
   # Check role assignments
   az role assignment list \
     --assignee 12345678-90ab-cdef-1234-567890abcdef \
     --subscription a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
     --output table
   ```
   
   Expected: Should show "Contributor" or appropriate role on subscription/resource group

4. Test Authentication Manually
   
   PowerShell:
   ```powershell
   # Get federated token from ADO (requires running in pipeline context)
   # Or test with az login directly
   az login --service-principal \
     --username 12345678-90ab-cdef-1234-567890abcdef \
     --tenant 98765432-10ab-cdef-9876-543210fedcba \
     --allow-no-subscriptions
   ```
   
   Expected Outcome: Successful login without errors

5. Retry Pipeline Run
   
   Navigate to Azure DevOps and manually trigger the pipeline:
   https://dev.azure.com/contoso/MyProject/_build?definitionId=XXX
   
   Expected Outcome: Pipeline authenticates and proceeds past Azure CLI step

✅ VERIFICATION STEPS:

After completing the remediation:

1. Confirm federated credential is visible in Azure Portal:
   Azure AD > App registrations > [Your App] > Certificates & secrets > Federated credentials
   
   Success Criteria: Credential listed with correct issuer and subject

2. Check pipeline logs for successful authentication:
   Look for: "##[command]az login --service-principal..." with no errors
   
   Success Criteria: No AADSTS error codes, login completes

3. Verify deployment completes successfully:
   Pipeline should progress past authentication to deployment steps
   
   Success Criteria: Web app deployment starts

📚 ADDITIONAL RESOURCES:

• Workload Identity Federation: https://learn.microsoft.com/azure/devops/pipelines/library/connect-to-azure
• Troubleshooting AADSTS errors: https://learn.microsoft.com/azure/active-directory/develop/reference-aadsts-error-codes
• Azure DevOps Service Connections: https://learn.microsoft.com/azure/devops/pipelines/library/service-endpoints

⏱️  ESTIMATED RESOLUTION TIME: 15-30 minutes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💾 Remediation plan saved to: cases/c4a7b9d2/remediation-plan.md
```

---

## PII Redaction Demo

PipelineExpert automatically detects and redacts Personally Identifiable Information (PII) from all evidence and outputs.

### What Gets Redacted

**Email Addresses:**
```
Original: john.doe@contoso.com
Redacted: ████████@contoso.com
Pattern: Replaces username, preserves domain
```

**GUIDs/UUIDs:**
```
Original: 12345678-90ab-cdef-1234-567890abcdef
Redacted: ████████-████-████-████-████████████
Pattern: Preserves structure, redacts values
```

**IP Addresses:**
```
Original: 192.168.1.100
Redacted: ████.████.█.███
Pattern: Redacts octets while preserving format
```

**Access Tokens:**
```
Original: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Redacted: [REDACTED_TOKEN]
Pattern: Complete redaction of token values
```

### View Redaction Map

To see what was redacted and verify detection:

```bash
piper evidence c4a7b9d2 --show-redactions
```

**Expected Output:**
```
🔒 REDACTION MAP for Case c4a7b9d2

📧 Email Addresses (1 redacted):
   • john.doe@contoso.com → ████████@contoso.com
     Found in: problem-description.txt, service-connection.yaml

🔑 GUIDs/Identifiers (3 redacted):
   • 12345678-90ab-cdef-1234-567890abcdef (serviceprincipalid)
   • 98765432-10ab-cdef-9876-543210fedcba (tenantid)
   • a1b2c3d4-e5f6-7890-abcd-ef1234567890 (subscriptionId)

⚠️  Original values stored in: cases/c4a7b9d2/.redaction-map.json
    Use --restore flag to view originals (requires authorization)
```

### Restore Original Values

For authorized troubleshooting that requires original values:

```bash
# Restore PII for specific case (requires confirmation)
piper evidence c4a7b9d2 --restore-pii

# WARNING: This will display sensitive information
# Continue? (yes/no): yes

# Original service connection shown with real GUIDs
```

---

## Template Learning Demo

PipelineExpert learns from resolved cases to create improved templates automatically.

### How Template Learning Works

1. **Case Resolution:** When you mark a case as resolved, the solution-agent analyzes effectiveness
2. **Template Scoring:** Evaluates how well the template matched (0-100 score)
3. **Auto-Creation:** If score < 70% or no template matched, creates learned template
4. **Enable/Disable:** Learned templates can be disabled without deletion

### Demo Template Learning

After resolving the WIF authentication issue:

```bash
# Mark case as resolved
piper resolve c4a7b9d2 --notes "Federated credential was missing. Created credential in Azure AD app registration and pipeline now works."
```

**Expected Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ CASE RESOLVED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Case ID: c4a7b9d2
Resolution Time: 45 minutes

🤖 Analyzing template effectiveness...

📊 TEMPLATE EFFECTIVENESS ANALYSIS:

Original Template: authentication-wif-v1
Template Match Score: 72%

Evaluation:
✓ Classification accuracy: 95% (Authentication)
✓ Hypothesis validation: 4/5 validated (80%)
✓ Questions completion: 4/4 required answered (100%)
✓ Root cause correctly identified: Yes

Template Performance: GOOD (score: 72%)

💡 TEMPLATE LEARNING:

Based on this case resolution, a learned template has been created:

Template ID: learned-c4a7b9d2-v1
Template Name: "WIF Authentication - Missing Federated Credential"
Status: ✅ Enabled
Location: templates/learned/learned-c4a7b9d2-v1.json

Improvements in learned template:
• Added question: "Does the app registration have a federated credential configured?"
• Refined hypothesis: "Automatic service connection failed to create federated credential"
• Added error pattern: "AADSTS700016.*WorkloadIdentityFederation"
• Added keywords: "federated-credential", "wif", "automatic-connection"

This learned template will be used for similar cases in the future.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### View Template Statistics

```bash
piper templates --stats
```

**Expected Output:**
```
📊 TEMPLATE STATISTICS

Total Templates: 12
├─ Enabled: 11
├─ Disabled: 1
└─ Learned: 3

📁 Standard Templates: 9
   • authentication-wif-v1 (5 uses)
   • deployment-failed-v1 (12 uses)
   • network-connectivity-v1 (8 uses)
   • permissions-rbac-v1 (3 uses)
   • resource-quota-v1 (7 uses)
   • configuration-error-v1 (4 uses)
   • ...

🎓 Learned Templates: 3
   • learned-c4a7b9d2-v1 (WIF Missing Credential) - 2 uses
   • learned-a8f3e491-v1 (API Timeout Optimization) - 1 use
   • learned-f2d9c7b5-v1 (Container Registry Auth) - DISABLED

Use 'piper templates list' for detailed view
```

### Disable a Learned Template

If a learned template is not performing well:

```bash
piper templates disable learned-f2d9c7b5-v1
```

**Expected Output:**
```
🔧 Template Status Updated

Template: learned-f2d9c7b5-v1
Status: ❌ Disabled
Disabled At: 2024-01-15T15:30:00Z

Template will no longer be used for case matching.
To re-enable: piper templates enable learned-f2d9c7b5-v1
```

---

## Troubleshooting

### Copilot Not Available

**Symptom:**
```
Error: Command failed: copilot -p ...
'copilot' is not recognized as an internal or external command
```

**Solution:**
```bash
# Install GitHub Copilot CLI
gh extension install github/gh-copilot

# Verify installation
copilot --version
```

### Empty AI Responses

**Symptom:**
```
🤖 Consulting classify-agent...
Error: No JSON response received from agent
```

**Solution:**
```bash
# Test copilot directly
copilot -p "Say hello" --allow-all-tools

# If this fails, check copilot authentication:
gh auth status

# Re-authenticate if needed
gh auth login
```

### PII Not Being Redacted

**Symptom:**
Email addresses or GUIDs appearing in plain text in output

**Solution:**
```bash
# Check redaction policy is loaded
cat redaction-policy.json

# Ensure policy includes patterns for:
# - email-addresses
# - uuids
# - ip-addresses
# - access-tokens

# Re-run with fresh ingest to reprocess
```

### Agent Not Progressing

**Symptom:**
Workflow stops at Classify state, doesn't generate questions

**Solution:**
```bash
# Verify AI is enabled
echo $LLM_ENABLED  # Should be "true"

# Check agent profiles exist
ls agents/stage-agents/*.profile.md

# Should see:
# - classify-agent.profile.md
# - intake-agent.profile.md
# - scope-agent.profile.md
# - troubleshoot-agent.profile.md
# etc.

# Manually progress to next state
piper next <case-id>
```

### Template Not Matching

**Symptom:**
Classification works but no template matched

**Solution:**
```bash
# List available templates
piper templates list

# Check if learned templates are enabled
piper templates --stats

# Review template keywords and error patterns
cat templates/authentication-wif-v1.json

# Manually specify template
piper classify <case-id> --template authentication-wif-v1
```

---

## Next Steps

After completing this demo:

1. **Try Your Own Cases:** Use `piper ingest` with real Azure DevOps evidence
2. **Create Custom Templates:** Use `piper templates create` for your common issues
3. **Review Learned Templates:** Check `templates/learned/` for auto-generated templates
4. **Configure PII Policy:** Customize `redaction-policy.json` for your needs
5. **Integrate with CI/CD:** Call `piper` commands from your pipelines

For more information, see:
- [README.md](README.md) - Architecture and features
- [PII-USER-GUIDE.md](PII-USER-GUIDE.md) - PII protection details
- [QUICK-REFERENCE.md](QUICK-REFERENCE.md) - Command reference

---

**Questions or Issues?**
This is fake data for demonstration purposes. All GUIDs, emails, and identifiers are fabricated. For real troubleshooting scenarios, replace with your actual Azure DevOps environment details.
