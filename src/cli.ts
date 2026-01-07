#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { CaseStore } from './storage/CaseStore';
import { Orchestrator } from './orchestration/Orchestrator';
import { StateMachine } from './orchestration/StateMachine';
import { LLMClient } from './llm/LLMClient';
import { EvidenceManager } from './evidence/EvidenceManager';
import { TemplateManager } from './templates/TemplateManager';
import { AgentSessionManager } from './agents/AgentSessionManager';
import { AgentRunner } from './agents/AgentRunner';
import { v4 as uuidv4 } from 'uuid';
import { Case, CaseState, Question, IssueTemplate } from './types';
import path from 'path';
import chalk from 'chalk';

import { IntakeParser } from './orchestration/IntakeParser';
import * as fs from 'fs-extra';

const rootDir = path.resolve('./cases');
const templatesDir = path.resolve('./templates');
const fixturesDir = path.resolve('./examples/agent_outputs');

const store = new CaseStore(rootDir);
const templateMgr = new TemplateManager(templatesDir);
const sm = new StateMachine();
const llm = new LLMClient(fixturesDir);
const evidenceMgr = new EvidenceManager(rootDir);
const orchestrator = new Orchestrator(store, sm, llm);
const agentSessionMgr = new AgentSessionManager(rootDir);
const agentRunner = new AgentRunner(agentSessionMgr, llm, orchestrator, store);

// Interactive question handler with help/guidance and evidence requirements
async function handleInteractiveQuestion(
    q: Question, 
    caseId: string, 
    toApply: { questionId: string; suggestedAnswer: string }[],
    orchestrator: Orchestrator
): Promise<void> {
    // Skip PII-sensitive questions to avoid collecting sensitive data
    const piiPatterns = [
        /subscription\s+id/i,
        /resource\s+group/i,
        /tenant\s+id/i,
        /client\s+id/i,
        /account\s+name/i
    ];
    
    if (piiPatterns.some(pattern => pattern.test(q.ask))) {
        console.log(chalk.cyan(`\nQ: ${q.ask}`));
        console.log(chalk.gray(`   [${q.id}] ${q.required ? chalk.red('REQUIRED') : 'Optional'}`));
        console.log(chalk.gray('   🔒 PII-sensitive - skipped for security (auto-extracted from evidence if available)'));
        console.log(chalk.gray('   ⊘ Skipped\n'));
        return;
    }
    
    console.log(chalk.bold.cyan(`\n╔══════════════════════════════════════════════════════════════════`));
    console.log(chalk.bold.cyan(`║ EVIDENCE REQUEST [${q.id}] ${q.required ? chalk.red('★ REQUIRED') : chalk.gray('Optional')}`));
    console.log(chalk.bold.cyan(`╚══════════════════════════════════════════════════════════════════`));
    console.log(chalk.white(`\n${q.ask}\n`));
    
    // ALWAYS show guidance upfront
    console.log(chalk.blue('📚 HOW TO COLLECT THIS EVIDENCE:'));
    console.log(chalk.blue('═══════════════════════════════════════\n'));
    
    if (q.guidance) {
        console.log(chalk.white(q.guidance.split('\n').map(line => '   ' + line).join('\n')));
    } else {
        // Show fallback guidance based on question context
        if (q.ask.toLowerCase().includes('service connection')) {
            console.log(chalk.white('   EXACT STEPS:'));
            console.log(chalk.white('   1. Open Azure DevOps portal'));
            console.log(chalk.white('   2. Navigate: Project Settings (bottom left) > Service connections'));
            console.log(chalk.white('   3. Select your Azure subscription connection'));
            console.log(chalk.white('   4. Click "Security" tab'));
            console.log(chalk.white('   5. Verify your pipeline is listed under "Pipeline permissions"'));
            console.log(chalk.white('   6. Take screenshot showing the Security tab'));
            console.log(chalk.gray('\n   DOCS: https://learn.microsoft.com/azure/devops/pipelines/library/service-endpoints'));
        } else if (q.ask.toLowerCase().includes('permission') || q.ask.toLowerCase().includes('role')) {
            console.log(chalk.white('   EXACT STEPS:'));
            console.log(chalk.white('   1. Open Azure Portal'));
            console.log(chalk.white('   2. Navigate to the resource or subscription'));
            console.log(chalk.white('   3. Click "Access control (IAM)"'));
            console.log(chalk.white('   4. Click "Check access"'));
            console.log(chalk.white('   5. Search for the service principal or user'));
            console.log(chalk.white('   6. Screenshot the role assignments'));
        } else {
            console.log(chalk.white('   GENERAL STEPS:'));
            console.log(chalk.white('   1. Check Azure DevOps pipeline logs for error details'));
            console.log(chalk.white('   2. Review Azure portal for resource configurations'));
            console.log(chalk.white('   3. Capture screenshot or export showing the verification'));
        }
    }
    
    // Show examples if available
    if (q.examples && q.examples.length > 0) {
        console.log(chalk.blue('\n💡 EXAMPLES OF ACCEPTABLE EVIDENCE:'));
        q.examples.forEach((ex, i) => {
            console.log(chalk.gray(`   ${i + 1}. ${ex}`));
        });
    }
    
    console.log(chalk.yellow('\n📁 REQUIRED: Provide evidence file path'));
    console.log(chalk.gray('   • Screenshot (PNG, JPG)'));
    console.log(chalk.gray('   • Log file (TXT, LOG)'));
    console.log(chalk.gray('   • Configuration export (JSON, YAML, XML)'));
    console.log(chalk.gray('   • Or type "skip" to continue without evidence\n'));
    
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    let answered = false;
    
    while (!answered) {
        const input = await new Promise<string>(resolve => {
            readline.question(
                chalk.yellow('   📎 Evidence file path (or "skip"): '), 
                (ans: string) => resolve(ans)
            );
        });

        const trimmed = input.trim().toLowerCase();
        
        if (trimmed === 'skip') {
            // Explicitly skipped by user
            if (q.required) {
                console.log(chalk.red('\n   ⚠️  This is a REQUIRED question'));
                console.log(chalk.yellow('   Skipping will limit diagnostic accuracy'));
                
                const confirmReadline = require('readline').createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                const confirm = await new Promise<string>(resolve => {
                    confirmReadline.question(chalk.yellow('   Are you sure you want to skip? [y/N]: '), (ans: string) => {
                        resolve(ans);
                    });
                });
                
                confirmReadline.close();
                
                if (!confirm || !['y', 'yes'].includes(confirm.toLowerCase())) {
                    console.log(chalk.gray('   Continuing to collect evidence...\n'));
                    continue;
                }
            }
            
            console.log(chalk.gray('   ⊘ Skipped - will analyze with available evidence\n'));
            answered = true;
            break;
        }
        
        if (trimmed === '') {
            console.log(chalk.yellow('   ⚠️  Please provide a file path or type "skip" to continue\n'));
            continue;
        }
        
        // Treat input as file path
        const filePath = path.resolve(input.trim());
        
        if (!fs.existsSync(filePath)) {
            console.log(chalk.red(`   ❌ File not found: ${filePath}`));
            console.log(chalk.gray('   Please check the path and try again, or type "skip"\n'));
            continue;
        }
        
        // Ingest as evidence with PII redaction
        try {
            const { evidence: ev, isRedacted } = await evidenceMgr.addFile(caseId, filePath, ["user-supplied", q.id]);
            
            // Save evidence to case
            const currentCase = await store.load(caseId);
            currentCase.evidence.push(ev);
            await store.save(currentCase);
            await store.appendEvent(caseId, 'EvidenceAdded', `Added ${ev.path} (linked to ${q.id})`);
            
            const fileName = path.basename(filePath);
            
            console.log(chalk.green(`\n   ✅ Evidence captured: ${fileName}`));
            if (isRedacted) {
                console.log(chalk.gray(`   🔒 Sensitive data automatically redacted`));
            }
            console.log(chalk.gray(`   Evidence ID: ${ev.id}`));
            
            // NOW: Try to analyze the evidence to extract information
            const llmEnabled = process.env.LLM_ENABLED === 'true';
            
            if (llmEnabled) {
                console.log(chalk.cyan(`\n   🔍 Analyzing newly added evidence to extract answer...\n`));
                
                try {
                    // Load the newly added evidence
                    const evidencePath = path.join(process.cwd(), 'cases', caseId, 'artifacts', ev.path);
                    let evidenceContent = '';
                    
                    if (ev.mediaType.includes('text')) {
                        evidenceContent = await fs.readFile(evidencePath, 'utf-8');
                        evidenceContent = evidenceContent.substring(0, 5000); // Limit to first 5KB
                    }
                    
                    // Use AI to extract answer from this specific evidence
                    const prompt = `You are analyzing evidence to answer a diagnostic question.

QUESTION: ${q.ask}

${q.guidance ? `GUIDANCE: ${q.guidance}\n` : ''}

EVIDENCE FILE: ${fileName} (${ev.mediaType})
${evidenceContent ? `CONTENT:\n${evidenceContent}\n` : 'This is an image/screenshot file.'}

TASK: Based on this evidence, provide a clear answer to the question.

If the evidence shows verification (e.g., screenshot showing settings, logs showing success), describe what is visible/confirmed.
Be specific and extract key details.

YOUR ANSWER:`;

                    // Reload case with new evidence and use orchestrator's analyze method
                    const updatedCase = await store.load(caseId);
                    
                    // Try to extract answer using the new auto-extraction method
                    const extractions = await orchestrator.autoExtractAnswers(caseId);
                    const thisQuestionExtraction = extractions.find(e => e.questionId === q.id);
                    
                    if (thisQuestionExtraction) {
                        const confidence = thisQuestionExtraction.confidence;
                        const answer = thisQuestionExtraction.extractedAnswer;
                        
                        const confidenceColor = confidence === 'high' ? chalk.green :
                                              confidence === 'medium' ? chalk.yellow :
                                              chalk.gray;
                        
                        console.log(confidenceColor(`   📋 Extracted Answer (${confidence.toUpperCase()} confidence):`));
                        console.log(chalk.white(`   ${answer}`));
                        
                        // Use the extracted answer
                        toApply.push({
                            questionId: q.id,
                            suggestedAnswer: `[From ${fileName}] ${answer}`
                        });
                        
                        console.log(chalk.green(`\n   ✅ Answer extracted and applied\n`));
                    } else {
                        // Fallback to generic answer
                        toApply.push({
                            questionId: q.id,
                            suggestedAnswer: `Verified via evidence: ${fileName} (${ev.id})`
                        });
                        console.log(chalk.gray(`\n   ⚠️  Could not extract specific answer - using generic verification\n`));
                    }
                } catch (analysisErr: any) {
                    console.log(chalk.yellow(`\n   ⚠️  Analysis failed: ${analysisErr.message}`));
                    // Fallback to generic answer
                    toApply.push({
                        questionId: q.id,
                        suggestedAnswer: `Verified via evidence: ${fileName} (${ev.id})`
                    });
                    console.log(chalk.gray(`   Using generic verification\n`));
                }
            } else {
                // No AI or unsupported file type - use generic answer
                toApply.push({
                    questionId: q.id,
                    suggestedAnswer: `Verified via evidence: ${fileName} (${ev.id})`
                });
                console.log(chalk.gray(`\n   📎 Evidence linked to answer\n`));
            }
            
            answered = true;
        } catch (err: any) {
            console.log(chalk.red(`\n   ❌ Failed to ingest evidence: ${err.message}`));
            console.log(chalk.gray('   Try again with a valid file path\n'));
        }
    }
    
    readline.close();
}

