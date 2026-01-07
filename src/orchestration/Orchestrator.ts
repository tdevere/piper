import { Case, CaseState, CaseEvent } from '../types';
import { CaseStore } from '../storage/CaseStore';
import { StateMachine } from './StateMachine';
import { LLMClient } from '../llm/LLMClient';
import { ContextAnalyzer } from '../analysis/ContextAnalyzer';
import Ajv from 'ajv';
import chalk from 'chalk';
import * as path from 'path';

const ajv = new Ajv();

export class Orchestrator {
  private contextAnalyzer: ContextAnalyzer;
  
  constructor(
    private store: CaseStore,
    private stateMachine: StateMachine,
    private llm: LLMClient
  ) {
    this.contextAnalyzer = new ContextAnalyzer();
  }

  async next(caseId: string): Promise<{ state: CaseState; report?: string; autoProgressed: boolean }> {
    const c = await this.store.load(caseId);
    const startState = c.state;
    let autoProgressed = false;
    let report = '';
    
    // Auto-progress through early analytical states all the way to Plan
    // Stop at Plan to give user visibility before execution
    let maxIterations = 10; // Safety limit
    
    while (c.state !== CaseState.Plan && c.state !== CaseState.Execute && maxIterations-- > 0) {
      const prevState = c.state;
      
      // 1. Determine next step
      const nextState = this.stateMachine.getRecommendedState(c);
      
      // 2. Validate Transition
      const check = this.stateMachine.canTransition(c, nextState);
      if (!check.allowed) {
          await this.store.appendEvent(c.id, 'TransitionBlocked', check.reason || 'Unknown');
          throw new Error(`Transition blocked: ${check.reason}`);
      }

      // 3. Move State
      if (c.state !== nextState) {
          c.state = nextState;
          await this.store.appendEvent(c.id, 'StateTransition', `Moved to ${nextState}`);
          await this.store.save(c);
          autoProgressed = autoProgressed || (startState !== nextState);
      }

      // 4. Run Agent (Mocked LLM)
      if (c.state !== CaseState.PendingExternal && c.state !== CaseState.Resolve) {
          const response = await this.llm.consult(c, 'default');
          
          // 5. Apply Agent Response
          if (response.newHypotheses) c.hypotheses.push(...response.newHypotheses);
          if (response.newQuestions) c.questions.push(...response.newQuestions);
          if (response.classification && !c.classification) c.classification = response.classification;
          
          await this.store.appendEvent(c.id, 'AgentAction', 'Applied agent suggestions');
          await this.store.save(c);
          
          // Capture thought process for report
          if (response.thoughtProcess) {
            report += `\n[${c.state}] ${response.thoughtProcess}`;
          }
      }
      
      // Stop at Plan state - need user to review before execution
      if (c.state === CaseState.Plan) {
        break;
      }
      
      // Safety: prevent infinite loops
      if (c.state === nextState) {
        break;
      }
    }
    
    // Generate initial troubleshooting report at Plan stage
    if (c.state === CaseState.Plan) {
      report = await this.generateTroubleshootingReport(c, report);
    }
    
    return { state: c.state, report: report || undefined, autoProgressed };
  }
  
