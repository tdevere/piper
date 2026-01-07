# Quick Reference: Interactive Question Guidance

## 🎯 User Commands During Question Prompt

When prompted with a question, users can type:

| Command | Action | Use When |
|---------|--------|----------|
| `help` or `?` | Show verification guidance | Don't know how to find/verify information |
| `example` or `examples` | Show sample answers | Unsure of answer format or what to provide |
| `<file-path>` | Provide evidence file | Question requires verification (⚠️ marked) |
| `<text>` | Provide text answer | Question accepts text (no ⚠️) |
| `Enter` | Skip question | Don't have information yet |

---

## 📝 Question Indicators

### Evidence Required ⚠️
```
Q: What is the exact deployment error code and message?
   [q1] REQUIRED
   ⚠️  Evidence required - "trust but verify"
```
→ Must provide file path (screenshot, log, config)

### Text Answer Accepted
```
Q: What deployment method was used?
   [q3] REQUIRED
```
→ Can provide text answer

---

## 💡 Example Session

```bash
$ piper analyze abc123

Q: Have you verified the Service Connection is authorized?
   [q2] REQUIRED
   ⚠️  Evidence required - "trust but verify"
   Answer, "help" for guidance, "example" for samples, or Enter to skip: help

   📚 HOW TO VERIFY:
   [Shows step-by-step instructions]
   
   📁 EVIDENCE REQUIRED:
   [Shows what to provide]

   Answer, "help" for guidance, "example" for samples, or Enter to skip: example

   💡 EXAMPLES:
   [Shows sample answers]

   Answer, "help" for guidance, "example" for samples, or Enter to skip: ./screenshots/auth.png
   ✓ Evidence captured: auth.png
   ✓ Answer linked to evidence
```

---

## 🔧 For Template Authors

Add to questions in templates:

```json
{
  "id": "q1",
  "ask": "Question text?",
  "required": true,
  "expectedFormat": "text",
  "guidance": "1. Step one\n2. Step two\n3. Take screenshot",
  "examples": [
    "Example answer 1",
    "Example answer 2"
  ],
  "verificationRequired": true
}
```

**Fields:**
- `guidance` - How to verify/find information (newline-separated steps)
- `examples` - Array of sample answers
- `verificationRequired` - true = requires evidence file, false = accepts text

---

## ✅ Benefits

| Before | After |
|--------|-------|
| User stuck → Skips question | User stuck → Types "help" → Gets guidance |
| No examples | Types "example" → Sees samples |
| Text answers | Evidence files required |
| No verification | Trust but verify |
| Incomplete data | Complete, verified data |

---

## 🎓 Philosophy

**"Trust but Verify"**
- Critical questions require evidence
- Evidence is ingested (not copy/pasted)
- Evidence is linked to answers
- Creates complete audit trail

**Self-Service First**
- Users can get unstuck themselves
- Guidance teaches proper verification
- Examples show what good looks like
- No need to contact support

**Maintain Pressure**
- Still need to answer questions
- But tools provided to do it right
- Friendly errors allow retry
- Skip only if truly can't answer

---

## 📁 Files Modified

- [src/types.ts](src/types.ts) - Enhanced Question interface
- [src/cli.ts](src/cli.ts) - Added handleInteractiveQuestion()
- [templates/deployment-failed.json](templates/deployment-failed.json) - Added guidance/examples

---

## 🚀 Quick Start

1. **Create case:** `piper new "Problem description"`
2. **Add evidence:** `piper add-evidence <caseId> <file>`
3. **Analyze:** `piper analyze <caseId>`
4. **During questions:**
   - Type `help` for guidance
   - Type `example` for samples
   - Provide file path or text
   - Press Enter to skip

---

## 🎯 Status

✅ **IMPLEMENTED AND READY**
- All features working
- Build successful
- Documentation complete
- Test case created

---

## 📞 Support

For questions about:
- **Using the system:** Type `help` during question prompts
- **Template authoring:** See [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md)
- **Architecture:** See [demo-interactive-help.md](demo-interactive-help.md)
- **Before/After:** See [BEFORE-AFTER-GUIDE.md](BEFORE-AFTER-GUIDE.md)