yargs(hideBin(process.argv))
  .scriptName("piper")
  .command('scope <id>', 'Define and confirm problem scope before diagnostic questions', {}, async (argv: any) => {
      try {
          const c = await store.load(argv.id);
          console.log(chalk.blue(`\n🔍 Analyzing evidence to define problem scope...\n`));
          
          // Generate problem scope using AI
          const problemScope = await orchestrator.generateProblemScope(argv.id);
          
          // Display the scope
          console.log(chalk.bold.cyan('📋 PROBLEM SCOPE ANALYSIS'));
          
          // Show version if this is a refinement
          if (c.problemScope?.version) {
              console.log(chalk.gray(`   Version ${c.problemScope.version + 1} (previous versions: ${c.scopeHistory?.length || 0})`));
          }
          
          console.log(chalk.bold('\n■ SUMMARY:'));
          console.log(chalk.white('  ' + problemScope.summary));
          
          console.log(chalk.bold('\n■ KEY ERROR PATTERNS:'));
          if (problemScope.errorPatterns.length > 0) {
              problemScope.errorPatterns.forEach(pattern => {
                  console.log(chalk.red('  ✗ ' + pattern));
              });
          } else {
              console.log(chalk.gray('  No specific error patterns identified'));
          }
          
          console.log(chalk.bold('\n■ AFFECTED COMPONENTS:'));
          if (problemScope.affectedComponents.length > 0) {
              problemScope.affectedComponents.forEach(comp => {
                  console.log(chalk.yellow('  • ' + comp));
              });
          } else {
              console.log(chalk.gray('  Components not yet identified'));
          }
          
          if (problemScope.timeframe) {
              console.log(chalk.bold('\n■ TIMEFRAME:'));
              console.log(chalk.white('  ' + problemScope.timeframe));
          }
          
          console.log(chalk.bold('\n■ IMPACT:'));
          console.log(chalk.white('  ' + problemScope.impact));
          
          console.log(chalk.bold('\n■ EVIDENCE STATUS:'));
          // Split evidence summary by semicolon to show structured sections
          if (problemScope.evidenceSummary.includes(';')) {
              const sections = problemScope.evidenceSummary.split(';').map(s => s.trim()).filter(s => s);
              sections.forEach(section => {
                  console.log(chalk.gray('  ' + section));
              });
          } else {
              console.log(chalk.gray('  ' + problemScope.evidenceSummary));
          }
          
          // Ask for confirmation
          const readline = require('readline').createInterface({
              input: process.stdin,
              output: process.stdout
          });
          
          console.log(chalk.bold.yellow('\n❓ SCOPE CONFIRMATION:'));
          const response = await new Promise<string>(resolve => {
              readline.question(
                  chalk.yellow('   1) Confirm scope and proceed\n   2) Refine scope (update problem statement)\n   3) Need more evidence\n   \n   Select option [1-3]: '),
                  (ans: string) => resolve(ans)
              );
          });
          
          readline.close();
          
          const choice = parseInt(response.trim()) || 1;
          
          if (choice === 1) {
              // Confirm and save scope
              // Save current scope to history if it exists
              if (c.problemScope) {
                  if (!c.scopeHistory) c.scopeHistory = [];
                  c.scopeHistory.push({
                      version: c.problemScope.version || 1,
                      timestamp: c.problemScope.timestamp || new Date().toISOString(),
                      summary: c.problemScope.summary,
                      errorPatterns: c.problemScope.errorPatterns,
                      affectedComponents: c.problemScope.affectedComponents,
                      timeframe: c.problemScope.timeframe,
                      impact: c.problemScope.impact,
                      evidenceSummary: c.problemScope.evidenceSummary,
                      reason: 'Replaced by new version'
                  });
              }
              
              // Set new scope with version tracking
              const newVersion = (c.problemScope?.version || 0) + 1;
              c.problemScope = {
                  ...problemScope,
                  version: newVersion,
                  timestamp: new Date().toISOString()
              };
              c.scopeConfirmed = true;
              await store.save(c);
              await store.appendEvent(argv.id, 'ScopeConfirmed', `Problem scope v${newVersion} confirmed`);
              
              console.log(chalk.green(`\n✅ Problem scope v${newVersion} confirmed and saved`));
              
              // Try to match a template based on the scope
              console.log(chalk.cyan('\n🔍 Checking for specialized troubleshooting templates...'));
              const templateManager = new (require('./templates/TemplateManager').TemplateManager)(
                  require('path').join(process.cwd(), 'templates')
              );
              
              const matchedTemplates = await templateManager.match(
                  problemScope.summary,
                  problemScope.errorPatterns.join(' ')
              );
              
              let templateToApply: any = null;
              
              if (matchedTemplates.length > 0) {
                  templateToApply = matchedTemplates[0];
                  console.log(chalk.green(`   ✓ Found matching template: "${templateToApply.name}"`));
                  console.log(chalk.gray(`     Classification: ${templateToApply.classification || 'General'}`));
              } else {
                  // Load generic template as fallback
                  console.log(chalk.yellow('   ⚠️  No specialized template found'));
                  try {
                      templateToApply = await templateManager.load('generic');
                      console.log(chalk.cyan(`   ℹ Using generic troubleshooting workflow`));
                  } catch (err: any) {
                      console.log(chalk.red(`   ✗ Generic template not found - case will have no diagnostic questions`));
                      console.log(chalk.gray(`     Run: Create templates/generic.json with basic troubleshooting questions`));
                  }
              }
              
              // Apply template questions if case doesn't have them yet and we found a template
              if (templateToApply && c.questions.length === 0) {
                  c.questions = templateToApply.questions.map((q: any) => ({
                      ...q,
                      status: 'Open' as const
                  }));
                  c.templateId = templateToApply.id;
                  c.classification = templateToApply.classification;
                  await store.save(c);
                  await store.appendEvent(argv.id, 'TemplateApplied', `Applied template: ${templateToApply.name}`);
                  console.log(chalk.green(`   ✓ Applied ${templateToApply.questions.length} diagnostic questions from template`));
              }
              
              if (templateToApply) {
                  // Show evidence collection plan
                  console.log(chalk.bold.cyan('\n📋 EVIDENCE COLLECTION PLAN'));
                  console.log(chalk.white('\n   Based on this issue type, you should collect:'));
                  
                  const evidenceNeeds = templateToApply.questions
                      .filter((q: any) => q.verificationRequired || q.guidance)
                      .slice(0, 3);
                  
                  evidenceNeeds.forEach((q: any, idx: number) => {
                      console.log(chalk.yellow(`\n   ${idx + 1}. ${q.ask}`));
                      if (q.guidance) {
                          const guidanceLines = q.guidance.split('\n').slice(0, 2);
                          guidanceLines.forEach((line: string) => {
                              console.log(chalk.gray(`      ${line}`));
                          });
                      }
                      if (q.examples && q.examples.length > 0) {
                          console.log(chalk.gray(`      Example: ${q.examples[0]}`));
                      }
                  });
                  
                  console.log(chalk.bold.cyan('\n📎 HOW TO ADD EVIDENCE:'));
                  console.log(chalk.white('   When you have the files ready:'));
                  console.log(chalk.gray(`   piper add-evidence ${argv.id} <file-path>`));
                  console.log(chalk.gray('   or'));
                  console.log(chalk.gray(`   piper add-evidence ${argv.id} <folder-path>`));
              }
              
              console.log(chalk.bold.cyan('\n🔄 NEXT STEPS:'));
              console.log(chalk.white('   1. Collect evidence listed above'));
              console.log(chalk.white('   2. Add evidence: ') + chalk.gray(`piper add-evidence ${argv.id} <file>`));
              console.log(chalk.white('   3. Start analysis: ') + chalk.gray(`piper analyze ${argv.id}`));
              console.log(chalk.white('   4. Continue until resolved'));
              
          } else if (choice === 2) {
              // Refine scope - save current to history first
              if (c.problemScope) {
                  if (!c.scopeHistory) c.scopeHistory = [];
                  c.scopeHistory.push({
                      version: c.problemScope.version || 1,
                      timestamp: c.problemScope.timestamp || new Date().toISOString(),
                      summary: c.problemScope.summary,
                      errorPatterns: c.problemScope.errorPatterns,
                      affectedComponents: c.problemScope.affectedComponents,
                      timeframe: c.problemScope.timeframe,
                      impact: c.problemScope.impact,
                      evidenceSummary: c.problemScope.evidenceSummary,
                      reason: 'User requested refinement'
                  });
              }
              
              console.log(chalk.yellow('\n✏️  Enter refined problem statement:'));
              const refineReadline = require('readline').createInterface({
                  input: process.stdin,
                  output: process.stdout
              });
              
              const refined = await new Promise<string>(resolve => {
                  refineReadline.question(chalk.gray('   New statement: '), (ans: string) => resolve(ans));
              });
              
              refineReadline.close();
              
              if (refined.trim()) {
                  const newVersion = (c.problemScope?.version || 0) + 1;
                  c.problemScope = {
                      ...problemScope,
                      summary: refined.trim(),
                      version: newVersion,
                      timestamp: new Date().toISOString()
                  };
                  c.formal.actual = refined.trim(); // Update case title too
                  c.scopeConfirmed = true;
                  await store.save(c);
                  await store.appendEvent(argv.id, 'ScopeRefined', `User refined problem scope to v${newVersion}`);
                  
                  console.log(chalk.green(`\n✅ Problem scope updated to v${newVersion}`));
                  console.log(chalk.gray(`   Previous versions saved to history`));
                  console.log(chalk.gray('   Run: piper analyze ' + argv.id));
              }
              
          } else if (choice === 3) {
              // Need more evidence
              console.log(chalk.yellow('\n📎 Additional evidence needed'));
              console.log(chalk.white('   What evidence would help refine the scope?'));
              console.log(chalk.gray('\n   Examples:'));
              console.log(chalk.gray('   • Full pipeline YAML file'));
              console.log(chalk.gray('   • Service connection export'));
              console.log(chalk.gray('   • Azure portal screenshots'));
              console.log(chalk.gray('   • Application logs'));
              console.log(chalk.white('\n   Add evidence using:'));
              console.log(chalk.gray('   piper add-evidence ' + argv.id + ' <file-path>'));
              console.log(chalk.gray('\n   Then run: piper scope ' + argv.id + ' again'));
          }
          
      } catch (err: any) {
          console.error(chalk.red(`Failed to analyze scope: ${err.message}`));
          if (process.env.DEBUG) {
              console.error(err.stack);
          }
      }
  })
  .command('scope-history <id>', 'View historical changes to problem scope', {}, async (argv: any) => {
      try {
          const c = await store.load(argv.id);
          
          if (!c.scopeHistory || c.scopeHistory.length === 0) {
              console.log(chalk.yellow('\n⚠️  No scope history available'));
              console.log(chalk.gray('   This case has not had its scope refined yet'));
              return;
          }
          
          console.log(chalk.bold.cyan(`\n📜 SCOPE HISTORY FOR CASE ${argv.id}`));
          console.log(chalk.gray(`   Total versions: ${c.scopeHistory.length + 1} (including current)\n`));
          
          // Show current version first
          if (c.problemScope) {
              console.log(chalk.bold.green(`Version ${c.problemScope.version || 'current'} (CURRENT)`));
              console.log(chalk.gray(`   Generated: ${c.problemScope.timestamp ? new Date(c.problemScope.timestamp).toLocaleString() : 'Unknown'}`));
              console.log(chalk.white(`   Summary: ${c.problemScope.summary}`));
              console.log(chalk.gray(`   Components: ${c.problemScope.affectedComponents.slice(0, 3).join(', ')}${c.problemScope.affectedComponents.length > 3 ? '...' : ''}`));
              console.log();
          }
          
          // Show history in reverse chronological order
          const sortedHistory = [...c.scopeHistory].sort((a, b) => b.version - a.version);
          
          for (const historical of sortedHistory) {
              console.log(chalk.bold(`Version ${historical.version}`));
              console.log(chalk.gray(`   Generated: ${new Date(historical.timestamp).toLocaleString()}`));
              if (historical.reason) {
                  console.log(chalk.yellow(`   Reason: ${historical.reason}`));
              }
              console.log(chalk.white(`   Summary: ${historical.summary}`));
              console.log(chalk.gray(`   Components: ${historical.affectedComponents.slice(0, 3).join(', ')}${historical.affectedComponents.length > 3 ? '...' : ''}`));
              console.log();
          }
          
          console.log(chalk.cyan('💡 Tip: Run `piper scope ' + argv.id + '` to generate a new version'));
          
      } catch (err: any) {
          console.error(chalk.red(`Failed to retrieve scope history: ${err.message}`));
          if (process.env.DEBUG) {
              console.error(err.stack);
          }
      }
  })
  .command('status <id>', 'Show troubleshooting status and next steps', {}, async (argv: any) => {
      try {
          const c = await store.load(argv.id);
          
          console.log(chalk.bold.cyan(`\n📊 TROUBLESHOOTING STATUS: ${c.title}`));
          console.log(chalk.gray(`   Case ID: ${c.id}`));
          console.log(chalk.gray(`   State: ${c.state}`));
          
          // Scope status
          if (!c.scopeConfirmed) {
              console.log(chalk.bold.yellow('\n⚠️  SCOPE NOT CONFIRMED'));
              console.log(chalk.white('   You need to define and confirm the problem scope first.'));
              console.log(chalk.cyan('\n   Next step: ') + chalk.gray(`piper scope ${c.id}`));
              return;
          }
          
          console.log(chalk.bold.green('\n✅ SCOPE CONFIRMED'));
          if (c.problemScope) {
              console.log(chalk.gray(`   ${c.problemScope.summary.substring(0, 80)}...`));
              if (c.templateId) {
                  console.log(chalk.gray(`   Template: ${c.templateId} (${c.classification || 'General'})`));
              }
          }
          
          // Evidence status
          const totalEvidence = c.evidence.length;
          const redactedCount = c.evidence.filter(e => e.isRedacted).length;
          console.log(chalk.bold.cyan(`\n📁 EVIDENCE: ${totalEvidence} file(s)`));
          if (redactedCount > 0) {
              console.log(chalk.gray(`   ${redactedCount} files redacted for privacy`));
          }
          
          // Question progress
          const openQuestions = c.questions.filter(q => q.status === 'Open');
          const answeredQuestions = c.questions.filter(q => q.status === 'Answered');
          const totalQuestions = c.questions.length;
          
          if (totalQuestions === 0) {
              console.log(chalk.bold.yellow('\n⚠️  NO DIAGNOSTIC QUESTIONS'));
              console.log(chalk.white('   No template applied yet - using generic workflow.'));
              console.log(chalk.cyan('\n   Next step: ') + chalk.gray(`piper analyze ${c.id}`));
              return;
          }
          
          console.log(chalk.bold.cyan(`\n❓ QUESTIONS: ${answeredQuestions.length}/${totalQuestions} answered`));
          
          if (openQuestions.length === 0) {
              console.log(chalk.bold.green('   ✅ All questions answered!'));
              console.log(chalk.white('\n   Ready to generate troubleshooting plan.'));
              console.log(chalk.cyan('\n   Next step: ') + chalk.gray(`piper next ${c.id}`));
              return;
          }
          
          // Show next required questions
          console.log(chalk.white('\n   Open questions:'));
          const requiredOpen = openQuestions.filter(q => q.required).slice(0, 3);
          requiredOpen.forEach((q, idx) => {
              console.log(chalk.yellow(`   ${idx + 1}. ${q.ask} ${q.verificationRequired ? '(requires file evidence)' : ''}`));
          });
          
          if (openQuestions.length > requiredOpen.length) {
              console.log(chalk.gray(`   ... and ${openQuestions.length - requiredOpen.length} more`));
          }
          
          // Evidence collection suggestions
          const needsEvidence = openQuestions.some(q => q.verificationRequired);
          if (needsEvidence) {
              console.log(chalk.bold.cyan('\n📎 EVIDENCE NEEDED'));
              console.log(chalk.white('   Some questions require file-based evidence:'));
              const evidenceQuestions = openQuestions.filter(q => q.verificationRequired).slice(0, 2);
              evidenceQuestions.forEach(q => {
                  console.log(chalk.gray(`   • ${q.ask}`));
                  if (q.guidance) {
                      const guidanceLine = q.guidance.split('\n')[0];
                      console.log(chalk.gray(`     How: ${guidanceLine}`));
                  }
              });
              console.log(chalk.cyan('\n   Add evidence: ') + chalk.gray(`piper add-evidence ${c.id} <file-path>`));
          }
          
          // Next steps
          console.log(chalk.bold.cyan('\n🔄 NEXT STEPS'));
          if (needsEvidence) {
              console.log(chalk.white('   1. Collect required evidence files'));
              console.log(chalk.white('   2. Add evidence: ') + chalk.gray(`piper add-evidence ${c.id} <file>`));
              console.log(chalk.white('   3. Answer questions: ') + chalk.gray(`piper analyze ${c.id}`));
          } else {
              console.log(chalk.white('   1. Answer open questions: ') + chalk.gray(`piper analyze ${c.id}`));
              console.log(chalk.white('   2. Or add more evidence: ') + chalk.gray(`piper add-evidence ${c.id} <file>`));
          }
          console.log(chalk.white('   4. Check status: ') + chalk.gray(`piper status ${c.id}`));
          
          // Success indication
          console.log(chalk.bold.cyan('\n💡 TIP'));
          console.log(chalk.gray('   When you\'ve resolved the issue, run: ') + chalk.white(`piper resolve ${c.id}`));
          
      } catch (err: any) {
          console.error(chalk.red(`Failed to show status: ${err.message}`));
          if (process.env.DEBUG) {
              console.error(err.stack);
          }
      }
  })
  .command('analyze <id>', 'Analyze evidence and suggest answers to open questions', {
      autoApply: {
          type: 'boolean',
          description: 'Automatically apply high-confidence answers without review',
          default: false
      },
      verbose: {
          alias: 'v',
          type: 'boolean',
          description: 'Show detailed extraction information for debugging',
          default: false
      }
  }, async (argv: any) => {
      try {
          const c = await store.load(argv.id);
          console.log(chalk.blue(`🔍 Analyzing evidence for case: ${c.title}`));
          
          // Show current progress upfront
          const totalQuestions = c.questions.length;
          const answeredCount = c.questions.filter(q => q.status === 'Answered').length;
          const openCount = c.questions.filter(q => q.status === 'Open').length;
          const requiredOpen = c.questions.filter(q => q.status === 'Open' && q.required).length;
          
          if (totalQuestions > 0) {
              console.log(chalk.gray(`Progress: ${answeredCount}/${totalQuestions} questions answered (${requiredOpen} required remaining)`));
          }
          
          // Check if scope has been confirmed first
          if (!c.scopeConfirmed) {
              console.log(chalk.yellow('\n⚠️  Problem scope must be confirmed before answering diagnostic questions'));
              console.log(chalk.gray('   Run: piper scope ' + argv.id + ' to define and confirm the problem scope\n'));
              return;
          }
          
          const openQuestions = c.questions.filter(q => q.status === 'Open');
          if (openQuestions.length === 0) {
              console.log(chalk.green('✓ All questions have been answered'));
              console.log(chalk.cyan('\n⚡ Auto-progressing to next state...\n'));
              
              // Automatically progress to next state
              const result = await orchestrator.next(argv.id);
              const updatedCase = await store.load(argv.id);
              
              if (result.autoProgressed) {
                  console.log(chalk.cyan(`⚡ Auto-progressed through analytical states to ${updatedCase.state}`));
              } else {
                  console.log(chalk.green(`✓ Case ${updatedCase.id} moved to ${updatedCase.state}`));
              }
              
              // Show troubleshooting report if generated
              if (result.report) {
                  console.log(result.report);
              }
              
              // Prompt for next action based on state
              if (updatedCase.state === 'Plan') {
                  const stillOpenQuestions = updatedCase.questions.filter(q => q.status === 'Open');
                  if (stillOpenQuestions.length > 0) {
                      console.log(chalk.yellow(`\n⚠️  Action Required: Answer ${stillOpenQuestions.length} remaining question(s)`));
                      console.log(chalk.gray(`   Run: piper analyze ${updatedCase.id}`));
                  }
                  // No additional prompt - remediation plan already shows what to do
              } else if (updatedCase.state === 'Execute') {
                  console.log(chalk.yellow(`\n🔧 Execution phase - apply fixes based on validated hypotheses`));
              } else if (updatedCase.state === 'Evaluate') {
                  console.log(chalk.yellow(`\n🔍 Evaluation phase - verify if issue is resolved`));
              }
              
              return;
          }

          const llmEnabled = process.env.LLM_ENABLED === 'true';
          const llmProvider = process.env.LLM_PROVIDER || 'openai';
          console.log(chalk.gray(`Found ${openQuestions.length} open questions`));
          console.log(chalk.gray(`Analyzing ${c.evidence.length} evidence files...`));
          
          // Show PII protection status
          const redactedFiles = c.evidence.filter(e => e.isRedacted).length;
          if (redactedFiles > 0) {
              console.log(chalk.green(`🔒 PII Protection: ${redactedFiles}/${c.evidence.length} files redacted`));
          } else {
              console.log(chalk.gray(`🔒 PII Protection: No sensitive data detected`));
          }
          
          if (llmEnabled) {
              const providerName = llmProvider === 'copilot' || llmProvider === 'copilot-auto' ? 'AI (Copilot)' :
                                   llmProvider === 'openai' ? 'AI (OpenAI)' :
                                   llmProvider === 'azure' ? 'AI (Azure OpenAI)' : 'AI';
              console.log(chalk.cyan(`✨ Using AI-powered analysis (${providerName})`));
              console.log(chalk.gray(`   Note: All evidence is pre-redacted before AI analysis`));
          } else {
              console.log(chalk.gray('Using pattern matching analysis'));
          }
          console.log('');

          if (argv.verbose) {
              console.log(chalk.gray('\n=== VERBOSE MODE ==='));
              console.log(chalk.gray(`Evidence files loaded: ${c.evidence.length}`));
              console.log(chalk.gray(`Questions to analyze: ${openQuestions.map(q => q.ask).join(', ')}\n`));
          }

          const { suggestions } = await orchestrator.analyzeEvidenceForAnswers(argv.id);

          if (argv.verbose) {
              console.log(chalk.gray(`\nExtraction results: ${suggestions.length} suggestions found`));
              suggestions.forEach(s => {
                  console.log(chalk.gray(`  - Q${s.questionId}: ${s.confidence} confidence`));
              });
              console.log(chalk.gray('===================\n'));
          }

          console.log(chalk.green(`✓ Found ${suggestions.length} auto-suggested answers\n`));

          const toApply: Array<{ questionId: string; suggestedAnswer: string }> = [];
          const answeredQuestionIds = new Set<string>();

          // FIRST: Try to auto-extract answers from evidence
          console.log(chalk.cyan('🔍 Step 1: Extracting answers from existing evidence...\n'));
          let autoExtracted: any[] = [];
          
          try {
              autoExtracted = await orchestrator.autoExtractAnswers(argv.id);
              
              if (autoExtracted.length > 0) {
                  console.log(chalk.green(`✅ Auto-extracted ${autoExtracted.length} answer(s) from evidence\n`));
                  
                  for (const extraction of autoExtracted) {
                      const q = openQuestions.find(question => question.id === extraction.questionId);
                      if (!q) continue;
                      
                      const confidenceColor = extraction.confidence === 'high' ? chalk.green :
                                            extraction.confidence === 'medium' ? chalk.yellow :
                                            chalk.gray;
                      
                      console.log(confidenceColor(`📋 Q: ${q.ask}`));
                      console.log(confidenceColor(`   [${q.id}] ${extraction.confidence.toUpperCase()} confidence`));
                      console.log(chalk.white(`   Answer: ${extraction.extractedAnswer}`));
                      console.log(chalk.gray(`   Found in: ${extraction.evidenceRefs.length} file(s)\n`));
                      
                      // Auto-apply high confidence extractions
                      if (extraction.confidence === 'high') {
                          toApply.push({
                              questionId: extraction.questionId,
                              suggestedAnswer: `[From Evidence] ${extraction.extractedAnswer}`
                          });
                          answeredQuestionIds.add(extraction.questionId);
                          console.log(chalk.green('   ✅ Auto-applied (high confidence)\n'));
                      } else {
                          // For medium/low, ask for confirmation
                          const readline = require('readline').createInterface({
                              input: process.stdin,
                              output: process.stdout
                          });
                          
                          const confirm = await new Promise<string>(resolve => {
                              readline.question(chalk.yellow('   Apply this answer? [Y/n/edit]: '), (ans: string) => {
                                  resolve(ans);
                              });
                          });
                          
                          readline.close();
                          
                          const trimmed = confirm.trim().toLowerCase();
                          if (trimmed === '' || trimmed === 'y' || trimmed === 'yes') {
                              toApply.push({
                                  questionId: extraction.questionId,
                                  suggestedAnswer: `[From Evidence] ${extraction.extractedAnswer}`
                              });
                              answeredQuestionIds.add(extraction.questionId);
                              console.log(chalk.green('   ✅ Applied\n'));
                          } else if (trimmed === 'edit' || trimmed === 'e') {
                              const editReadline = require('readline').createInterface({
                                  input: process.stdin,
                                  output: process.stdout
                              });
                              
                              const edited = await new Promise<string>(resolve => {
                                  editReadline.question(chalk.yellow(`   Edit answer: `), (ans: string) => {
                                      resolve(ans);
                                  });
                              });
                              
                              editReadline.close();
                              
                              if (edited.trim()) {
                                  toApply.push({
                                      questionId: extraction.questionId,
                                      suggestedAnswer: edited.trim()
                                  });
                                  answeredQuestionIds.add(extraction.questionId);
                                  console.log(chalk.green('   ✅ Applied edited answer\n'));
                              }
                          } else {
                              console.log(chalk.gray('   ⊘ Skipped\n'));
                          }
                      }
                  }
              } else {
                  console.log(chalk.yellow('⚠️  Could not auto-extract answers - evidence may not contain the information\n'));
                  console.log(chalk.gray('   Tip: Use "piper search <id> <term>" to find specific content in evidence\n'));
              }
          } catch (err: any) {
              console.log(chalk.yellow(`⚠️  Auto-extraction failed: ${err.message}`));
              console.log(chalk.gray('   Falling back to manual question flow\n'));
          }
          
          // SECOND: Show AI-suggested answers that weren't auto-extracted
          console.log(chalk.cyan('🤖 Step 2: AI-powered answer suggestions...\n'));

          // PII-sensitive question patterns to auto-handle
          const piiPatterns = [
              /subscription\s+id/i,
              /resource\s+group/i,
              /tenant\s+id/i,
              /client\s+id/i,
              /account\s+name/i
          ];

          for (const suggestion of suggestions) {
              // Check if question is PII-sensitive
              const isPII = piiPatterns.some(pattern => pattern.test(suggestion.question));
              
              if (isPII) {
                  // Auto-apply PII answers from evidence without prompting
                  if (suggestion.suggestedAnswer) {
                      toApply.push({
                          questionId: suggestion.questionId,
                          suggestedAnswer: suggestion.suggestedAnswer
                      });
                      console.log(chalk.cyan(`\nQ: ${suggestion.question}`));
                      console.log(chalk.gray(`   🔒 PII-sensitive - auto-extracted from evidence`));
                      console.log(chalk.green(`   ✓ Applied: [REDACTED]`));
                      answeredQuestionIds.add(suggestion.questionId);
                  }
                  continue;
              }
              
              const confidenceColor = 
                  suggestion.confidence === 'high' ? chalk.green :
                  suggestion.confidence === 'medium' ? chalk.yellow :
                  chalk.red;

              console.log(chalk.cyan(`\nQ: ${suggestion.question}`));
              
              // Show search instructions if available
              if (suggestion.searchInstructions) {
                  console.log(chalk.blue(`   💡 Tip: ${suggestion.searchInstructions}`));
              }
              
              // Show options
              console.log(chalk.white(`\n   Options:`));
              console.log(confidenceColor(`   1) ${suggestion.suggestedAnswer} ${confidenceColor(`[${suggestion.confidence.toUpperCase()}]`)}`));
              
              // Show alternatives if available
              if (suggestion.alternatives && suggestion.alternatives.length > 0) {
                  suggestion.alternatives.forEach((alt, idx) => {
                      const altColor = alt.confidence === 'high' ? chalk.green :
                                      alt.confidence === 'medium' ? chalk.yellow :
                                      chalk.red;
                      console.log(altColor(`   ${idx + 2}) ${alt.answer} ${altColor(`[${alt.confidence.toUpperCase()}]`)}`));
                  });
              }
              
              console.log(chalk.gray(`   ${(suggestion.alternatives?.length || 0) + 2}) Other (enter custom answer)`));
              console.log(chalk.gray(`   ${(suggestion.alternatives?.length || 0) + 3}) Skip`));
              console.log(chalk.gray(`\n   Evidence: ${suggestion.evidenceRefs.length} files`));

              if (argv.autoApply && suggestion.confidence === 'high') {
                  toApply.push({
                      questionId: suggestion.questionId,
                      suggestedAnswer: suggestion.suggestedAnswer
                  });
                  console.log(chalk.green('   ✓ Auto-applying option 1 (high confidence)'));
              } else if (!argv.autoApply) {
                  // Interactive confirmation with multiple choice
                  const readline = require('readline').createInterface({
                      input: process.stdin,
                      output: process.stdout
                  });

                  const maxOption = (suggestion.alternatives?.length || 0) + 3;
                  const answer = await new Promise<string>(resolve => {
                      readline.question(chalk.yellow(`   Select option (1-${maxOption}) [default=1]: `), (ans: string) => {
                          resolve(ans);
                      });
                  });

                  readline.close();

                  const trimmedAnswer = answer.trim();
                  const choice = trimmedAnswer === '' ? 1 : parseInt(trimmedAnswer);
                  
                  if (choice === 1) {
                      toApply.push({
                          questionId: suggestion.questionId,
                          suggestedAnswer: suggestion.suggestedAnswer
                      });
                      console.log(chalk.green('   ✓ Applied option 1'));
                  } else if (choice > 1 && choice <= (suggestion.alternatives?.length || 0) + 1 && suggestion.alternatives) {
                      const selectedAlt = suggestion.alternatives[choice - 2];
                      toApply.push({
                          questionId: suggestion.questionId,
                          suggestedAnswer: selectedAlt.answer
                      });
                      console.log(chalk.green(`   ✓ Applied option ${choice}`));
                  } else if (choice === maxOption - 1) {
                      // Other - custom answer
                      const customReadline = require('readline').createInterface({
                          input: process.stdin,
                          output: process.stdout
                      });

                      const custom = await new Promise<string>(resolve => {
                          customReadline.question(chalk.yellow('   Enter your answer: '), (ans: string) => {
                              resolve(ans);
                          });
                      });

                      customReadline.close();

                      if (custom.trim()) {
                          toApply.push({
                              questionId: suggestion.questionId,
                              suggestedAnswer: custom.trim()
                          });
                          console.log(chalk.green('   ✓ Applied custom answer'));
                      }
                  } else {
                      console.log(chalk.gray('   ⊘ Skipped'));
                  }
              }

              console.log('');
              answeredQuestionIds.add(suggestion.questionId);
          }

          // Now handle questions without auto-suggestions
          const unansweredQuestions = openQuestions.filter(q => !answeredQuestionIds.has(q.id));
          
          if (unansweredQuestions.length > 0) {
              console.log(chalk.yellow(`\n📝 ${unansweredQuestions.length} questions could not be auto-answered from evidence\n`));
              
              try {
                  for (const q of unansweredQuestions) {
                      await handleInteractiveQuestion(q, argv.id, toApply, orchestrator);
                  }
              } catch (interruptErr: any) {
                  // Handle Ctrl+C or other interruptions gracefully
                  console.log(chalk.yellow(`\n\n⚠️  Evidence collection interrupted`));
                  console.log(chalk.gray(`   Some questions remain unanswered\n`));
                  
                  // Save any answers collected so far
                  if (toApply.length > 0) {
                      await orchestrator.applyAnswerSuggestions(argv.id, toApply);
                      console.log(chalk.green(`✓ Saved ${toApply.length} answer(s) before interruption\n`));
                  }
                  
                  // Show how to continue
                  const currentCase = await store.load(argv.id);
                  const remainingOpen = currentCase.questions.filter(q => q.status === 'Open');
                  const remainingRequired = remainingOpen.filter(q => q.required);
                  
                  console.log(chalk.bold.cyan('📋 TO CONTINUE:\n'));
                  console.log(chalk.white(`   Resume evidence collection: `) + chalk.gray(`piper analyze ${argv.id}`));
                  console.log(chalk.white(`   Check progress: `) + chalk.gray(`piper status ${argv.id}`));
                  console.log(chalk.white(`   Add evidence first: `) + chalk.gray(`piper add-evidence ${argv.id} <file>`));
                  
                  if (remainingRequired.length > 0) {
                      console.log(chalk.red(`\n   ⚠️  ${remainingRequired.length} REQUIRED question(s) still need answers`));
                  }
                  
                  return; // Exit early
              }
          }

          if (toApply.length > 0) {
              await orchestrator.applyAnswerSuggestions(argv.id, toApply);
              console.log(chalk.green.bold(`\n✅ Applied ${toApply.length} answers`));
              
              // Show summary
              const updatedCase = await store.load(argv.id);
              const stillOpen = updatedCase.questions.filter(q => q.status === 'Open');
              const answered = updatedCase.questions.filter(q => q.status === 'Answered');
              
              console.log(chalk.gray(`\nProgress: ${answered.length}/${updatedCase.questions.length} questions answered`));
              
              if (stillOpen.length > 0) {
                  const requiredOpen = stillOpen.filter(q => q.required);
                  if (requiredOpen.length > 0) {
                      console.log(chalk.red(`${requiredOpen.length} REQUIRED questions still open`));
                  } else {
                      console.log(chalk.yellow(`${stillOpen.length} optional questions still open`));
                  }
                  
                  // Show clear next steps
                  console.log(chalk.bold.cyan('\n📋 NEXT STEPS:\n'));
                  console.log(chalk.white('   1. Continue answering: ') + chalk.cyan(`piper analyze ${argv.id}`));
                  console.log(chalk.white('   2. Add more evidence: ') + chalk.cyan(`piper add-evidence ${argv.id} <file>`));
                  console.log(chalk.white('   3. Check what\'s needed: ') + chalk.cyan(`piper status ${argv.id}`));
                  console.log(chalk.white('   4. Search existing evidence: ') + chalk.cyan(`piper search ${argv.id} <term>`));
                  
                  if (requiredOpen.length > 0) {
                      console.log(chalk.red('\n   ⚠️  Case cannot progress until REQUIRED questions are answered'));
                  }
              } else {
                  console.log(chalk.green.bold('✅ All questions answered!'));
                  console.log(chalk.cyan('\n⚡ Auto-progressing to next state...\n'));
                  
                  // Automatically progress to next state
                  const result = await orchestrator.next(argv.id);
                  const nextCase = await store.load(argv.id);
                  
                  if (result.autoProgressed) {
                      console.log(chalk.cyan(`⚡ Auto-progressed through analytical states to ${nextCase.state}`));
                  } else {
                      console.log(chalk.green(`✓ Case ${nextCase.id} moved to ${nextCase.state}`));
                  }
                  
                  // Show troubleshooting report if generated
                  if (result.report) {
                      console.log(result.report);
                  }
                  
                  // Show detailed next steps with evidence needs
                  console.log(chalk.bold.cyan('\n📋 NEXT STEPS'));
                  
                  // Identify what evidence is missing based on unanswered questions
                  const openRequiredQuestions = nextCase.questions.filter(q => q.status === 'Open' && q.required);
                  const openOptionalQuestions = nextCase.questions.filter(q => q.status === 'Open' && !q.required);
                  
                  if (openRequiredQuestions.length > 0 || openOptionalQuestions.length > 0) {
                      console.log(chalk.yellow(`\n⚠️  More evidence needed to complete analysis`));
                      console.log(chalk.gray(`   ${openRequiredQuestions.length} required, ${openOptionalQuestions.length} optional questions remain\n`));
                      
                      // Show top 3 evidence needs with guidance
                      const topQuestions = [...openRequiredQuestions, ...openOptionalQuestions].slice(0, 3);
                      
                      console.log(chalk.bold.white('📦 EVIDENCE TO COLLECT:\n'));
                      topQuestions.forEach((q, idx) => {
                          console.log(chalk.cyan(`${idx + 1}. ${q.ask}`));
                          
                          if (q.guidance) {
                              const guidancePreview = q.guidance.length > 100 
                                  ? q.guidance.substring(0, 100) + '...'
                                  : q.guidance;
                              console.log(chalk.gray(`   💡 ${guidancePreview}`));
                          }
                          
                          if (q.examples && q.examples.length > 0) {
                              console.log(chalk.gray(`   📝 Example: ${q.examples[0]}`));
                          }
                          console.log('');
                      });
                      
                      if (openRequiredQuestions.length + openOptionalQuestions.length > 3) {
                          console.log(chalk.gray(`   ... and ${openRequiredQuestions.length + openOptionalQuestions.length - 3} more\n`));
                      }
                      
                      console.log(chalk.bold.white('🔧 HOW TO PROCEED:\n'));
                      console.log(chalk.white('   1. Collect the evidence files listed above'));
                      console.log(chalk.white(`   2. Add each file: `) + chalk.gray(`piper add-evidence ${nextCase.id} <file-path>`));
                      console.log(chalk.white(`   3. Re-analyze with new evidence: `) + chalk.gray(`piper analyze ${nextCase.id}`));
                      console.log(chalk.white(`   4. Or manually answer: `) + chalk.gray(`piper answer ${nextCase.id}`));
                      
                  } else if (nextCase.state === 'Plan') {
                      console.log(chalk.green(`\n✅ All diagnostic questions answered!`));
                      console.log(chalk.gray(`   Analysis complete, ready for action planning\n`));
                      console.log(chalk.bold.white('🔧 NEXT ACTION:\n'));
                      console.log(chalk.white(`   Continue to planning: `) + chalk.gray(`piper next ${nextCase.id}`));
                      
                  } else if (nextCase.state === 'Execute') {
                      console.log(chalk.yellow(`\n🔧 Ready to execute remediation`));
                      console.log(chalk.gray(`   Apply fixes based on validated hypotheses\n`));
                      console.log(chalk.bold.white('🔧 NEXT ACTION:\n'));
                      console.log(chalk.white(`   View recommendations: `) + chalk.gray(`piper show ${nextCase.id}`));
                      console.log(chalk.white(`   Apply fixes and verify resolution`));
                      console.log(chalk.white(`   When resolved: `) + chalk.gray(`piper resolve ${nextCase.id}`));
                      
                  } else if (nextCase.state === 'Evaluate') {
                      console.log(chalk.yellow(`\n🔍 Evaluation phase`));
                      console.log(chalk.gray(`   Verify if issue is resolved\n`));
                      console.log(chalk.bold.white('🔧 NEXT ACTION:\n'));
                      console.log(chalk.white(`   Test the fix and verify resolution`));
                      console.log(chalk.white(`   If resolved: `) + chalk.gray(`piper resolve ${nextCase.id}`));
                      console.log(chalk.white(`   If not: `) + chalk.gray(`piper add-evidence ${nextCase.id} <new-logs>`));
                  }
                  
                  // Show status command hint
                  console.log(chalk.gray(`\n💡 Check progress anytime: `) + chalk.cyan(`piper status ${nextCase.id}`))
              }
          } else {
              console.log(chalk.yellow('No answers applied'));
          }

      } catch (err: any) {
          console.error(chalk.red(`Failed to analyze case: ${err.message}`));
      }
  })
  .command('resume <id>', 'Resume work on an existing case', {}, async (argv: any) => {
      try {
          const c = await store.load(argv.id);
          console.log(chalk.blue(`📂 Resuming case: ${c.title}`));
          console.log(chalk.gray(`Case ID: ${c.id}`));
          console.log(chalk.gray(`Current State: ${c.state}`));
          console.log(chalk.gray(`Classification: ${c.classification || 'Unknown'}`));
          
          if (c.templateId) {
              const template = await templateMgr.load(c.templateId);
              console.log(chalk.gray(`Template: ${template.name} (v${template.version})`));
          }
          
          // Show open questions
          const openQuestions = c.questions.filter(q => q.status === 'Open');
          if (openQuestions.length > 0) {
              console.log(chalk.yellow(`\n❓ Open Questions (${openQuestions.length}):`));
              openQuestions.forEach(q => {
                  console.log(chalk.yellow(`  • [${q.id}] ${q.ask}`));
              });
          }
          
          // Show active hypotheses
          const activeHypotheses = c.hypotheses.filter(h => h.status === 'Open');
          if (activeHypotheses.length > 0) {
              console.log(chalk.cyan(`\n💡 Active Hypotheses (${activeHypotheses.length}):`));
              activeHypotheses.forEach(h => {
                  console.log(chalk.cyan(`  • ${h.description}`));
              });
          }
          
          // Show constraints
          if (c.constraints && c.constraints.length > 0) {
              console.log(chalk.red(`\n⚠ Constraints (${c.constraints.length}):`));
              c.constraints.forEach(k => {
                  console.log(chalk.red(`  • [${k.reason}] ${k.description}`));
              });
          }
          
          console.log(chalk.green.bold(`\n✅ Case context loaded. Continue with:`));
          console.log(chalk.gray(`  piper show ${c.id} - View full details`));
          console.log(chalk.gray(`  piper answer ${c.id} <qid> <value> - Answer questions`));
          console.log(chalk.gray(`  piper next ${c.id} - Advance to next state`));
          
          await store.appendEvent(c.id, 'CaseResumed', 'User resumed work on case');
          
      } catch (err: any) {
          console.error(chalk.red(`Failed to resume case: ${err.message}`));
      }
  })

  .command('new <title>', 'Create a new case', {
      template: {
          alias: 't',
          type: 'string',
          description: 'Path to filled intake template file'
      },
      strict: {
        type: 'boolean', 
        default: true,
        description: 'Enable strict systematic mode'
      }
  }, async (argv: any) => {
    const id = uuidv4().slice(0, 8);
    
    let newCase: Case = {
        id,
        principlesVersion: "1.0",
        title: argv.title,
        state: CaseState.Intake,
        formal: { expected: "", actual: "" },
        hypotheses: [],
        questions: [],
        evidence: [],
        events: [],
        unknowns: [],
        strictMode: argv.strict,
        constraints: [] 
    };

    // Template Parsing Logic
    if (argv.template) {
        if (await fs.pathExists(argv.template)) {
            const content = await fs.readFile(argv.template, 'utf-8');
            const parsed = IntakeParser.parse(content);
            
            // Merge valid parsed fields
            if (parsed.formal?.actual) newCase.formal.actual = parsed.formal.actual;
            if (parsed.unknowns) newCase.unknowns.push(...parsed.unknowns);
            
            // Attach the intake form itself as evidence (Redacted automatically)
            // Note: We access evidenceMgr here, which requires it to be initialized before this command runs (it is)
            const { evidence: ev } = await evidenceMgr.addFile(id, argv.template, ["intake-form"]);
            newCase.evidence.push(ev);
            
            console.log(`Parsed template. Found description and ${parsed.unknowns?.length} env details.`);
        } else {
            console.warn(`Template file not found: ${argv.template}. created empty case.`);
        }
    }

    await store.save(newCase);
    await store.appendEvent(id, 'CaseCreated', `Created case: ${argv.title}`);
    console.log(`Case ${id} created.`);
  })
  .command('clear', 'Delete all cases', {
      force: {
          alias: 'f',
          type: 'boolean',
          description: 'Force deletion without confirmation',
          default: false
      },
      backup: {
          alias: 'b',
          type: 'boolean',
          description: 'Create timestamped backup before clearing',
          default: false
      }
  }, async (argv: any) => {
      if (!argv.force) {
          const readline = require('readline').createInterface({
              input: process.stdin,
              output: process.stdout
          });
          
          const answer = await new Promise<string>(resolve => {
              readline.question('Are you sure you want to delete ALL cases and evidence? This cannot be undone. [y/N] ', (ans: string) => {
                  resolve(ans);
              });
          });
          
          readline.close();
          
          if (!answer || !['y', 'yes'].includes(answer.toLowerCase())) {
              console.log('Operation cancelled.');
              return;
          }
      }

      try {
          if (argv.backup) {
              console.log('Creating backup...');
              const backupPath = await store.createBackup();
              console.log(`Backup created: ${backupPath}`);
          }
          
          await store.deleteAll();
          console.log('All cases and evidence have been deleted.');
      } catch (err: any) {
          console.error('Failed to clear cases:', err.message);
      }
  })
  .command('ingest <problem> <zipPath>', 'Start tracking a new problem with evidence', {
      template: {
          alias: 't',
          type: 'string',
          description: 'Specific template ID to use (skip auto-matching)'
      },
      deleteOriginal: {
          type: 'boolean',
          description: 'Delete original zip after extraction',
          default: false
      },
      autoAnalyze: {
          alias: 'a',
          type: 'boolean',
          description: 'Automatically start analysis after ingestion',
          default: false
      },
      context: {
          alias: 'c',
          type: 'string',
          description: 'Context/domain for analysis (pipelines, azure, kubernetes, terraform, docker)',
          default: 'general'
      }
  }, async (argv: any) => {
      const id = uuidv4().substring(0, 8);
      
      try {
          console.log(chalk.blue(`🚀 Starting case ingestion: ${argv.problem}`));
          console.log(chalk.gray(`Case ID: ${id}`));
          
          // Step 1: Extract zip to staging
          console.log(chalk.gray('📦 Extracting zip to staging area...'));
          const stagingPath = await evidenceMgr.extractZipToStaging(
              argv.zipPath,
              (msg) => console.log(chalk.gray(`   ${msg}`))
          );
          console.log(chalk.green(`✓ Extracted to staging`));
          
          // Step 2: Template Matching
          let template = null;
          if (argv.template) {
              template = await templateMgr.load(argv.template);
              console.log(chalk.green(`✓ Using template: ${template.name}`));
          } else {
              console.log(chalk.gray('🔍 Searching for matching template...'));
              const matches = await templateMgr.match(argv.problem);
              if (matches.length > 0) {
                  template = matches[0];
                  console.log(chalk.yellow(`📋 Found template: ${template.name} (v${template.version})`));
                  await templateMgr.incrementUsage(template.id);
              } else {
                  console.log(chalk.yellow('⚠ No matching template found. Using generic workflow.'));
              }
          }
          
          // Step 3: Create Case
          const newCase: Case = {
              id,
              principlesVersion: "1.0",
              title: argv.problem,
              state: CaseState.Intake,
              formal: { 
                  expected: "System should operate without errors", 
                  actual: argv.problem 
              },
              hypotheses: template?.initialHypotheses?.map(h => ({
                  ...h,
                  status: 'Open' as const,
                  evidenceRefs: []
              })) || [],
              questions: template?.questions?.map(q => ({
                  ...q,
                  status: 'Open' as const
              })) || [],
              evidence: [],
              events: [],
              unknowns: [],
              context: argv.context,
              strictMode: true,
              constraints: [],
              templateId: template?.id,
              classification: template?.classification
          };
          
          await store.save(newCase);
          await store.appendEvent(id, 'CaseCreated', `Ingested from problem: ${argv.problem}`);
          console.log(chalk.green(`✓ Case created`));
          
          // Step 4: Ingest evidence from staging (with PII redaction)
          console.log(chalk.gray('🔒 Processing evidence (PII redaction in progress)...'));
          const { evidence: evidenceList, redactedCount } = await evidenceMgr.ingestFromStaging(
              id, 
              stagingPath, 
              ['ingestion', 'logs'],
              false,
              (current, total, filename, isRedacted) => {
                  const status = isRedacted ? chalk.red('[REDACTED]') : chalk.green('[CLEAN]');
                  console.log(chalk.gray(`   [${current}/${total}] ${filename} ${status}`));
              }
          );
          
          newCase.evidence.push(...evidenceList);
          await store.save(newCase);
          
          console.log(chalk.green(`✓ Ingested ${evidenceList.length} files`));
          if (redactedCount > 0) {
              console.log(chalk.yellow(`⚠ ${redactedCount} files contained PII and were redacted`));
              console.log(chalk.gray('   Redacted items: emails, IPs, tokens, keys, connection strings'));
              console.log(chalk.green('   ✓ Original PII removed - safe for AI analysis'));
          } else {
              console.log(chalk.green(`✓ No PII detected in evidence`));
          }
          
          // Step 5: Delete original zip if requested
          if (argv.deleteOriginal) {
              await fs.remove(argv.zipPath);
              console.log(chalk.gray(`🗑 Original zip deleted`));
          }
          
          // Auto-analyze if requested
          if (argv.autoAnalyze) {
              console.log(chalk.green.bold(`\n✅ Case ${id} created - starting analysis...`));
              try {
                  // Step 1: Progress through initial states (Intake → Classify → Normalize)
                  const result = await orchestrator.next(id);
                  let caseData = await store.load(id);
                  
                  // Step 2: Generate and confirm problem scope
                  console.log(chalk.blue(`\n📋 Analyzing evidence to define problem scope...\n`));
                  const problemScope = await orchestrator.generateProblemScope(id);
                  
                  console.log(chalk.bold.cyan('PROBLEM SCOPE ANALYSIS'));
                  console.log(chalk.bold('\n■ SUMMARY:'));
                  console.log(chalk.white('  ' + problemScope.summary));
                  
                  console.log(chalk.bold('\n■ KEY ERROR PATTERNS:'));
                  if (problemScope.errorPatterns.length > 0) {
                      problemScope.errorPatterns.forEach(pattern => {
                          console.log(chalk.red('  ✗ ' + pattern));
                      });
                  } else {
                      console.log(chalk.gray('  No specific error patterns identified'));
                  }
                  
                  console.log(chalk.bold('\n■ AFFECTED COMPONENTS:'));
                  if (problemScope.affectedComponents.length > 0) {
                      problemScope.affectedComponents.forEach(comp => {
                          console.log(chalk.yellow('  • ' + comp));
                      });
                  } else {
                      console.log(chalk.gray('  Components not yet identified'));
                  }
                  
                  if (problemScope.timeframe) {
                      console.log(chalk.bold('\n■ TIMEFRAME:'));
                      console.log(chalk.white('  ' + problemScope.timeframe));
                  }
                  
                  console.log(chalk.bold('\n■ IMPACT:'));
                  console.log(chalk.white('  ' + problemScope.impact));
                  
                  console.log(chalk.bold('\n■ EVIDENCE STATUS:'));
                  console.log(chalk.gray('  ' + problemScope.evidenceSummary));
                  
                  // Prompt for scope confirmation
                  const readline = require('readline').createInterface({
                      input: process.stdin,
                      output: process.stdout
                  });
                  
                  console.log(chalk.bold.yellow('\n❓ SCOPE CONFIRMATION:'));
                  const scopeResponse = await new Promise<string>(resolve => {
                      readline.question(
                          chalk.yellow('   1) Confirm scope and proceed to diagnostic questions\n   2) Refine scope (update problem statement)\n   3) Need more evidence first\n   \n   Select option [1-3, default=1]: '),
                          (ans: string) => resolve(ans)
                      );
                  });
                  
                  readline.close();
                  
                  const scopeChoice = scopeResponse.trim() === '' ? 1 : parseInt(scopeResponse.trim());
                  
                  if (scopeChoice === 2) {
                      // Refine scope
                      console.log(chalk.yellow('\n✏️  Enter refined problem statement:'));
                      const refineReadline = require('readline').createInterface({
                          input: process.stdin,
                          output: process.stdout
                      });
                      
                      const refined = await new Promise<string>(resolve => {
                          refineReadline.question(chalk.gray('   New statement: '), (ans: string) => resolve(ans));
                      });
                      
                      refineReadline.close();
                      
                      if (refined.trim()) {
                          problemScope.summary = refined.trim();
                          caseData.formal.actual = refined.trim();
                      }
                  } else if (scopeChoice === 3) {
                      // Need more evidence
                      console.log(chalk.yellow('\n📎 Additional evidence needed before proceeding'));
                      console.log(chalk.gray('   Add evidence using: piper add-evidence ' + id + ' <file-path>'));
                      console.log(chalk.gray('   Then run: piper scope ' + id + ' to review updated scope'));
                      return;
                  }
                  
                  // Save confirmed scope
                  caseData.problemScope = problemScope;
                  caseData.scopeConfirmed = true;
                  await store.save(caseData);
                  await store.appendEvent(id, 'ScopeConfirmed', 'User confirmed problem scope');
                  console.log(chalk.green('\n✅ Problem scope confirmed'));
                  
                  // Step 3: Now try to auto-extract answers from evidence using AI
                  let openQuestions = caseData.questions.filter(q => q.status === 'Open');
                  
                  if (openQuestions.length > 0) {
                      console.log(chalk.cyan(`\n🔍 Step 1: Auto-extracting answers from evidence...\n`));
                      
                      try {
                          const autoExtracted = await orchestrator.autoExtractAnswers(id);
                          
                          if (autoExtracted.length > 0) {
                              console.log(chalk.green(`✅ Auto-extracted ${autoExtracted.length} answer(s) from evidence\n`));
                              
                              const toApply: Array<{ questionId: string; suggestedAnswer: string }> = [];
                              
                              for (const extraction of autoExtracted) {
                                  const q = openQuestions.find(question => question.id === extraction.questionId);
                                  if (!q) continue;
                                  
                                  const confidenceColor = extraction.confidence === 'high' ? chalk.green :
                                                        extraction.confidence === 'medium' ? chalk.yellow :
                                                        chalk.gray;
                                  
                                  console.log(confidenceColor(`📋 Q: ${q.ask}`));
                                  console.log(confidenceColor(`   [${q.id}] ${extraction.confidence.toUpperCase()} confidence`));
                                  console.log(chalk.white(`   Answer: ${extraction.extractedAnswer}`));
                                  console.log(chalk.gray(`   Found in: ${extraction.evidenceRefs.length} file(s)`));
                                  
                                  // Auto-apply high confidence, ask for others in analyze step
                                  if (extraction.confidence === 'high') {
                                      toApply.push({
                                          questionId: extraction.questionId,
                                          suggestedAnswer: `[From Evidence] ${extraction.extractedAnswer}`
                                      });
                                      console.log(chalk.green('   ✅ Auto-applied (high confidence)\n'));
                                  } else {
                                      console.log(chalk.gray('   ⊙ Medium/low confidence - will be reviewed in analyze step\n'));
                                  }
                              }
                              
                              // Apply high-confidence answers
                              if (toApply.length > 0) {
                                  await orchestrator.applyAnswerSuggestions(id, toApply);
                                  console.log(chalk.green(`✓ Applied ${toApply.length} high-confidence answer(s)\n`));
                              }
                          } else {
                              console.log(chalk.yellow('⚠️  Could not auto-extract answers from current evidence'));
                              console.log(chalk.gray('   Evidence may not contain the information needed'));
                              console.log(chalk.gray('   Questions will require manual review in analyze step\n'));
                          }
                      } catch (err: any) {
                          console.log(chalk.yellow(`⚠️  Auto-extraction failed: ${err.message}`));
                          if (process.env.DEBUG) {
                              console.error(chalk.gray('   ' + err.stack));
                          }
                          console.log(chalk.gray('   Proceeding to manual question flow\n'));
                      }
                  }
                  
                  // Step 4: Check for remaining questions and provide next actions
                  const finalCase = await store.load(id);
                  const stillOpen = finalCase.questions.filter(q => q.status === 'Open');
                  const requiredOpen = stillOpen.filter(q => q.required);
                  
                  if (requiredOpen.length > 0) {
                      console.log(chalk.red.bold(`\n🚨 REQUIRED ACTIONS TO PROCEED:`));
                      console.log(chalk.yellow(`   ${requiredOpen.length} REQUIRED questions must be answered:`));
                      requiredOpen.forEach((q, i) => {
                          console.log(chalk.yellow(`   ${i + 1}. ${q.ask}`));
                      });
                      console.log(chalk.cyan(`\n   Run: piper analyze ${id}`));
                      console.log(chalk.gray(`   Or: piper answer ${id} <questionId> <answer>`));
                  } else if (stillOpen.length > 0) {
                      console.log(chalk.yellow(`\n⚠️  ${stillOpen.length} optional questions remain unanswered`));
                      console.log(chalk.gray(`   Run: piper analyze ${id} to review`));
                  } else {
                      console.log(chalk.green.bold(`\n✅ All questions answered! Ready to proceed.`));
                      console.log(chalk.cyan(`   Run: piper next ${id}`));
                  }
                  
              } catch (e: any) {
                  console.log(chalk.red(`Analysis error: ${e.message}`));
              }
          } else {
              // Not using auto-analyze, show case details
              console.log(chalk.green.bold(`\n✅ Case ${id} created`));
              console.log(chalk.cyan(`\nNext steps:`));
              console.log(chalk.gray(`   1. Review scope: piper scope ${id}`));
              console.log(chalk.gray(`   2. Answer questions: piper analyze ${id}`));
              console.log(chalk.gray(`   3. View details: piper show ${id}`));
          }
          
      } catch (err: any) {
          console.error(chalk.red(`Failed to ingest case: ${err.message}`));
          console.error(err.stack);
      }
  })
  .command('next <id>', 'Advance case state', {}, async (argv: any) => {
      try {
        const result = await orchestrator.next(argv.id);
        const c = await store.load(argv.id);
        
        if (result.autoProgressed) {
          console.log(chalk.cyan(`\n⚡ Auto-progressed through analytical states to ${c.state}`));
        } else {
          console.log(chalk.green(`\n✓ Case ${c.id} moved to ${c.state}`));
        }
        
        // Show troubleshooting report if generated
        if (result.report) {
          console.log(result.report);
        } else {
          console.log(chalk.gray('Analyzed evidence and applied gating rules.'));
        }
        
        // Prompt for next action based on state
        if (c.state === 'Plan') {
          const openQuestions = c.questions.filter(q => q.status === 'Open');
          if (openQuestions.length > 0) {
            console.log(chalk.yellow(`\n⚠️  Action Required: Answer ${openQuestions.length} remaining question(s)`));
            console.log(chalk.gray(`   Run: piper analyze ${c.id}`));
          }
          // No additional prompt - remediation plan already shows what to do
        } else if (c.state === 'Execute') {
          console.log(chalk.yellow(`\n🔧 Execution phase - apply fixes based on validated hypotheses`));
        } else if (c.state === 'Evaluate') {
          console.log(chalk.yellow(`\n🔍 Evaluation phase - verify if issue is resolved`));
        }
        
      } catch (e: any) {
        console.log(chalk.red(e.message)); // Clean error output for gating blocks
      }
  })
  .command('search <id> <query>', 'Search through case evidence files', {}, async (argv: any) => {
      try {
          const c = await store.load(argv.id);
          const query = argv.query.toLowerCase();
          
          console.log(chalk.blue(`\n🔍 Searching evidence for: "${argv.query}"\n`));
          
          let foundCount = 0;
          
          for (const ev of c.evidence) {
              const filePath = path.join(process.cwd(), 'cases', c.id, 'artifacts', ev.path);
              
              if (!fs.existsSync(filePath)) {
                  continue;
              }
              
              try {
                  const content = await fs.readFile(filePath, 'utf-8');
                  const lines = content.split('\n');
                  const matches: { lineNum: number; line: string }[] = [];
                  
                  lines.forEach((line, idx) => {
                      if (line.toLowerCase().includes(query)) {
                          matches.push({ lineNum: idx + 1, line: line.trim() });
                      }
                  });
                  
                  if (matches.length > 0) {
                      foundCount++;
                      console.log(chalk.cyan(`📄 ${ev.path} (${matches.length} matches)`));
                      console.log(chalk.gray(`   Evidence ID: ${ev.id}`));
                      
                      // Show first 5 matches
                      matches.slice(0, 5).forEach(m => {
                          console.log(chalk.white(`   Line ${m.lineNum}: ${m.line.substring(0, 100)}${m.line.length > 100 ? '...' : ''}`));
                      });
                      
                      if (matches.length > 5) {
                          console.log(chalk.gray(`   ... and ${matches.length - 5} more matches`));
                      }
                      console.log('');
                  }
              } catch (err) {
                  // Skip binary or unreadable files
              }
          }
          
          if (foundCount === 0) {
              console.log(chalk.yellow('No matches found in evidence files'));
              console.log(chalk.gray('\nTip: Try different search terms or check evidence with:'));
              console.log(chalk.gray(`     piper show ${c.id}`));
          } else {
              console.log(chalk.green(`✅ Found matches in ${foundCount} file(s)`));
          }
          
      } catch (err: any) {
          console.error(chalk.red(`Search failed: ${err.message}`));
      }
  })
  .command('triage <id>', 'Review and prioritize evidence files before analysis', {}, async (argv: any) => {
      try {
          const c = await store.load(argv.id);
          
          if (c.evidence.length === 0) {
              console.log(chalk.yellow('No evidence files to triage'));
              return;
          }
          
          console.log(chalk.bold.cyan(`\n📋 EVIDENCE TRIAGE: ${c.title}\n`));
          console.log(chalk.gray(`Help the AI focus by marking which files contain the most relevant information\n`));
          
          // Show all evidence with numbering
          c.evidence.forEach((ev, idx) => {
              const tags = ev.tags.join(', ');
              const size = ev.metadata?.size ? `${Math.round(ev.metadata.size / 1024)}KB` : 'unknown';
              const priority = ev.metadata?.priority || 'normal';
              const priorityColor = priority === 'high' ? chalk.red : priority === 'low' ? chalk.gray : chalk.white;
              
              console.log(priorityColor(`${idx + 1}. ${ev.path}`));
              console.log(chalk.gray(`   Tags: ${tags} | Size: ${size} | Priority: ${priority}`));
              console.log(chalk.gray(`   ID: ${ev.id}\n`));
          });
          
          const readline = require('readline').createInterface({
              input: process.stdin,
              output: process.stdout
          });
          
          console.log(chalk.yellow('Enter numbers of HIGH priority files (comma-separated), or Enter to skip:'));
          const highPriority = await new Promise<string>(resolve => {
              readline.question(chalk.yellow('High priority files: '), (ans: string) => resolve(ans));
          });
          
          console.log(chalk.yellow('\nEnter numbers of LOW priority files (comma-separated), or Enter to skip:'));
          const lowPriority = await new Promise<string>(resolve => {
              readline.question(chalk.yellow('Low priority files: '), (ans: string) => resolve(ans));
          });
          
          readline.close();
          
          // Update priorities
          if (highPriority.trim()) {
              const indices = highPriority.split(',').map(n => parseInt(n.trim()) - 1);
              indices.forEach(idx => {
                  if (idx >= 0 && idx < c.evidence.length) {
                      if (!c.evidence[idx].metadata) c.evidence[idx].metadata = {};
                      c.evidence[idx].metadata!.priority = 'high';
                  }
              });
          }
          
          if (lowPriority.trim()) {
              const indices = lowPriority.split(',').map(n => parseInt(n.trim()) - 1);
              indices.forEach(idx => {
                  if (idx >= 0 && idx < c.evidence.length) {
                      if (!c.evidence[idx].metadata) c.evidence[idx].metadata = {};
                      c.evidence[idx].metadata!.priority = 'low';
                  }
              });
          }
          
          await store.save(c);
          await store.appendEvent(c.id, 'EvidenceTriage', 'User prioritized evidence files');
          
          console.log(chalk.green('\n✅ Evidence priorities updated'));
          console.log(chalk.gray('\nNext steps:'));
          console.log(chalk.gray(`  • Search evidence: piper search ${c.id} "error"`));
          console.log(chalk.gray(`  • Define scope: piper scope ${c.id}`));
          
      } catch (err: any) {
          console.error(chalk.red(`Triage failed: ${err.message}`));
      }
  })
  .command('resolve <id>', 'Mark case as resolved after successful troubleshooting', {}, async (argv: any) => {
      try {
          const c = await store.load(argv.id);
          
          console.log(chalk.bold.cyan(`\n🎉 RESOLVING CASE: ${c.title}`));
          
          const readline = require('readline').createInterface({
              input: process.stdin,
              output: process.stdout
          });
          
          // Ask for resolution summary
          console.log(chalk.white('\nPlease provide a brief summary of how the issue was resolved:'));
          const resolutionSummary = await new Promise<string>(resolve => {
              readline.question(chalk.gray('Resolution: '), (ans: string) => resolve(ans));
          });
          
          // Ask if they want to share root cause
          console.log(chalk.white('\nWhat was the root cause? (optional):'));
          const rootCause = await new Promise<string>(resolve => {
              readline.question(chalk.gray('Root cause: '), (ans: string) => resolve(ans));
          });
          
          readline.close();
          
          if (resolutionSummary.trim()) {
              c.state = CaseState.Resolve;
              c.outcome = {
                  verdict: 'Resolved',
                  explanation: resolutionSummary.trim(),
                  evidenceRefs: c.evidence.map(e => e.id)
              };
              
              if (rootCause.trim()) {
                  c.outcome.explanation += `\n\nRoot Cause: ${rootCause.trim()}`;
              }
              
              await store.save(c);
              await store.appendEvent(argv.id, 'CaseResolved', resolutionSummary.trim());
              
              console.log(chalk.green('\n✅ Case marked as resolved!'));
              console.log(chalk.gray('\n   Summary captured for future reference.'));
              
              // Show statistics
              const totalQuestions = c.questions.length;
              const evidenceCount = c.evidence.length;
              const eventCount = c.events.length;
              
              console.log(chalk.bold.cyan('\n📊 CASE STATISTICS'));
              console.log(chalk.white(`   Questions answered: ${totalQuestions}`));
              console.log(chalk.white(`   Evidence collected: ${evidenceCount} files`));
              console.log(chalk.white(`   Timeline events: ${eventCount}`));
              
              if (c.problemScope) {
                  console.log(chalk.bold.cyan('\n📋 FINAL SCOPE'));
                  console.log(chalk.gray(`   ${c.problemScope.summary}`));
              }
              
              console.log(chalk.bold.cyan('\n💡 NEXT STEPS'));
              console.log(chalk.white('   • Review case details: ') + chalk.gray(`piper show ${c.id}`));
              console.log(chalk.white('   • View event timeline: ') + chalk.gray(`piper events ${c.id}`));
              console.log(chalk.white('   • Create new case: ') + chalk.gray(`piper ingest "<description>" <log-file>`));
              
          } else {
              console.log(chalk.yellow('\n⚠️  Resolution summary required - case not resolved'));
          }
          
      } catch (err: any) {
          console.error(chalk.red(`Failed to resolve case: ${err.message}`));
          if (process.env.DEBUG) {
              console.error(err.stack);
          }
      }
  })
  .command('add-evidence <id> <path>', 'Add file evidence', {}, async (argv: any) => {
      const { evidence: ev, isRedacted } = await evidenceMgr.addFile(argv.id, argv.path, ["user-supplied"]);
      const c = await store.load(argv.id);
      c.evidence.push(ev);
      await store.save(c);
      await store.appendEvent(argv.id, 'EvidenceAdded', `Added ${ev.path}`);
      
      let msg = `Added evidence ${ev.id}`;
      if (isRedacted) {
          msg += ` (WARNING: PII Detected and Redacted)`;
      }
      console.log(msg);
      
      // If we're in Plan or Execute state and user is adding new evidence,
      // this is likely verification evidence after applying fixes
      if (c.state === CaseState.Plan || c.state === CaseState.Execute) {
          console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
          console.log(chalk.cyan('📊 VERIFICATION ANALYSIS'));
          console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
          
          console.log(chalk.white('Analyzing new evidence to verify if issue is resolved...\n'));
          
          try {
              // Check if error patterns from problem scope still exist in new evidence
              const newEvidenceContent = await fs.readFile(ev.path, 'utf-8');
              const errorsPersist = c.problemScope?.errorPatterns.some((pattern: string) => 
                  newEvidenceContent.toLowerCase().includes(pattern.toLowerCase())
              );
              
              // Look for success indicators
              const successIndicators = ['succeeded', 'completed successfully', 'deployment successful', 'passed', 'status: succeeded'];
              const hasSuccessIndicators = successIndicators.some(indicator => 
                  newEvidenceContent.toLowerCase().includes(indicator)
              );
              
              if (!errorsPersist && hasSuccessIndicators) {
                  console.log(chalk.green('✅ ISSUE APPEARS RESOLVED!'));
                  console.log(chalk.green('   • No error patterns detected in new evidence'));
                  console.log(chalk.green('   • Success indicators found'));
                  console.log(chalk.white('\n📝 Next steps:'));
                  console.log(chalk.white(`   1. Verify: Review the evidence to confirm fix: piper show ${c.id}`));
                  console.log(chalk.white(`   2. Close case: piper resolve ${c.id}`));
                  console.log(chalk.gray('\n   The resolve command will ask for a postmortem summary.'));
              } else if (errorsPersist) {
                  console.log(chalk.yellow('⚠️  ISSUE STILL PRESENT'));
                  console.log(chalk.yellow('   • Original error patterns still detected'));
                  console.log(chalk.white('\n📝 Next steps:'));
                  console.log(chalk.white(`   1. Re-analyze: piper analyze ${c.id}`));
                  console.log(chalk.white(`   2. Update plan: piper next ${c.id}`));
                  console.log(chalk.gray('\n   System will incorporate new evidence into analysis.'));
              } else {
                  console.log(chalk.cyan('🔍 INCONCLUSIVE'));
                  console.log(chalk.cyan('   • No clear error patterns, but no strong success indicators either'));
                  console.log(chalk.white('\n📝 Options:'));
                  console.log(chalk.white(`   • Add more verification evidence: piper add-evidence ${c.id} <logs>`));
                  console.log(chalk.white(`   • Re-analyze: piper analyze ${c.id}`));
                  console.log(chalk.white(`   • If you're confident it's fixed: piper resolve ${c.id}`));
              }
          } catch (err: any) {
              console.log(chalk.yellow('\n⚠️  Could not automatically verify resolution'));
              console.log(chalk.gray(`   ${err.message}`));
              console.log(chalk.white(`\n   Manually verify, then: piper resolve ${c.id}`));
          }
          
          console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
      }
  })
  .command('answer <id> <qid> <value>', 'Answer a question', {
      reason: {
        alias: 'r',
        type: 'string',
        choices: ['Security', 'Technical', 'Not Relevant', 'Process'],
        description: 'Reason code if skipping a question in Strict Mode'
      }
  }, async (argv: any) => {
      // Check strict mode constraints
      const c = await store.load(argv.id);
      
      const isEvasive = (ans: string) => {
          const l = ans.toLowerCase();
          return ["idk", "unknown", "can't", "cant", "skip", "no data"].some(x => l.includes(x));
      };

      if (c.strictMode && isEvasive(argv.value) && !argv.reason) {
          console.error("\n[STRICT MODE] You cannot simply skip a question.");
          console.error("Please provide a reason: --reason [Security|Technical|Not Relevant|Process]");
          process.exit(1);
      }

      if (argv.reason) {
           const q = c.questions.find(x => x.id === argv.qid);
           if (!q) throw new Error("Question not found");
           
           q.status = "Skipped";
           q.answer = argv.value;
           
           if (!c.constraints) c.constraints = [];
           c.constraints.push({
               id: uuidv4(),
               questionId: argv.qid,
               reason: argv.reason,
               description: `Skipped: ${argv.value}`
           });
           
           // Auto-resume logic
           if (c.state === CaseState.PendingExternal) {
              c.state = CaseState.Plan;
           }

           await store.appendEvent(argv.id, 'QuestionSkipped', `Skipped question ${argv.qid}: ${argv.reason}`);
           await store.save(c);
           console.log("Constraint recorded. Question marked as Skipped.");
      } else {
          await orchestrator.addAnswer(argv.id, argv.qid, argv.value);
          console.log("Answer recorded.");
      }
  })
  .command('show <id>', 'Show case details', {}, async (argv: any) => {
      const c = await store.load(argv.id);
      console.log(`CASE: ${c.title} (${c.id})`);
      console.log(`MODE: ${c.strictMode ? "Strict" : "Normal"}`);
      console.log(`STATE: ${c.state}`);
      
      // Show problem scope info if available
      if (c.problemScope) {
          const versionInfo = c.problemScope.version ? ` v${c.problemScope.version}` : '';
          const scopeStatus = c.scopeConfirmed ? '✓ Confirmed' : '⚠ Pending';
          console.log(`SCOPE: ${scopeStatus}${versionInfo}`);
          if (c.scopeHistory && c.scopeHistory.length > 0) {
              console.log(`   History: ${c.scopeHistory.length} previous version(s) - run 'piper scope-history ${c.id}' to view`);
          }
          console.log(`   Summary: ${c.problemScope.summary.substring(0, 80)}${c.problemScope.summary.length > 80 ? '...' : ''}`);
      }
      
      if (c.constraints && c.constraints.length > 0) {
          console.log(`CONSTRAINTS: ${c.constraints.length} active (blocking paths)`);
          c.constraints.forEach(k => console.log(`  ! [${k.reason}] ${k.description}`));
      }
      if (c.formal?.actual) console.log(`DESCRIPTION: ${c.formal.actual.substring(0, 100)}...`);
      if (c.unknowns?.length > 0) console.log(`UNKNOWNS/ENV: ${c.unknowns.length} items captured.`);
      console.log(`QUESTIONS:`);
      c.questions.forEach(q => console.log(` - [${q.status}] ${q.ask} (${q.id})`));
      console.log(`EVIDENCE:`);
      c.evidence.forEach(e => {
          const redactedLabel = e.isRedacted ? " [REDACTED]" : "";
          console.log(` - ${e.originalPath} (${e.mediaType})${redactedLabel}`);
      });

      console.log(`\nRECOMMENDED ACTION:`);
      switch (c.state) {
          case CaseState.Intake:
              if (!c.scopeConfirmed) {
                  console.log(`Run 'piper scope ${c.id}' to define and confirm problem scope.`);
              } else {
                  console.log(`Run 'piper next ${c.id}' to start analysis.`);
              }
              break;
          case CaseState.PendingExternal:
              console.log(`Run 'piper answer ${c.id} <qid> <value>' to provide details.`);
              break;
          case CaseState.Resolve:
              console.log('Case is resolved.');
              break;
          default:
              console.log(`Run 'piper next ${c.id}' to advance.`);
              break;
      }
  })
  .command('list', 'List all cases', {
      state: {
          alias: 's',
          type: 'array',
          description: 'Filter by one or more states (e.g. -s Intake Plan)'
      },
      active: {
          alias: 'a',
          type: 'boolean',
          description: 'Show only active cases (excludes Resolve/Postmortem)'
      }
  }, async (argv: any) => {
      try {
        let cases = await store.list();
        
        // Filter: Active
        if (argv.active) {
            cases = cases.filter(c => c.state !== CaseState.Resolve && c.state !== CaseState.Postmortem);
        }

        // Filter: Specific States
        if (argv.state && argv.state.length > 0) {
            // Case-insensitive match
            const targetStates = argv.state.map((s: string) => s.toLowerCase());
            cases = cases.filter(c => targetStates.includes(c.state.toLowerCase()));
        }

        if (cases.length === 0) {
            console.log("No matching cases found.");
        } else {
             // Simple formatted output
            cases.forEach(c => {
                 const stateStr = `[${c.state}]`.padEnd(14, ' ');
                 console.log(`${c.id}: ${stateStr} ${c.title}`);
            });
        }
      } catch (err) {
          console.log("Error listing cases.", err);
      }
  })
  .command('agent-start <caseId>', 'Start a persistent agent session for a case', {
      autoApprove: {
          type: 'boolean',
          description: 'Automatically approve all agent actions',
          default: false
      },
      maxIterations: {
          type: 'number',
          description: 'Maximum number of iterations',
          default: 50
      },
      maxDuration: {
          type: 'number',
          description: 'Maximum duration in minutes',
          default: 30
      }
  }, async (argv: any) => {
      try {
          const caseData = await store.load(argv.caseId);
          
          let template: IssueTemplate | null = null;
          if (caseData.templateId) {
              template = await templateMgr.load(caseData.templateId);
          }

          const session = await agentSessionMgr.createSession(caseData, template, {
              maxIterations: argv.maxIterations,
              maxDuration: argv.maxDuration * 60 * 1000,
              autoApprove: argv.autoApprove
          });

          console.log(chalk.green(`\n\u2705 Agent session created: ${session.id}`));
          console.log(chalk.gray(`To start: piper agent-run ${session.id}`));
          
      } catch (err) {
          console.error(chalk.red(`Error creating agent session: ${(err as Error).message}`));
          process.exit(1);
      }
  })
  .command('agent-run <sessionId>', 'Run an agent session', {
      autoApprove: {
          type: 'boolean',
          description: 'Automatically approve all agent actions',
          default: false
      }
  }, async (argv: any) => {
      try {
          await agentRunner.runAgent(argv.sessionId, argv.autoApprove);
      } catch (err) {
          console.error(chalk.red(`Error running agent: ${(err as Error).message}`));
          process.exit(1);
      }
  })
  .command('agent-pause <sessionId>', 'Pause a running agent session', {}, async (argv: any) => {
      try {
          await agentSessionMgr.pauseSession(argv.sessionId);
          console.log(chalk.green(`\u2713 Agent session paused: ${argv.sessionId}`));
      } catch (err) {
          console.error(chalk.red(`Error pausing agent: ${(err as Error).message}`));
          process.exit(1);
      }
  })
  .command('agent-resume <sessionId>', 'Resume a paused agent session', {
      autoApprove: {
          type: 'boolean',
          description: 'Automatically approve all agent actions',
          default: false
      }
  }, async (argv: any) => {
      try {
          await agentSessionMgr.resumeSession(argv.sessionId);
          console.log(chalk.green(`\u2713 Agent session resumed: ${argv.sessionId}`));
          await agentRunner.runAgent(argv.sessionId, argv.autoApprove);
      } catch (err) {
          console.error(chalk.red(`Error resuming agent: ${(err as Error).message}`));
          process.exit(1);
      }
  })
  .command('agent-status', 'List all active agent sessions', {}, async () => {
      try {
          const sessions = await agentSessionMgr.listActiveSessions();
          
          if (sessions.length === 0) {
              console.log(chalk.gray('No active agent sessions'));
              return;
          }

          console.log(chalk.bold(`\n\ud83d\udcca Active Agent Sessions (${sessions.length}):\n`));
          
          for (const session of sessions) {
              const elapsed = new Date().getTime() - session.metrics.startTime.getTime();
              const minutes = Math.floor(elapsed / 60000);
              
              const statusColor = session.status === 'active' ? chalk.green :
                                 session.status === 'paused' ? chalk.yellow : chalk.gray;
              
              console.log(chalk.bold(`${session.id}`));
              console.log(`  Case: ${session.caseId}`);
              console.log(`  Status: ${statusColor(session.status)}`);
              console.log(`  Profile: ${session.profile}`);
              console.log(`  Iterations: ${session.metrics.iterations}/${session.config.maxIterations}`);
              console.log(`  Duration: ${minutes}m`);
              console.log(`  Questions Answered: ${session.metrics.questionsAnswered}`);
              console.log(`  State: ${session.currentCaseState}`);
              console.log('');
          }
      } catch (err) {
          console.error(chalk.red(`Error listing sessions: ${(err as Error).message}`));
          process.exit(1);
      }
  })
  .command('agent-terminate <sessionId>', 'Terminate an agent session', {}, async (argv: any) => {
      try {
          await agentSessionMgr.terminateSession(argv.sessionId);
          console.log(chalk.green(`\u2713 Agent session terminated: ${argv.sessionId}`));
      } catch (err) {
          console.error(chalk.red(`Error terminating agent: ${(err as Error).message}`));
          process.exit(1);
      }
  })
  .strict()
  .parse();
