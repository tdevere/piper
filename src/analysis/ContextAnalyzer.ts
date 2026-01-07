import { Case, Evidence } from '../types';

export interface AnalysisRule {
    name: string;
    pattern: RegExp;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    category: string;
}

export interface AnalysisFindings {
    context: string;
    criticalIssues: Array<{ rule: string; matches: string[]; evidence: string[] }>;
    recommendations: string[];
    keyFindings: string[];
    nextSteps: string[];
}

export class ContextAnalyzer {
    private pipelineRules: AnalysisRule[] = [
        {
            name: 'Pipeline Error',
            pattern: /##\[error\]([^\n]+)/gi,
            severity: 'critical',
            description: 'Azure DevOps pipeline error detected',
            category: 'error'
        },
        {
            name: 'Pipeline Warning',
            pattern: /##\[warning\]([^\n]+)/gi,
            severity: 'medium',
            description: 'Azure DevOps pipeline warning detected',
            category: 'warning'
        },
        {
            name: 'Task Failed',
            pattern: /##\[section\]Finishing:.*\n.*##\[error\]/gi,
            severity: 'critical',
            description: 'Pipeline task failed',
            category: 'task_failure'
        },
        {
            name: 'Authorization Error',
            pattern: /(401|403|Unauthorized|Forbidden|Access.*denied)/gi,
            severity: 'high',
            description: 'Authorization or permission issue',
            category: 'auth'
        },
        {
            name: 'Deployment Failed',
            pattern: /DeploymentFailed|deployment.*failed|provisioning.*failed/gi,
            severity: 'critical',
            description: 'Azure deployment failure',
            category: 'deployment'
        }
    ];

    private azureRules: AnalysisRule[] = [
        {
            name: 'ARM Template Error',
            pattern: /(InvalidTemplate|InvalidTemplateDeployment|TemplateValidationError)/gi,
            severity: 'critical',
            description: 'ARM template validation or deployment error',
            category: 'template'
        },
        {
            name: 'Resource Conflict',
            pattern: /(ResourceExists|Conflict|already exists)/gi,
            severity: 'high',
            description: 'Resource name conflict',
            category: 'conflict'
        },
        {
            name: 'Quota Exceeded',
            pattern: /(QuotaExceeded|quota.*exceeded|limit.*reached)/gi,
            severity: 'high',
            description: 'Azure quota or limit exceeded',
            category: 'quota'
        },
        {
            name: 'Network Error',
            pattern: /(ConnectionTimeout|NetworkError|DNS.*failed)/gi,
            severity: 'high',
            description: 'Network connectivity issue',
            category: 'network'
        }
    ];

    private kubernetesRules: AnalysisRule[] = [
        {
            name: 'Pod CrashLoop',
            pattern: /(CrashLoopBackOff|ImagePullBackOff)/gi,
            severity: 'critical',
            description: 'Pod failing to start',
            category: 'pod_failure'
        },
        {
            name: 'Resource Limits',
            pattern: /(OOMKilled|CPU.*throttled|memory.*limit)/gi,
            severity: 'high',
            description: 'Resource constraint issue',
            category: 'resources'
        }
    ];

    async analyze(c: Case): Promise<AnalysisFindings> {
        const context = c.context || 'general';
        const rules = this.getRulesForContext(context);
        
        const findings: AnalysisFindings = {
            context,
            criticalIssues: [],
            recommendations: [],
            keyFindings: [],
            nextSteps: []
        };

        // Load all evidence content
        const evidenceContent = await this.loadEvidenceContent(c);
        
        // Apply rules
        for (const rule of rules) {
            const matches = this.findMatches(evidenceContent, rule.pattern);
            if (matches.length > 0) {
                findings.criticalIssues.push({
                    rule: rule.name,
                    matches: matches.slice(0, 5), // Limit to top 5
                    evidence: c.evidence.map(e => e.originalPath || e.path)
                });

                // Generate key finding
                findings.keyFindings.push(`${rule.severity.toUpperCase()}: ${rule.description} (${matches.length} occurrence${matches.length > 1 ? 's' : ''})`);
            }
        }

        // Generate recommendations based on context
        findings.recommendations = this.generateRecommendations(context, findings.criticalIssues);
        
        // Generate next steps
        findings.nextSteps = this.generateNextSteps(c, findings);

        return findings;
    }