  private async generateTroubleshootingReport(c: Case, agentThoughts: string): Promise<string> {
    let report = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    report += '\n📋 INITIAL TROUBLESHOOTING REPORT';
    report += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    
    // Context-aware analysis
    const findings = await this.contextAnalyzer.analyze(c);
    const context = findings.context.toUpperCase();
    
    report += `\n🎯 CONTEXT: ${context}`;
    
    // Classification
    if (c.classification) {
      report += `\n🏷️  ISSUE TYPE: ${c.classification}`;
    }
    
    // Problem Summary
    report += `\n\n📝 PROBLEM SUMMARY:`;
    report += `\n   Expected: ${c.formal.expected}`;
    report += `\n   Actual: ${c.formal.actual}`;
    
    // Context-specific findings
    if (findings.criticalIssues.length > 0) {
      report += `\n\n🔴 CRITICAL FINDINGS (${findings.criticalIssues.length}):`;
      findings.criticalIssues.forEach((issue, i) => {
        report += `\n   ${i + 1}. ${issue.rule}:`;
        issue.matches.slice(0, 2).forEach(match => {
          report += `\n      • ${match.substring(0, 120)}${match.length > 120 ? '...' : ''}`;
        });
        if (issue.matches.length > 2) {
          report += `\n      ... and ${issue.matches.length - 2} more occurrence(s)`;
        }
      });
    }
    
    // Answered Questions
    const answered = c.questions.filter(q => q.status === 'Answered');
    if (answered.length > 0) {
      report += `\n\n✅ DIAGNOSTIC INFORMATION (${answered.length}/${c.questions.length} questions):`;
      answered.forEach(q => {
        report += `\n   • ${q.ask}`;
        const answerPreview = q.answer && q.answer.length > 100 ? 
          q.answer.substring(0, 100) + '...' : q.answer;
        report += `\n     → ${answerPreview}`;
      });
    }
    
    // Open Questions
    const open = c.questions.filter(q => q.status === 'Open');
    if (open.length > 0) {
      report += `\n\n⚠️  MISSING INFORMATION (${open.length} questions):`;
      open.forEach(q => {
        const required = q.required ? ' [REQUIRED]' : '';
        report += `\n   • [${q.id}] ${q.ask}${required}`;
      });
    }
    
    // Hypotheses
    if (c.hypotheses && c.hypotheses.length > 0) {
      report += `\n\n🔬 WORKING HYPOTHESES (${c.hypotheses.length}):`;
      c.hypotheses.forEach((h, i) => {
        const status = h.status === 'Validated' ? '✓' : 
                      h.status === 'Disproven' ? '✗' : '○';
        report += `\n   ${status} H${i + 1}: ${h.description}`;
        if (h.evidenceRefs && h.evidenceRefs.length > 0) {
          report += ` (${h.evidenceRefs.length} evidence refs)`;
        }
      });
    }
    
    // Recommendations
    if (findings.recommendations.length > 0) {
      report += `\n\n💡 RECOMMENDATIONS:`;
      findings.recommendations.slice(0, 5).forEach((rec, i) => {
        report += `\n   ${i + 1}. ${rec}`;
      });
    }
    
    // Evidence Summary
    report += `\n\n📁 EVIDENCE: ${c.evidence.length} files analyzed`;
    const redacted = c.evidence.filter(e => e.isRedacted).length;
    if (redacted > 0) {
      report += ` (${redacted} with PII redacted)`;
    }
    
    // Agent Analysis
    if (agentThoughts) {
      report += `\n\n🤖 ANALYSIS:${agentThoughts}`;
    }
    
    // Generate ACTIONABLE remediation plan based on evidence and hypotheses
    report += await this.generateRemediationPlan(c, findings);
    
    report += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    
    return report;
  }
  
