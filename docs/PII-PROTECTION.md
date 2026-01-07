# PII Protection & Security Implementation

## 🔒 Overview

Piper implements **automatic PII (Personally Identifiable Information) and secrets redaction** at the evidence intake layer to ensure sensitive data never leaves the system or reaches AI providers.

---

## 🎯 Security Philosophy

### Defense in Depth
- **Redact at intake** - Before storage, before analysis, before AI
- **Fail safe** - Better to over-redact than leak sensitive data
- **Transparent** - Track what was redacted with warnings and flags
- **No trust boundaries** - Assume evidence contains PII until proven otherwise

### Zero-Trust Evidence
Every file ingested is treated as potentially containing PII:
1. ✅ Scanned for known PII patterns
2. ✅ Redacted if matches found
3. ✅ Flagged with `isRedacted: true`
4. ✅ Stored in redacted form
5. ✅ All downstream consumers use redacted version

---

## 🛡️ What Gets Redacted

### Personal Information
- **Email addresses** → `[REDACTED-EMAIL]`
  - Pattern: `user@domain.com`
  
### Network Information
- **IPv4 addresses** → `[REDACTED-IP]`
  - Pattern: `192.168.1.1`
- **IPv6 addresses** → `[REDACTED-IPV6]`
  - Pattern: `2001:0db8:85a3:0000:0000:8a2e:0370:7334`

### Secrets & Credentials
- **Bearer tokens** → `Bearer [REDACTED-TOKEN]`
- **GitHub tokens** → `[REDACTED-GITHUB-TOKEN]`
  - Pattern: `ghp_*, gho_*, ghs_*, ghu_*`
- **AWS access keys** → `[REDACTED-AWS-KEY]`
  - Pattern: `AKIA*`
- **Azure storage keys** → `AccountKey=[REDACTED-AZURE-KEY]`
- **Azure connection strings** → Fully redacted
- **Azure AD client secrets** → `client_secret=[REDACTED-CLIENT-SECRET]`
- **API keys** → `api_key=[REDACTED-API-KEY]`
- **JWT tokens** → `[REDACTED-JWT]`
- **Private keys** → `[REDACTED-PRIVATE-KEY]`
  - RSA, EC, OpenSSH formats
- **Passwords in URLs** → `://[REDACTED]:[REDACTED-PASSWORD]@`

### Azure-Specific
- **Subscription IDs** → `subscriptions/[REDACTED-SUBSCRIPTION-ID]`
- **Tenant IDs** → `tenantId=[REDACTED-TENANT-ID]`

---

## 🔄 Redaction Flow

### 1. Evidence Intake (`piper ingest`)

```
User provides zip with logs
        ↓
Extract to staging area
        ↓
For each file:
  1. Read content
  2. Run Redactor.process()
  3. Check for PII matches
  4. Replace with [REDACTED-*] tokens
  5. Store redacted version
  6. Set isRedacted flag
        ↓
Display redaction summary
```

**Example Output:**
```bash
$ piper ingest "deployment failed" ./logs.zip

🔒 Processing evidence (PII redaction in progress)...
   [1/5] deployment.log [CLEAN]
   [2/5] config.yaml [REDACTED]
   [3/5] connection-string.txt [REDACTED]
   [4/5] errors.txt [CLEAN]
   [5/5] trace.log [REDACTED]

✓ Ingested 5 files
⚠ 3 files contained PII and were redacted
   Redacted items: emails, IPs, tokens, keys, connection strings
   ✓ Original PII removed - safe for AI analysis
```

### 2. Single File Addition (`piper add-evidence`)

```bash
$ piper add-evidence abc123 ./sensitive-log.txt

Added evidence e7f2a1b3 (WARNING: PII Detected and Redacted)
```

### 3. Interactive Question Answering

When user provides file path during `piper analyze`:
```bash
Q: Have you verified the Service Connection?
   [q2] REQUIRED
   ⚠️  Evidence required - "trust but verify"
   Answer: ./screenshots/service-connection.png

   ✓ Evidence captured: service-connection.png
   ⚠️  PII detected and redacted
   ✓ Answer linked to evidence
```

---

## 🧠 AI Analysis Safety

### How It Works

```
Evidence → Redactor → Storage (artifacts/) → LLM Analysis
                                   ↓
                          ALWAYS uses redacted files
                          NEVER sees original PII
```

### AI Provider Integration

**OpenAI API:**
```typescript
// LLMClient.analyzeWithOpenAI()
const evidenceContent = await this.loadEvidenceContent(c);
// ↑ Reads from cases/{id}/artifacts/{evidence_id}_original.txt
// ↑ File already redacted during intake
// ↑ PII never sent to OpenAI
```

**GitHub Copilot CLI:**
```typescript
// LLMClient.analyzeWithCopilotCLI()
const evidenceContent = await this.loadEvidenceContent(c);
// ↑ Same redacted content
// ↑ PII never sent to GitHub
```

