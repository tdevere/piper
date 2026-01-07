/**
 * Redactor - PII and Secrets Protection
 * 
 * This class provides automatic detection and redaction of personally identifiable 
 * information (PII) and secrets from evidence files during intake.
 * 
 * SECURITY PHILOSOPHY:
 * - "Defense in Depth" - Redact at intake, before storage or AI analysis
 * - "Fail Safe" - Better to over-redact than leak sensitive data
 * - "Audit Trail" - Track what was redacted for transparency
 * 
 * WHAT IS REDACTED:
 * - Email addresses
 * - IP addresses (IPv4 & IPv6)
 * - API keys and tokens (Bearer, GitHub, AWS, Azure)
 * - Connection strings (Azure, databases)
 * - Private keys (RSA, EC, OpenSSH)
 * - Subscription and Tenant IDs (GUIDs)
 * - Passwords in URLs
 * - Azure resource names (Resource Groups, Storage Accounts)
 * - ARM template and policy file names
 * - Build and Run IDs
 * - Windows usernames and machine names
 * - Azure DevOps agent names
 * - Build artifact identifiers
 * 
 * WHEN REDACTION HAPPENS:
 * 1. During `piper ingest <zipPath>` - all extracted files processed
 * 2. During `piper add-evidence <file>` - single file processed
 * 3. During interactive question answering - if file path provided
 * 
 * REDACTION FLOW:
 * Evidence File → Redactor.process() → Redacted Content → Storage → AI Analysis
 * 
 * AI SAFETY:
 * - LLMClient always reads from redacted artifacts
 * - Original PII never sent to OpenAI, GitHub Copilot, or Azure
 * - Evidence extracts use redacted content
 * 
 * @example
 * const redactor = new Redactor();
 * const result = redactor.process("User: john@company.com");
 * // result.redacted === "User: [REDACTED-EMAIL]"
 * // result.check.hasChanges === true
 * // result.check.appliedRules === ["Email"]
 */
export interface RedactionRule {
    name: string;
    pattern: string; // regex string
    replacement: string;
    description?: string;
}

export class Redactor {
    private rules: RedactionRule[];

