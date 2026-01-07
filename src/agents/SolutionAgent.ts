import { Case, CaseState, IssueTemplate, Question, Hypothesis } from '../types';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * SolutionAgent analyzes resolved cases to:
 * 1. Evaluate template effectiveness
 * 2. Generate learned templates from successful resolutions
 * 3. Track classification accuracy
 */
export class SolutionAgent {
  private learnedTemplatesDir: string;
  
  constructor() {
    this.learnedTemplatesDir = path.join(process.cwd(), 'templates', 'learned');
  }
  
  /**
   * Analyze a resolved case and determine if we should create a learned template
   */
  async analyzeCaseOutcome(c: Case): Promise<{
    shouldCreateTemplate: boolean;
    templateScore: number;
    improvements: string[];
  }> {
    const analysis = {
      shouldCreateTemplate: false,
      templateScore: 0,
      improvements: [] as string[]
    };
    
    // Check if template was used
    if (!c.templateId) {
      // No template used - this is a candidate for a new template
      analysis.shouldCreateTemplate = true;
      analysis.improvements.push('No existing template matched this problem');
      return analysis;
    }
    
    // Calculate template effectiveness
    const templateScore = await this.calculateTemplateEffectiveness(c);
    analysis.templateScore = templateScore;
    
    // If template was <70% effective, create improved version
    if (templateScore < 70) {
      analysis.shouldCreateTemplate = true;
      analysis.improvements.push(`Template effectiveness was ${templateScore}% - below threshold`);
      
      // Analyze what was missing
      if (c.metadata?.scopeAnalysis) {
        const scopeComponents = c.metadata.scopeAnalysis.affectedComponents;
        const templateCoveredAll = this.checkComponentCoverage(c, scopeComponents);
        if (!templateCoveredAll) {
          analysis.improvements.push('Template missing key components from actual problem');
        }
      }
      
      // Check if questions led to correct diagnosis
      const questionsEffective = this.evaluateQuestionEffectiveness(c);
      if (!questionsEffective) {
        analysis.improvements.push('Template questions did not lead to correct diagnosis');
      }
    }
    
    // Update metadata
    if (!c.metadata) c.metadata = {};
    c.metadata.templateEffectiveness = {
      templateId: c.templateId,
      templateName: c.templateId, // Will be enriched with actual name
      initialScore: c.metadata.templateEffectiveness?.initialScore || 50,
      accuracyScore: templateScore,
      wasAccurate: templateScore >= 70,
      shouldCreateLearnedTemplate: analysis.shouldCreateTemplate,
      timestamp: new Date().toISOString()
    };
    
    return analysis;
  }
  
  /**
   * Calculate how effective the template was (0-100 score)
   */
  private async calculateTemplateEffectiveness(c: Case): Promise<number> {
    let score = 50; // Start at neutral
    
    // Did the classification match?
    if (c.classification && c.problemScope?.affectedComponents) {
      const classMatchesScope = c.problemScope.affectedComponents.some(comp =>
        comp.toLowerCase().includes(c.classification!.toLowerCase())
      );
      if (classMatchesScope) score += 20;
    }
    
    // Were hypotheses accurate?
    const validatedHypotheses = c.hypotheses.filter(h => h.status === 'Validated').length;
    const totalHypotheses = c.hypotheses.length;
    if (totalHypotheses > 0) {
      const hypothesisAccuracy = (validatedHypotheses / totalHypotheses) * 30;
      score += hypothesisAccuracy;
    }
    
    // Were questions answered and useful?
    const answeredQuestions = c.questions.filter(q => q.answer).length;
    const requiredQuestions = c.questions.filter(q => q.required).length;
    if (requiredQuestions > 0 && answeredQuestions >= requiredQuestions) {
      score += 20;
    }
    
    return Math.min(100, Math.round(score));
  }
  
  /**
   * Check if template covered all components found in actual problem
   */
  private checkComponentCoverage(c: Case, actualComponents: string[]): boolean {
    // This would compare template's expected components vs actual
    // For now, assume 80% coverage is good
    return Math.random() > 0.3; // Placeholder - should check against template definition
  }
  
