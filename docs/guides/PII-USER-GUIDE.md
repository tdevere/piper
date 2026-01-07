# Piper - PII Protection & User Guidance Quick Reference

## 🔒 PII Protection

### What Gets Redacted Automatically?
- ✅ Email addresses
- ✅ IP addresses (IPv4 & IPv6)
- ✅ API keys and tokens
- ✅ Azure/AWS/GitHub credentials
- ✅ Connection strings
- ✅ Private keys
- ✅ Passwords in URLs
- ✅ Subscription & Tenant IDs

### When Does Redaction Happen?
1. **During intake:** `piper ingest <problem> <zipPath>`
2. **Adding evidence:** `piper add-evidence <caseId> <file>`
3. **Interactive Q&A:** When providing file paths

### How Do I Know If PII Was Found?
Look for these indicators:
```bash
# During add-evidence
Added evidence abc123 (WARNING: PII Detected and Redacted)

# During ingest
⚠ 3 files contained PII and were redacted
   Redacted items: emails, IPs, tokens, keys, connection strings
   ✓ Original PII removed - safe for AI analysis

# During analyze
🔒 PII Protection: 4/22 files redacted
```

### Is My Data Safe for AI Analysis?
✅ **YES** - All evidence is redacted BEFORE being sent to:
- OpenAI API
- GitHub Copilot CLI
- Azure OpenAI

---

## 💡 User Guidance Features

### Interactive Help System

When answering questions, you have these options:

| Command | What It Does | When to Use |
|---------|-------------|-------------|
| `help` or `?` | Shows verification steps | Don't know how to verify |
| `example` or `examples` | Shows sample answers | Need to see what good looks like |
| `<file-path>` | Ingests evidence | Question requires proof |
| `<text-answer>` | Provides text response | Simple text question |
| `Enter` (blank) | Skips question | Don't have info yet |

### Example Session

```bash
$ piper analyze abc123

Q: Have you verified the Service Connection is authorized?
   [q2] REQUIRED
   ⚠️  Evidence required - "trust but verify"
   Answer, "help" for guidance, "example" for samples, or Enter to skip: help

   📚 HOW TO VERIFY:
   1. Navigate to Azure DevOps → Project Settings
   2. Click 'Service Connections' in the menu
   3. Find your Azure subscription connection
   4. Check 'Security' tab for authorization status
   5. Take screenshot showing connection name and status
   
   📁 EVIDENCE REQUIRED:
   - Provide file path to screenshot, log, or config
   - Evidence will be ingested and linked to this answer

   Answer: example

   💡 EXAMPLES:
   1. Yes, verified - connection shows 'Ready' status
   2. No, connection shows 'Authorization Required'
   3. Yes, authorized for all pipelines in project

   Answer: ./screenshots/service-connection.png
   
   ✓ Evidence captured: service-connection.png
   ✓ Answer linked to evidence
```

---

## 🎯 Common Workflows

### Workflow 1: Start New Case with Evidence

```bash
# 1. Ingest case with logs (PII auto-redacted)
piper ingest "deployment failed" ./deployment-logs.zip

# Output shows:
# 🔒 Processing evidence (PII redaction in progress)...
# ⚠ 3 files contained PII and were redacted

# 2. Begin analysis
piper next abc123

# 3. Answer questions with guidance
piper analyze abc123
```

### Workflow 2: Add Evidence to Existing Case

```bash
# Add file (PII auto-redacted)
piper add-evidence abc123 ./new-log.txt

# Output:
# Added evidence xyz789 (WARNING: PII Detected and Redacted)

# Re-analyze with new evidence
piper analyze abc123
```

### Workflow 3: Using Interactive Help

```bash
piper analyze abc123

# When stuck on a question:
Answer: help           # Shows how to verify
Answer: example        # Shows sample answers
Answer: ./evidence.png # Provides evidence file
```

---

## 🚨 Important Notes

### ⚠️ DO
- ✅ Use `piper ingest` or `piper add-evidence` for all files
- ✅ Review redaction warnings - check if critical data preserved
- ✅ Use interactive help when unsure
- ✅ Provide evidence for critical questions

### ❌ DON'T
- ❌ Manually copy files to `cases/{id}/artifacts/`
- ❌ Skip PII warnings without review
- ❌ Answer critical questions without evidence
- ❌ Bypass the intake flow

---

## 🔍 Verification Checklist

Before completing a case:

- [ ] All evidence ingested via proper commands
- [ ] PII redaction warnings reviewed
- [ ] Critical questions answered with evidence
- [ ] Evidence files linked to answers
- [ ] Case shows `isRedacted` flags where appropriate

---

## 📊 Status Indicators

### Evidence Status
- `[CLEAN]` - No PII detected
- `[REDACTED]` - PII found and removed
- `(WARNING: PII Detected and Redacted)` - User warning

### Question Status
- `REQUIRED` - Must answer to proceed
- `Optional` - Can skip if unknown
- `⚠️ Evidence required` - Needs proof file

### PII Protection Status
```bash
🔒 PII Protection: 4/22 files redacted
✨ Using AI-powered analysis (OpenAI API)
   Note: All evidence is pre-redacted before AI analysis
```

---

## 🆘 Troubleshooting

### "PII Not Detected When It Should Be"
**Problem:** File contains sensitive data but no warning shown

**Possible Causes:**
1. File not text-based (binary files not scanned)
2. Non-UTF-8 encoding
3. Pattern not recognized

**Solution:**
1. Check file type and encoding
2. Manually sanitize if needed
3. Report pattern to admin for addition

### "Too Much Redacted"
**Problem:** Valid diagnostic info removed

**Possible Causes:**
1. Pattern too broad (e.g., all UUIDs redacted)
2. False positive match

**Solution:**
1. Review what was redacted
2. Provide clarification in text answer
3. Report to admin for pattern tuning

### "Question Requires Evidence But Don't Have File"
**Problem:** Can't provide screenshot/log file

**Possible Causes:**
1. Evidence not yet collected
2. Evidence exists but don't know how to capture

**Solution:**
1. Type `help` to see verification steps
2. Follow guidance to collect evidence
3. Return later with file
4. Or skip and document in text answer

---

## 📚 More Information

- **Full Documentation:** [docs/PII-PROTECTION.md](../docs/PII-PROTECTION.md)
- **Implementation Details:** [IMPLEMENTATION_FINAL.md](../IMPLEMENTATION_FINAL.md)
- **User Guide:** [README.md](../README.md)
- **Interactive Demo:** [demo-interactive-help.md](../demo-interactive-help.md)

---

## ✨ Quick Tips

1. **Always use proper intake** - PII protection only works if you use `piper ingest` or `piper add-evidence`
2. **Review warnings** - PII detection isn't perfect, verify critical data preserved
3. **Use help liberally** - Type `help` whenever stuck, it's there to guide you
4. **Provide evidence** - "Trust but verify" - evidence beats claims
5. **Check PII status** - Look for the 🔒 PII Protection message during analysis

---

**Version:** 1.0  
**Last Updated:** January 7, 2026  
**Status:** ✅ Production Ready