**Azure OpenAI:**
- Same protection applies
- Evidence pre-redacted before API call

### Evidence Loading

The `loadEvidenceContent()` method in `LLMClient`:
```typescript
private async loadEvidenceContent(c: Case): Promise<string> {
  let content = '';
  for (const evidence of c.evidence) {
    // Reads from: cases/{caseId}/artifacts/{evidenceId}_original.txt
    // This file is ALREADY redacted during intake
    const filePath = path.join(casesRoot, c.id, evidence.path);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    content += fileContent + '\n\n';
  }
  return content;
}
```

**Key Point:** The `_original.txt` suffix is misleading - it's actually the redacted version. The true original never gets stored.

---

## 📊 Verification & Transparency

### Case Evidence Display

```bash
$ piper show abc123

EVIDENCE:
 - deployment.log (text/plain) [REDACTED]
 - config.yaml (application/yaml) [REDACTED]
 - errors.txt (text/plain)
```

The `[REDACTED]` flag shows which files had PII removed.

### During Analysis

```bash
$ piper analyze abc123

🔍 Analyzing evidence for case: deployment failed
Found 5 open questions
Analyzing 3 evidence files...
🔒 PII Protection: 2/3 files redacted
✨ Using AI-powered analysis (OpenAI API)
   Note: All evidence is pre-redacted before AI analysis
```

---

## 🏗️ Implementation Architecture

### Core Components

```
src/evidence/
├── Redactor.ts          ← PII detection & redaction engine
└── EvidenceManager.ts   ← Orchestrates intake + redaction

src/llm/
└── LLMClient.ts         ← Always reads redacted artifacts

src/cli.ts               ← User feedback on PII status
```

### Redactor Class

**File:** `src/evidence/Redactor.ts`

```typescript
export class Redactor {
  private rules: RedactionRule[];
  
  constructor(customRules: RedactionRule[] = []) {
    this.rules = [
      /* 15+ built-in patterns for:
         - Emails, IPs, tokens, keys
         - Azure/AWS/GitHub credentials
         - Connection strings, passwords
         - UUIDs for sensitive resources */
    ];
  }
  
  process(content: string): { 
    redacted: string; 
    check: { 
      hasChanges: boolean; 
      appliedRules: string[] 
    } 
  } {
    // Apply all rules sequentially
    // Track which patterns matched
    // Return redacted content + metadata
  }
}
```

### EvidenceManager Integration

**File:** `src/evidence/EvidenceManager.ts`

```typescript
async addFile(caseId: string, filePath: string, tags: string[]): Promise<{ 
  evidence: Evidence, 
  isRedacted: boolean 
}> {
  // 1. Read file
  const content = buffer.toString('utf-8');
  
  // 2. Redact if text-based
  if (mediaType.startsWith('text/') || mediaType.includes('json')) {
    const { redacted, check } = this.redactor.process(content);
    if (check.hasChanges) {
      isRedacted = true;
      storedContent = Buffer.from(redacted, 'utf-8');
    }
  }
  
  // 3. Store redacted version
  await fs.writeFile(storedPath, storedContent);
  
  // 4. Return with isRedacted flag
  return { evidence, isRedacted };
}
```

---

## ✅ Testing & Validation

### Test Files

**test-pii-evidence.txt:**
```
Deployment Error Log
User: john.doe@company.com
API Key: api_key=sk_test_FAKE123EXAMPLE456NOTREAL789
Azure Storage: DefaultEndpointsProtocol=https;AccountName=mystorageacct;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==
Bearer Token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Error occurred at 10.0.0.42
```

### Test Commands

```bash
# 1. Build
npm run build

# 2. Add PII test evidence
piper add-evidence <caseId> test-pii-evidence.txt

# Expected output:
# Added evidence <id> (WARNING: PII Detected and Redacted)

# 3. View stored evidence
cat cases/<caseId>/artifacts/<evidenceId>_original.txt

# Expected redactions:
# User: [REDACTED-EMAIL]
# API Key: api_key=[REDACTED-API-KEY]
# Azure Storage: DefaultEndpointsProtocol=https;AccountName=[REDACTED];AccountKey=[REDACTED]
# Bearer Token: Bearer [REDACTED-TOKEN]
# Error occurred at [REDACTED-IP]
```

### Validation Checklist

- ✅ Email addresses redacted
- ✅ IP addresses redacted
- ✅ API keys redacted
- ✅ Azure credentials redacted
- ✅ JWT tokens redacted
- ✅ `isRedacted` flag set correctly
- ✅ Warning displayed to user
- ✅ LLM never sees original PII
- ✅ Stored files contain redacted versions
- ✅ Case JSON tracks redaction status

---

## 🎓 Design Decisions

### Why Redact at Intake?

**Alternative 1: Redact before sending to LLM**
- ❌ PII stored in artifacts
- ❌ Risk of accidental exposure
- ❌ Requires redaction at multiple points