  /**
   * Evaluate if questions led to correct root cause
   */
  private evaluateQuestionEffectiveness(c: Case): boolean {
    // Check if answered questions covered the key aspects
    const answeredQuestions = c.questions.filter(q => q.answer);
    return answeredQuestions.length >= 3; // Heuristic
  }
  
  /**
   * Generate a new learned template from a case
   */
  async generateLearnedTemplate(c: Case, enabled: boolean = true): Promise<IssueTemplate> {
    await fs.ensureDir(this.learnedTemplatesDir);
    
    // Create template based on case characteristics
    const template: IssueTemplate = {
      id: `learned-${c.id.substring(0, 8)}-v1`,
      name: `${c.classification || 'General'} - ${c.problemScope?.summary?.substring(0, 50) || 'Learned Pattern'}`,
      description: `Automatically learned from case ${c.id}`,
      classification: c.classification || 'General',
      enabled, // Control whether to use this template
      version: '1.0.0',
      createdFrom: c.id,
      basedOnTemplate: c.templateId,
      created: new Date().toISOString(),
      
      // Extract questions that were useful
      questions: c.questions
        .filter(q => q.answer && q.answer.length > 0) // Only include answered questions
        .slice(0, 8) // Limit to 8 most relevant
        .map((q, idx) => ({
          id: `lq${idx + 1}`,
          ask: q.ask,
          required: q.required,
          expectedFormat: q.expectedFormat || 'text' as const
        })),
      
      // Extract validated hypotheses as initial hypotheses
      initialHypotheses: c.hypotheses
        .filter(h => h.status === 'Validated')
        .slice(0, 5)
        .map((h, idx) => ({
          id: `lh${idx + 1}`,
          description: h.description,
          status: 'Open' as const,
          evidenceRefs: []
        })),
      
      // Pattern matching from scope analysis
      patterns: c.metadata?.scopeAnalysis?.errorPatterns || [],
      
      // Keywords for matching
      keywords: [
        c.classification || '',
        ...(c.metadata?.scopeAnalysis?.affectedComponents || []),
        ...(c.metadata?.scopeAnalysis?.errorPatterns?.map(p => p.split(':')[0]) || [])
      ].filter(k => k.length > 0)
    };
    
    // Save template
    const filename = `${template.id}.json`;
    const filepath = path.join(this.learnedTemplatesDir, filename);
    await fs.writeJSON(filepath, template, { spaces: 2 });
    
    console.log(`✨ Created learned template: ${template.name}`);
    console.log(`   Template ID: ${template.id}`);
    console.log(`   Enabled: ${enabled}`);
    console.log(`   Location: ${filepath}`);
    
    return template;
  }
  
  /**
   * Disable a learned template that's not performing well
   */
  async disableTemplate(templateId: string): Promise<void> {
    const filepath = path.join(this.learnedTemplatesDir, `${templateId}.json`);
    if (await fs.pathExists(filepath)) {
      const template = await fs.readJSON(filepath);
      template.enabled = false;
      template.disabled_at = new Date().toISOString();
      await fs.writeJSON(filepath, template, { spaces: 2 });
      console.log(`❌ Disabled template: ${templateId}`);
    }
  }
  
  /**
   * Get statistics on learned templates
   */
  async getTemplateStats(): Promise<{
    total: number;
    enabled: number;
    disabled: number;
    avgEffectiveness?: number;
  }> {
    if (!await fs.pathExists(this.learnedTemplatesDir)) {
      return { total: 0, enabled: 0, disabled: 0 };
    }
    
    const files = await fs.readdir(this.learnedTemplatesDir);
    const templates = await Promise.all(
      files
        .filter(f => f.endsWith('.json'))
        .map(f => fs.readJSON(path.join(this.learnedTemplatesDir, f)))
    );
    
    return {
      total: templates.length,
      enabled: templates.filter(t => t.enabled !== false).length,
      disabled: templates.filter(t => t.enabled === false).length
    };
  }
}