    constructor(customRules: RedactionRule[] = []) {
        this.rules = [
            // Built-in defaults
            {
                name: "Email",
                pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
                replacement: "[REDACTED-EMAIL]"
            },
            {
                name: "IPv4",
                pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b",
                replacement: "[REDACTED-IP]"
            },
            {
                name: "IPv6",
                pattern: "(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}",
                replacement: "[REDACTED-IPV6]"
            },
            {
                name: "Bearer Token",
                pattern: "Bearer\\s+[a-zA-Z0-9\\-_\\.]+",
                replacement: "Bearer [REDACTED-TOKEN]"
            },
            // GitHub Patterns - High Confidence Secrets
            {
                name: "Azure Storage Account Key",
                pattern: "AccountKey=[a-zA-Z0-9+/]{86}==",
                replacement: "AccountKey=[REDACTED-AZURE-KEY]"
            },
            {
                name: "Azure Connection String",
                pattern: "DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+",
                replacement: "DefaultEndpointsProtocol=https;AccountName=[REDACTED];AccountKey=[REDACTED]"
            },
            {
                name: "AWS Access Key",
                pattern: "AKIA[0-9A-Z]{16}",
                replacement: "[REDACTED-AWS-KEY]"
            },
            {
                name: "GitHub Token",
                pattern: "gh[pousr]_[A-Za-z0-9_]{36,}",
                replacement: "[REDACTED-GITHUB-TOKEN]"
            },
            {
                name: "Azure AD Client Secret",
                pattern: "client_secret=[a-zA-Z0-9~_\\-\\.]{32,}",
                replacement: "client_secret=[REDACTED-CLIENT-SECRET]"
            },
            {
                name: "Generic API Key",
                pattern: "(?:api[_-]?key|apikey)\\s*[:=]\\s*['\"]?[a-zA-Z0-9_\\-]{20,}['\"]?",
                replacement: "api_key=[REDACTED-API-KEY]"
            },
            {
                name: "JWT Token",
                pattern: "eyJ[a-zA-Z0-9_-]*\\.eyJ[a-zA-Z0-9_-]*\\.[a-zA-Z0-9_-]*",
                replacement: "[REDACTED-JWT]"
            },
            {
                name: "Private Key Header",
                pattern: "-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\\s\\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
                replacement: "[REDACTED-PRIVATE-KEY]"
            },
            {
                name: "Password in URL",
                pattern: "://[^:@\\s]+:([^@\\s]+)@",
                replacement: "://[REDACTED]:[REDACTED-PASSWORD]@"
            },
            {
                name: "Azure Subscription ID",
                pattern: "subscriptions/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}",
                replacement: "subscriptions/[REDACTED-SUBSCRIPTION-ID]"
            },
            {
                name: "Azure Subscription GUID",
                pattern: "\\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\b",
                replacement: "[REDACTED-GUID]"
            },
            {
                name: "Azure Tenant ID",
                pattern: "(?:tenant|tenantId)[\"']?\\s*[:=]\\s*[\"']?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}",
                replacement: "tenantId=[REDACTED-TENANT-ID]"
            },
            {
                name: "Azure Resource Group",
                pattern: "\\brg-[a-zA-Z0-9-]+\\b",
                replacement: "[REDACTED-RESOURCE-GROUP]"
            },
            {
                name: "Azure Storage Account",
                pattern: "\\b[a-z0-9]{3,24}\\.(blob|file|queue|table)\\.core\\.windows\\.net\\b",
                replacement: "[REDACTED-STORAGE].\\1.core.windows.net"
            },
            {
                name: "ARM Template File",
                pattern: "\\b[a-zA-Z0-9_-]+\\.template\\.json\\b",
                replacement: "[REDACTED-TEMPLATE].json"
            },
            {
                name: "Policy XML File",
                pattern: "\\b[a-zA-Z0-9_-]+(?:Policy|policy)\\.xml\\b",
                replacement: "[REDACTED-POLICY].xml"
            },
            {
                name: "Build/Run ID",
                pattern: "(?:Build ID|Run ID|build #)\\s*:?\\s*#?\\d+",
                replacement: "Build ID: [REDACTED-BUILD-ID]"
            },
            {
                name: "Windows Username",
                pattern: "\\b[A-Z]{2,}-[A-Za-z0-9]+\\$?\\b",
                replacement: "[REDACTED-USER]"
            },
            {
                name: "Service Principal or Subscription Name",
                pattern: "\\b[A-Z]{2,}-[A-Za-z]+[A-Z]+[0-9]+-[a-z]+(?:-[0-9]+)?\\b",
                replacement: "[REDACTED-PRINCIPAL]"
            },
            {
                name: "Username Suffix Pattern",
                pattern: "-[a-z]{3,}(?:re|er|ve|an|el|us|on)(?:-[0-9]+)?\\b",
                replacement: "-[REDACTED]"
            },
            {
                name: "Azure DevOps Agent Name",
                pattern: "Agent name: '[^']+",
                replacement: "Agent name: '[REDACTED-AGENT]"
            },
            {
                name: "Machine Name in Path",
                pattern: "\\\\\\\\[A-Za-z0-9-]+\\\\",
                replacement: "\\\\[REDACTED-MACHINE]\\"
            },
            {
                name: "Build Artifact Path",
                pattern: "\\b[a-z]+-[0-9]{8}-[0-9]{6}-[a-z0-9]+\\b",
                replacement: "[REDACTED-ARTIFACT]"
            },
            ...customRules
        ];
    }

    process(content: string): { redacted: string; check: { hasChanges: boolean; appliedRules: string[] } } {
        let current = content;
        const applied: string[] = [];

        for (const rule of this.rules) {
            const regex = new RegExp(rule.pattern, 'g');
            if (regex.test(current)) {
                current = current.replace(regex, rule.replacement);
                applied.push(rule.name);
            }
        }

        return {
            redacted: current,
            check: {
                hasChanges: applied.length > 0,
                appliedRules: applied
            }
        };
    }
}