    private getRulesForContext(context: string): AnalysisRule[] {
        switch (context.toLowerCase()) {
            case 'pipelines':
            case 'pipeline':
            case 'azure-pipelines':
                return [...this.pipelineRules, ...this.azureRules];
            case 'azure':
                return this.azureRules;
            case 'kubernetes':
            case 'k8s':
                return this.kubernetesRules;
            case 'general':
            default:
                return [...this.pipelineRules, ...this.azureRules, ...this.kubernetesRules];
        }
    }

    private findMatches(content: string, pattern: RegExp): string[] {
        const matches = new Set<string>();
        let match;
        
        // Reset pattern
        pattern.lastIndex = 0;
        
        while ((match = pattern.exec(content)) !== null) {
            const matchText = match[1] || match[0];
            matches.add(matchText.trim().substring(0, 200));
            
            if (matches.size >= 10) break; // Limit total matches
        }
        
        return Array.from(matches);
    }

    private generateRecommendations(context: string, issues: Array<{ rule: string; matches: string[] }>): string[] {
        const recommendations: string[] = [];
        
        for (const issue of issues) {
            switch (issue.rule) {
                case 'Pipeline Error':
                    recommendations.push('Review pipeline task configurations and service connections');
                    recommendations.push('Verify Azure subscription permissions and resource access');
                    break;
                case 'Authorization Error':
                    recommendations.push('Check service principal/managed identity permissions');
                    recommendations.push('Verify RBAC roles are assigned correctly');
                    recommendations.push('Ensure service connection is not expired');
                    break;
                case 'Deployment Failed':
                    recommendations.push('Review ARM template for syntax errors');
                    recommendations.push('Check resource dependencies and deployment order');
                    recommendations.push('Verify resource group and subscription are correct');
                    break;
                case 'Quota Exceeded':
                    recommendations.push('Request quota increase from Azure Support');
                    recommendations.push('Clean up unused resources to free capacity');
                    break;
            }
        }
        
        return Array.from(new Set(recommendations)); // Deduplicate
    }

    private generateNextSteps(c: Case, findings: AnalysisFindings): string[] {
        const steps: string[] = [];
        
        // Check for unanswered questions
        const openQuestions = c.questions.filter(q => q.status === 'Open');
        const requiredOpen = openQuestions.filter(q => q.required);
        
        if (requiredOpen.length > 0) {
            steps.push(`Answer ${requiredOpen.length} REQUIRED question(s): piper analyze ${c.id}`);
        } else if (openQuestions.length > 0) {
            steps.push(`Review ${openQuestions.length} optional question(s): piper analyze ${c.id}`);
        }
        
        // Check for missing evidence
        if (findings.criticalIssues.length > 0) {
            steps.push('Add supporting evidence: piper add-evidence <caseId> <file>');
        }
        
        // Suggest progression
        if (requiredOpen.length === 0) {
            steps.push('Advance to next phase: piper next ' + c.id);
        }
        
        return steps;
    }

    private async loadEvidenceContent(c: Case): Promise<string> {
        const fs = require('fs-extra');
        const path = require('path');
        
        let content = '';
        const rootDir = path.resolve('./cases');
        
        for (const ev of c.evidence) {
            try {
                const filePath = path.join(rootDir, c.id, 'artifacts', ev.path);
                if (await fs.pathExists(filePath)) {
                    const fileContent = await fs.readFile(filePath, 'utf-8');
                    content += '\n' + fileContent;
                }
            } catch (err) {
                // Skip unreadable files
            }
        }
        
        return content;
    }
}