  private async generateRemediationPlan(c: Case, findings: any): Promise<string> {
    let plan = '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    plan += '\n🔧 REMEDIATION PLAN';
    plan += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    
    // Load all available context for AI analysis
    const evidenceContent = await this.loadEvidenceContent(c);
    const problemScope = c.problemScope?.summary || c.formal.actual;
    const answeredQuestions = c.questions.filter(q => q.status === 'Answered')
      .map(q => `Q: ${q.ask}\nA: ${q.answer}`).join('\n\n');
    
    const prompt = `You are an expert troubleshooting engineer analyzing a ${c.context || 'deployment'} issue. Generate a DETAILED, ACTIONABLE remediation plan with SPECIFIC steps the user can execute NOW.

PROBLEM: ${problemScope}

${c.problemScope ? `ERROR PATTERNS DETECTED:
${c.problemScope.errorPatterns.join('\n')}

AFFECTED COMPONENTS:
${c.problemScope.affectedComponents.join('\n')}

` : ''}DIAGNOSTIC INFORMATION (${c.questions.filter(q => q.status === 'Answered').length}/${c.questions.length} questions answered):
${answeredQuestions || 'No diagnostic questions answered yet'}

WORKING HYPOTHESES:
${c.hypotheses.map((h, i) => `${i + 1}. ${h.description} [${h.status}]`).join('\n')}

EVIDENCE EXCERPTS:
${evidenceContent.substring(0, 4000)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOUR TASK: Generate a specific, actionable remediation plan with these sections:

1. 🎯 ROOT CAUSE
   - State the most likely root cause based on evidence
   - Be specific with resource names, IDs, and error codes
   - Example: "Service principal 'app-sp-prod' lacks 'Contributor' role on resource group 'rg-webapp-prod'"

2. 🔧 IMMEDIATE ACTIONS
   - List 3-7 CONCRETE steps to fix the issue
   - Include actual CLI commands (e.g., "az role assignment create --assignee <sp-id> --role Contributor --scope /subscriptions/...")
   - Include specific file changes (e.g., "In azure-pipelines.yml line 42, change serviceConnection from 'dev-sp' to 'prod-sp'")
   - Include configuration settings to verify/modify (e.g., "In Azure Portal > Subscription > Settings, verify resource provider 'Microsoft.Compute' is Registered")
   - Number each action clearly

3. ✅ VERIFICATION STEPS
   - How to confirm EACH fix worked
   - Specific commands to run (e.g., "az deployment group show --name myDeployment --resource-group myRG --query properties.provisioningState")
   - What success looks like (e.g., "Command returns 'Succeeded', no error logs, resource shows as 'Running' in portal")
   - Expected values/outputs to see

CRITICAL RULES:
- NO generic advice like "check permissions" without saying WHICH permissions and HOW to check
- NO placeholders like <your-resource-group> - use actual names from evidence when available
- Include line numbers, file names, setting names, subscription IDs, resource names from evidence
- If you don't know specific values, say "Check evidence for [specific-file.log] to find [exact-value-name]"

YOUR REMEDIATION PLAN:`;

    try {
      // Call AI to generate specific remediation steps
      const remediationText = await this.llm.generateGuidance(prompt);
      
      if (remediationText && remediationText.length > 100) {
        plan += '\n' + remediationText;
      } else {
        throw new Error('AI response too short or empty');
      }
      
    } catch (err: any) {
      // AI unavailable or failed - generate structured fallback
      console.warn(`AI remediation generation failed: ${err.message}, using fallback`);
      
      plan += '\n🎯 ROOT CAUSE:\n';
      if (c.hypotheses.length > 0) {
        const topHypothesis = c.hypotheses[0];
        plan += `   Most likely: ${topHypothesis.description}`;
        if (topHypothesis.status === 'Validated') {
          plan += ' ✅ (Validated)';
        }
      } else {
        plan += '   ⚠️  Unable to determine - need more diagnostic information';
      }
      
      plan += '\n\n🔧 IMMEDIATE ACTIONS:\n';
      if (findings.recommendations && findings.recommendations.length > 0) {
        findings.recommendations.slice(0, 7).forEach((rec: string, i: number) => {
          plan += `\n   ${i + 1}. ${rec}`;
        });
      } else {
        plan += '\n   1. Review error logs in evidence files for specific failure details';
        plan += '\n   2. Verify service connections/credentials are valid and not expired';
        plan += '\n   3. Check resource permissions and quota limits in Azure Portal';
        plan += '\n   4. Validate configuration syntax and parameter values';
        plan += '\n   5. Check that all required resource providers are registered';
        plan += '\n   6. Review recent changes to infrastructure or pipeline configuration';
        plan += '\n   7. Test fix in non-production environment before applying to production';
      }
      
      plan += '\n\n✅ VERIFICATION STEPS:\n';
      plan += '\n   1. Re-run the deployment/pipeline after applying fixes';
      plan += '\n   2. Monitor logs for absence of previous error patterns';
      plan += '\n   3. Confirm deployment completes with success status';
      plan += '\n   4. Verify target resources are in expected/running state';
      plan += '\n   5. Test application functionality if applicable';
    }
    
    // Clear, actionable next steps
    plan += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    plan += '\n📝 WHAT TO DO NOW:\n';
    plan += '\n   ▶️  EXECUTE: Apply the immediate actions listed above';
    plan += '\n   ▶️  VERIFY: Run the verification steps to confirm success';
    plan += `\n   ▶️  DOCUMENT: Add proof of fix: piper add-evidence ${c.id} <success-screenshot.png>`;
    plan += `\n   ▶️  RESOLVE: Close the case: piper resolve ${c.id}`;
    plan += '\n';
    plan += '\n   ⚠️  IF FIXES DON\'T WORK:';
    plan += `\n      → Capture failure evidence: piper add-evidence ${c.id} <new-error-logs>`;
    plan += `\n      → Re-analyze with new data: piper analyze ${c.id}`;
    plan += `\n      → Get revised plan: piper next ${c.id}`;
    
    return plan;
  }
  