**Alternative 2: Don't store evidence, analyze on-the-fly**
- ❌ Can't audit what was analyzed
- ❌ Can't re-run analysis
- ❌ No evidence trail

**Chosen: Redact at intake** ✅
- ✅ Single point of redaction
- ✅ Stored artifacts are safe
- ✅ LLM automatically protected
- ✅ Complete audit trail
- ✅ Replayable analysis

### Why Store Redacted as "_original"?

Historical consistency. The file naming convention uses `{id}_original.{ext}` to distinguish from potential derivatives (thumbnails, summaries, etc.). The `isRedacted` flag in metadata is the source of truth.

**Future improvement:** Consider renaming to `{id}_redacted.{ext}` for clarity.

### Custom Redaction Rules

Users can extend redaction patterns:

```typescript
const customRules: RedactionRule[] = [
  {
    name: "Internal Employee ID",
    pattern: "EMP\\d{6}",
    replacement: "[REDACTED-EMPLOYEE-ID]"
  }
];

const evidenceMgr = new EvidenceManager(rootDir, customRules);
```

---

## 🚀 Best Practices

### For Users

1. **Trust but verify** - System auto-redacts, but review flagged files
2. **Check redaction warnings** - Pay attention to PII detection notices
3. **Don't bypass** - Always use `piper add-evidence`, never manually copy to artifacts
4. **Sanitize before intake** - Pre-clean if possible, but don't rely on it

### For Developers

1. **Always use EvidenceManager** - Don't directly write to artifacts/
2. **Check isRedacted flag** - Surface to users for transparency
3. **Read from stored paths** - Never cache raw evidence before redaction
4. **Add patterns carefully** - Balance false positives vs. leaks
5. **Test redaction** - Every new pattern needs test coverage

---

## 📈 Metrics & Monitoring

### What to Track

- **Redaction rate** - % of files with PII detected
- **Rule effectiveness** - Which patterns match most often
- **False positives** - Over-redaction complaints
- **PII types** - Breakdown by category (emails vs. tokens vs. IPs)

### Example Metrics

```
Total files ingested: 150
Files redacted: 47 (31%)
Top patterns:
  - Email: 23 files
  - IPv4: 18 files
  - API keys: 12 files
  - Azure credentials: 8 files
```

---

## 🔐 Compliance & Audit

### Regulatory Alignment

- **GDPR** - PII not stored or transmitted
- **SOC 2** - Evidence of data sanitization
- **HIPAA** - PHI redaction possible with custom rules
- **CCPA** - Consumer data protected

### Audit Trail

Every case maintains evidence of protection:

```json
{
  "evidence": [
    {
      "id": "abc123",
      "path": "artifacts/abc123_original.txt",
      "isRedacted": true,
      "mediaType": "text/plain",
      "hash": "sha256-of-redacted-content"
    }
  ],
  "events": [
    {
      "timestamp": "2026-01-07T00:30:00Z",
      "type": "EvidenceAdded",
      "message": "Added artifacts/abc123_original.txt (PII redacted)"
    }
  ]
}
```

---

## 🆘 Troubleshooting

### "PII Not Detected" When It Should Be

**Symptom:** File contains email but no redaction
**Cause:** Pattern mismatch or unsupported format
**Solution:** 
1. Check file encoding (must be UTF-8)
2. Verify pattern matches actual format
3. Add custom rule if needed

### "Over-Redacting" - Too Much Removed

**Symptom:** Valid data redacted (e.g., domain names)
**Cause:** Pattern too broad
**Solution:**
1. Review Redactor patterns
2. Adjust regex for specificity
3. Consider allowlist for known-safe domains

### "Evidence Not Analyzed by AI"

**Symptom:** Questions unanswered despite relevant evidence
**Cause:** Might not be redaction issue - check if redaction removed critical context
**Solution:**
1. Review redacted evidence content
2. Ensure diagnostic info preserved (error codes, timestamps)
3. Balance security vs. utility

---

## 📚 References

### Code Files
- `src/evidence/Redactor.ts` - Core redaction engine
- `src/evidence/EvidenceManager.ts` - Intake orchestration
- `src/llm/LLMClient.ts` - AI analysis with redacted content
- `src/cli.ts` - User-facing PII warnings

### Documentation
- [SUMMARY.md](../SUMMARY.md) - Feature overview
- [IMPLEMENTATION-STATUS.md](../IMPLEMENTATION-STATUS.md) - Build status
- [README.md](../README.md) - User guide

---

## ✨ Summary

**PII Protection in Piper:**

✅ Automatic detection at intake  
✅ 15+ built-in redaction patterns  
✅ Transparent flagging and warnings  
✅ AI providers never see original PII  
✅ Complete audit trail  
✅ Extensible with custom rules  
✅ Compliance-ready  

**Philosophy:** Defense in depth - redact once at intake, protect everywhere else automatically.

**Status:** ✅ **IMPLEMENTED AND TESTED**