  async addAnswer(caseId: string, questionId: string, answer: string) {
      const c = await this.store.load(caseId);
      const q = c.questions.find(x => x.id === questionId);
      if (!q) throw new Error("Question not found");
      
      q.answer = answer;
      q.status = "Answered";
      
      // Auto-resume if pending
      if (c.state === CaseState.PendingExternal) {
          c.state = CaseState.Plan; // Simplified resume logic
      }
      
      await this.store.appendEvent(caseId, 'QuestionAnswered', `Question ${questionId} answered.`);
      await this.store.save(c);
  }

  async analyzeEvidenceForAnswers(caseId: string): Promise<{
    suggestions: Array<{ 
      questionId: string; 
      question: string; 
      suggestedAnswer: string; 
      confidence: string; 
      evidenceRefs: string[];
      alternatives?: Array<{ answer: string; confidence: string }>;
      searchInstructions?: string;
    }>;
    requiresReview: boolean;
  }> {
    const c = await this.store.load(caseId);
    const openQuestions = c.questions.filter(q => q.status === 'Open');
    
    if (openQuestions.length === 0) {
      return { suggestions: [], requiresReview: false };
    }

    // Use LLM to analyze evidence and suggest answers
    const response = await this.llm.analyzeForQuestions(c, openQuestions);
    
    await this.store.appendEvent(caseId, 'EvidenceAnalysis', `Analyzed ${c.evidence.length} evidence files for ${openQuestions.length} questions`);
    
    return {
      suggestions: response.suggestions || [],
      requiresReview: true
    };
  }

  async applyAnswerSuggestions(
    caseId: string, 
    suggestions: Array<{ questionId: string; suggestedAnswer: string }>
  ): Promise<void> {
    const c = await this.store.load(caseId);
    
    for (const suggestion of suggestions) {
      const q = c.questions.find(x => x.id === suggestion.questionId);
      if (q && q.status === 'Open') {
        q.answer = suggestion.suggestedAnswer;
        q.status = 'Answered';
        await this.store.appendEvent(caseId, 'QuestionAutoAnswered', `Question ${suggestion.questionId} auto-answered from evidence`);
      }
    }
    
    await this.store.save(c);
  }

  async generatePreliminaryReport(caseId: string): Promise<string> {
    const c = await this.store.load(caseId);
    // Generate report at current state even if not at Plan
    return await this.generateTroubleshootingReport(c, 'Preliminary analysis based on available evidence');
  }

  async generateProblemScope(caseId: string): Promise<{
    summary: string;
    errorPatterns: string[];
    affectedComponents: string[];
    timeframe?: string;
    impact: string;
    evidenceSummary: string;
  }> {
    const c = await this.store.load(caseId);
    
    console.log(chalk.gray(`   📂 Loading ${c.evidence.length} evidence files...`));
    
    // Prepare evidence summary
    const evidenceFiles = c.evidence.map(e => `- ${e.path} (${e.mediaType})`).join('\n');
    const evidenceContent = await this.loadEvidenceContent(c);
    
    const contentSizeKB = Math.round(evidenceContent.length / 1024);
    console.log(chalk.gray(`   📊 Evidence content: ${contentSizeKB} KB`));
    
    // Use context analyzer for initial patterns
    if (c.context) {
      console.log(chalk.gray(`   🔍 Running context-specific analysis (${c.context})...`));
    }
    const contextFindings = c.context ? await this.contextAnalyzer.analyze(c) : null;
    
    if (contextFindings && contextFindings.criticalIssues.length > 0) {
      console.log(chalk.gray(`   ✓ Found ${contextFindings.criticalIssues.length} critical pattern(s)`));
    }
    
    console.log(chalk.gray(`   🤖 Preparing AI analysis prompt...`));
    
    const prompt = `You are an Azure DevOps troubleshooting expert. Analyze the evidence and create a detailed problem scope.

INITIAL PROBLEM REPORT:
${c.formal.actual}

CONTEXT: ${c.context || 'general'}

EVIDENCE FILES (redacted):
${evidenceFiles}

KEY EVIDENCE CONTENT (first 20000 chars from redacted files):
${evidenceContent.substring(0, 20000)}

${contextFindings ? `\nCONTEXT ANALYSIS FINDINGS:\n${contextFindings.criticalIssues.map((issue: any) => `- ${issue.rule}: ${issue.matches.length} occurrences`).join('\n')}` : ''}

Create a detailed problem scope with:

1. SUMMARY: One clear sentence describing the exact problem
2. ERROR_PATTERNS: List 3-5 key error messages, codes, or patterns found
3. AFFECTED_COMPONENTS: List specific Azure/DevOps components (e.g., "AzureCLI Task", "Service Connection", "App Service")
4. TIMEFRAME: When did this start (if evident from logs)
5. IMPACT: Technical and business impact (e.g., "Deployments blocked", "Production unavailable")
6. EVIDENCE_SUMMARY: What evidence we have and what might be missing

Respond in this format:
SUMMARY: <one sentence>
ERROR_PATTERNS:
- <pattern 1>
- <pattern 2>
AFFECTED_COMPONENTS:
- <component 1>
- <component 2>
TIMEFRAME: <when or "Unknown">
IMPACT: <impact description>
EVIDENCE_SUMMARY: <what we have and what's missing>`;

    try {
      const { execSync } = require('child_process');
      const os = require('os');
      const fs = require('fs-extra');
      const path = require('path');
      
      const command = process.env.COPILOT_AUTO_PATH || 'copilot-auto';
      
      // Write prompt to temp file in cwd so copilot-auto can read it with relative path
      const tempFile = path.join(process.cwd(), `.piper-scope-${Date.now()}.txt`);
      await fs.writeFile(tempFile, prompt);
      
      const promptSizeKB = Math.round(prompt.length / 1024);
      console.log(chalk.gray(`   📝 Prompt prepared: ${promptSizeKB} KB`));
      
      // Show prompt in debug mode
      if (process.env.DEBUG === 'true' || process.env.SHOW_PROMPT === 'true') {
        console.log(chalk.cyan('\n   ━━━━━━━━ PROMPT SENT TO COPILOT-AUTO ━━━━━━━━'));
        console.log(chalk.gray(prompt.substring(0, 2000)));
        if (prompt.length > 2000) {
          console.log(chalk.gray(`\n   ... (showing first 2000 of ${prompt.length} characters)`));
        }
        console.log(chalk.cyan('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
      }
      
      console.log(chalk.cyan(`   ⏳ Calling copilot-auto (typically 30-120 seconds)...`));
      
      const startTime = Date.now();
      
      // Show progress dots while waiting
      let dotCount = 0;
      const progressInterval = setInterval(() => {
        process.stdout.write(chalk.gray('.'));
        dotCount++;
        if (dotCount % 60 === 0) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          process.stdout.write(chalk.gray(` ${elapsed}s\n      `));
        }
      }, 1000);
      
      try {
        // Use simple meta-prompt with relative filename
        const filename = path.basename(tempFile);
        const instruction = `Read the file ${filename} in the current directory and follow its instructions exactly. The file contains a detailed analysis prompt for Azure DevOps troubleshooting.`;
        
        const result = execSync(`${command} --allow-all-paths --direct "${instruction}"`, {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024 * 5,
          timeout: 120000,
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: process.cwd()
        });
        
        clearInterval(progressInterval);
        process.stdout.write('\n');
        
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        console.log(chalk.green(`   ✓ AI analysis completed in ${elapsedSeconds}s`));
        
        // Clean up temp file
        await fs.remove(tempFile);
        
        console.log(chalk.gray(`   📋 Parsing response...`));
        
        // Debug: Show raw response
        if (process.env.DEBUG === 'true' || process.env.SHOW_PROMPT === 'true') {
          console.log(chalk.gray('\n   === RAW COPILOT-AUTO RESPONSE ==='));
          console.log(result);
          console.log(chalk.gray('   === END RESPONSE ===\n'));
        }
        
        // Parse the structured response
        return this.parseProblemScope(result);
      } finally {
        clearInterval(progressInterval);
      }
    } catch (error: any) {
      process.stdout.write('\n');
      
      console.log(chalk.yellow('\n   ⚠️  AI scope generation failed, using pattern-based analysis'));
      console.log(chalk.gray(`   Reason: ${error.message}`));
      
      if (process.env.DEBUG === 'true') {
        console.error(chalk.gray('   Full error:'));
        console.error(error);
      }
      
      return this.generateHeuristicScope(c, evidenceContent, contextFindings);
    }
  }

  private parseProblemScope(response: string): {
    summary: string;
    errorPatterns: string[];
    affectedComponents: string[];
    timeframe?: string;
    impact: string;
    evidenceSummary: string;
  } {
    const lines = response.split('\n');
    let summary = '';
    let errorPatterns: string[] = [];
    let affectedComponents: string[] = [];
    let timeframe = '';
    let impact = '';
    let evidenceSummary = '';
    let currentSection = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Handle both plain "SUMMARY:" and markdown "**SUMMARY:**" formats
      if (trimmed.startsWith('SUMMARY:') || trimmed.startsWith('**SUMMARY:**')) {
        const start = trimmed.indexOf(':') + 1;
        summary = trimmed.substring(start).trim();
      } else if (trimmed.startsWith('ERROR_PATTERNS:') || trimmed.startsWith('**ERROR_PATTERNS:**')) {
        currentSection = 'errors';
      } else if (trimmed.startsWith('AFFECTED_COMPONENTS:') || trimmed.startsWith('**AFFECTED_COMPONENTS:**')) {
        currentSection = 'components';
      } else if (trimmed.startsWith('TIMEFRAME:') || trimmed.startsWith('**TIMEFRAME:**')) {
        const start = trimmed.indexOf(':') + 1;
        timeframe = trimmed.substring(start).trim();
        currentSection = '';
      } else if (trimmed.startsWith('IMPACT:') || trimmed.startsWith('**IMPACT:**')) {
        const start = trimmed.indexOf(':') + 1;
        const immediateContent = trimmed.substring(start).trim();
        if (immediateContent) impact = immediateContent;
        currentSection = 'impact';
      } else if (trimmed.startsWith('EVIDENCE_SUMMARY:') || trimmed.startsWith('**EVIDENCE_SUMMARY:**')) {
        const start = trimmed.indexOf(':') + 1;
        const immediateContent = trimmed.substring(start).trim();
        if (immediateContent) evidenceSummary = immediateContent;
        currentSection = 'evidence';
      } else if (trimmed.startsWith('- ')) {
        const item = trimmed.substring(2);
        if (currentSection === 'errors') errorPatterns.push(item);
        else if (currentSection === 'components') affectedComponents.push(item);
        else if (currentSection === 'impact' && item.includes(':')) {
          // Handle nested format like "- **Technical:** text"
          const colonIndex = item.indexOf(':');
          const text = item.substring(colonIndex + 1).trim();
          if (impact) impact += '; ';
          impact += text;
        } else if (currentSection === 'evidence' && item.includes(':')) {
          // Handle nested format like "- **What we have:** text"
          const colonIndex = item.indexOf(':');
          const label = item.substring(0, colonIndex).replace(/\*\*/g, '').trim();
          const text = item.substring(colonIndex + 1).trim();
          if (evidenceSummary) evidenceSummary += '; ';
          evidenceSummary += `${label}: ${text}`;
        }
      } else if (currentSection === 'impact' && trimmed && !trimmed.startsWith('**')) {
        // Continue collecting multi-line impact text (but not new markdown headers)
        if (impact) impact += ' ';
        impact += trimmed;
      } else if (currentSection === 'evidence' && trimmed && !trimmed.startsWith('**')) {
        // Continue collecting multi-line evidence text (but not new markdown headers)
        evidenceSummary += ' ' + trimmed;
      }
    }
    
    return {
      summary: summary || 'Problem scope could not be determined',
      errorPatterns,
      affectedComponents,
      timeframe: timeframe !== 'Unknown' ? timeframe : undefined,
      impact,
      evidenceSummary: evidenceSummary.trim()
    };
  }

  private generateHeuristicScope(c: Case, evidenceContent: string, contextFindings: any) {
    // Fallback heuristic scope generation
    const errorPatterns: string[] = [];
    const affectedComponents: string[] = [];
    
    // Extract error patterns
    const errorMatches = evidenceContent.match(/##\[error\][^\n]+/gi);
    if (errorMatches) {
      errorPatterns.push(...errorMatches.slice(0, 3));
    }
    
    // Extract component mentions
    if (evidenceContent.includes('AzureCLI')) affectedComponents.push('Azure CLI Task');
    if (evidenceContent.includes('Service Connection')) affectedComponents.push('Service Connection');
    if (evidenceContent.includes('401') || evidenceContent.includes('Unauthorized')) affectedComponents.push('Authentication');
    
    const criticalCount = contextFindings?.criticalIssues?.length || 0;
    const evidenceSummary = `${c.evidence.length} evidence files analyzed. ${criticalCount > 0 ? criticalCount + ' critical patterns found.' : 'Additional evidence may be needed for complete diagnosis.'}`;
    
    return {
      summary: c.formal.actual,
      errorPatterns,
      affectedComponents,
      impact: 'Deployment or pipeline execution blocked',
      evidenceSummary
    };
  }

  private async loadEvidenceContent(c: Case): Promise<string> {
    const path = require('path');
    const fs = require('fs-extra');
    
    let content = '';
    const artifactsDir = path.join(process.cwd(), 'cases', c.id, 'artifacts');
    
    if (process.env.DEBUG === 'true') {
      console.log(chalk.gray(`   📁 Loading evidence from: ${artifactsDir}`));
    }
    
    for (const ev of c.evidence.slice(0, 10)) { // Limit to first 10 files
      try {
        // Always load from artifacts directory which contains REDACTED files
        const evidencePath = path.join(artifactsDir, path.basename(ev.path));
        const text = await fs.readFile(evidencePath, 'utf-8');
        content += `\n--- ${path.basename(ev.path)} ---\n${text.substring(0, 5000)}\n`;
        
        if (process.env.DEBUG === 'true') {
          console.log(chalk.gray(`   ✓ Loaded ${path.basename(ev.path)} (${text.length} chars, redacted=${ev.isRedacted || false})`));
        }
      } catch (err) {
        // Skip files that can't be read
        if (process.env.DEBUG === 'true') {
          console.log(chalk.yellow(`   ⚠ Could not read ${path.basename(ev.path)}`));
        }
      }
    }
    return content;
  }

  /**
   * Try to answer questions from existing evidence before asking user
   */
  async autoExtractAnswers(caseId: string): Promise<Array<{questionId: string; extractedAnswer: string; confidence: 'high' | 'medium' | 'low'; evidenceRefs: string[]}>> {
    const c = await this.store.load(caseId);
    const openQuestions = c.questions.filter(q => q.status === 'Open');
    
    if (openQuestions.length === 0 || c.evidence.length === 0) {
      return [];
    }
    
    // Load evidence content (redacted)
    const evidenceContent = await this.loadEvidenceContent(c);
    
    if (!evidenceContent || evidenceContent.length < 100) {
      return [];
    }
    
    const extractions: Array<{questionId: string; extractedAnswer: string; confidence: 'high' | 'medium' | 'low'; evidenceRefs: string[]}> = [];
    
    // Try to extract answers for each question
    for (const q of openQuestions.slice(0, 5)) { // Limit to first 5 questions
      try {
        const prompt = `You are analyzing evidence files to answer diagnostic questions.

QUESTION: ${q.ask}

EVIDENCE FILES:
${evidenceContent.substring(0, 10000)}

TASK: Extract the answer to this question from the evidence above.

RESPONSE FORMAT:
ANSWER: <your answer based on evidence>
CONFIDENCE: <high|medium|low>
EVIDENCE_FILES: <comma-separated list of file names where answer was found>

RULES:
1. Only answer if you find explicit information in the evidence
2. If evidence doesn't contain the answer, respond with: ANSWER: NOT_FOUND
3. Use "high" confidence only if evidence clearly answers the question
4. Use "medium" if evidence partially answers or requires inference
5. Use "low" if answer is uncertain or requires confirmation
6. Quote specific file names where you found the information

YOUR RESPONSE:`;

        // Use existing consult method for compatibility
        const tempCase = { ...c, state: CaseState.Classify };
        const response = await this.llm.consult(tempCase, 'answer-extraction');
        const result = response.thoughtProcess || '';
        
        // Parse response
        const answerMatch = result.match(/ANSWER:\s*(.+)/i);
        const confidenceMatch = result.match(/CONFIDENCE:\s*(high|medium|low)/i);
        const evidenceFilesMatch = result.match(/EVIDENCE_FILES:\s*(.+)/i);
        
        if (answerMatch) {
          const answer = answerMatch[1].trim();
          
          // Skip if not found
          if (answer.toUpperCase() === 'NOT_FOUND' || answer.toLowerCase().includes('not found') || answer.toLowerCase().includes('no evidence')) {
            continue;
          }
          
          const confidence = (confidenceMatch?.[1] || 'low') as 'high' | 'medium' | 'low';
          const evidenceFiles = evidenceFilesMatch?.[1].split(',').map((f: string) => f.trim()) || [];
          
          // Find evidence IDs for referenced files
          const evidenceRefs = c.evidence
            .filter(ev => evidenceFiles.some((f: string) => ev.path.includes(f) || f.includes(path.basename(ev.path))))
            .map(ev => ev.id);
          
          extractions.push({
            questionId: q.id,
            extractedAnswer: answer,
            confidence,
            evidenceRefs
          });
        }
      } catch (err: unknown) {
        // Skip questions that fail extraction
        if (process.env.DEBUG === 'true') {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error(chalk.gray(`   Could not auto-extract answer for ${q.id}: ${errorMessage}`));
        }
      }
    }
    
    return extractions;
  }
}

