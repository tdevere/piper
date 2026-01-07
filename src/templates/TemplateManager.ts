import * as fs from 'fs-extra';
import * as path from 'path';
import { IssueTemplate, ScopingTemplate, Question, Hypothesis } from '../types';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

export class TemplateManager {
  private scopingTemplatesDir: string;
  private learnedTemplatesDir: string;
  
  constructor(private templatesDir: string) {
    fs.ensureDirSync(templatesDir);
    // Support scoping templates in dedicated directory under templates/
    this.scopingTemplatesDir = path.join(templatesDir, 'scoping-templates');
    if (fs.pathExistsSync(this.scopingTemplatesDir)) {
      fs.ensureDirSync(this.scopingTemplatesDir);
    }
    // Support learned templates directory
    this.learnedTemplatesDir = path.join(templatesDir, 'learned');
    fs.ensureDirSync(this.learnedTemplatesDir);
  }

  async load(templateId: string): Promise<IssueTemplate> {
    const templatePath = path.join(this.templatesDir, `${templateId}.json`);
    if (!await fs.pathExists(templatePath)) {
      throw new Error(`Template ${templateId} not found`);
    }
    return fs.readJSON(templatePath);
  }

  async loadScoping(templateId: string): Promise<ScopingTemplate> {
    const templatePath = path.join(this.scopingTemplatesDir, `${templateId}.json`);
    if (!await fs.pathExists(templatePath)) {
      throw new Error(`Scoping template ${templateId} not found`);
    }
    return fs.readJSON(templatePath);
  }

  async save(template: IssueTemplate): Promise<void> {
    const templatePath = path.join(this.templatesDir, `${template.id}.json`);
    await fs.writeJSON(templatePath, template, { spaces: 2 });
  }

  async list(): Promise<IssueTemplate[]> {
    const templates: IssueTemplate[] = [];
    
    // Load standard templates from main directory
    const files = await fs.readdir(this.templatesDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readJSON(path.join(this.templatesDir, file));
        // Only include if enabled (defaults to true if not specified)
        if (content.enabled !== false) {
          templates.push(content);
        }
      }
    }
    
    // Load learned templates from learned/ subdirectory
    if (await fs.pathExists(this.learnedTemplatesDir)) {
      const learnedFiles = await fs.readdir(this.learnedTemplatesDir);
      for (const file of learnedFiles) {
        if (file.endsWith('.json')) {
          const content = await fs.readJSON(path.join(this.learnedTemplatesDir, file));
          // Only include enabled learned templates
          if (content.enabled !== false) {
            templates.push(content);
          }
        }
      }
    }
    
    return templates;
  }

  async listScoping(): Promise<ScopingTemplate[]> {
    if (!await fs.pathExists(this.scopingTemplatesDir)) {
      return [];
    }
    const files = await fs.readdir(this.scopingTemplatesDir);
    const templates: ScopingTemplate[] = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await fs.readJSON(path.join(this.scopingTemplatesDir, file));
          // Validate it's a scoping template
          if (content.scopingCategories && content.metadata?.stage === 'intake') {
            templates.push(content);
          }
        } catch (err) {
          // Skip invalid templates
        }
      }
    }
    return templates;
  }

  async matchScoping(problemDescription: string, context?: string): Promise<ScopingTemplate | null> {
    const templates = await this.listScoping();
    if (templates.length === 0) {
      return null;
    }

    const searchText = `${problemDescription} ${context || ''}`.toLowerCase();
    console.log(`[TemplateManager] Matching scoping templates for: "${searchText}"`);
    console.log(`[TemplateManager] Found ${templates.length} scoping templates`);
    const matches: Array<{ template: ScopingTemplate; score: number }> = [];

    for (const template of templates) {
      let score = 0;

      // Match by product area (high priority)
      const area = template.classification?.area?.toLowerCase();
      if (area) {
        const areaMatch = searchText.includes(area);
        console.log(`[TemplateManager]   ${template.id}: area="${area}" match=${areaMatch}`);
        if (areaMatch) {
          score += 50; // Strong match for area
        }
      }

      // Match by tags
      if (template.classification?.tags) {
        for (const tag of template.classification.tags) {
          if (tag !== 'scoping' && tag !== 'intake' && tag !== 'fqr' && searchText.includes(tag.toLowerCase())) {
            score += 15;
          }
        }
      }

      // Match by domain
      if (template.classification?.domain && searchText.includes(template.classification.domain.toLowerCase())) {
        score += 10;
      }

      // If no specific matches, check for general template
      if (score === 0 && template.id.includes('general')) {
        score = 5; // Low score for general fallback
      }

      if (score > 0) {
        matches.push({ template, score });
      }
    }

    if (matches.length === 0) {
      // Return first template as fallback
      return templates[0] || null;
    }

    // Sort by score descending and return best match
    matches.sort((a, b) => b.score - a.score);
    return matches[0].template;
  }

  async match(problemDescription: string, errorContext?: string): Promise<IssueTemplate[]> {
    const templates = await this.list();
    const matches: Array<{ template: IssueTemplate; score: number }> = [];

    const searchText = `${problemDescription} ${errorContext || ''}`.toLowerCase();

    for (const template of templates) {
      let score = 0;

      // Keyword matching
      for (const keyword of template.keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          score += 10;
        }
      }

      // Error pattern matching (regex)
      if (template.errorPatterns && errorContext) {
        for (const pattern of template.errorPatterns) {
          try {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(errorContext)) {
              score += 20; // Higher weight for pattern matches
            }
          } catch (e) {
            // Invalid regex, skip
          }
        }
      }

      if (score > 0) {
        matches.push({ template, score });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);
    return matches.map(m => m.template);
  }

  async createFromCase(
    name: string,
    description: string,
    keywords: string[],
    questions: Question[],
    hypotheses: Hypothesis[],
    classification?: string
  ): Promise<IssueTemplate> {
    const template: IssueTemplate = {
      id: uuidv4().substring(0, 8),
      version: '1.0.0',
      name,
      description,
      keywords,
      questions: questions.map(q => ({
        id: q.id,
        ask: q.ask,
        required: q.required,
        expectedFormat: q.expectedFormat
      })),
      initialHypotheses: hypotheses.map(h => ({
        id: h.id,
        description: h.description
      })),
      classification,
      metadata: {
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString(),
        usageCount: 0
      }
    };

    await this.save(template);
    return template;
  }
  
  /**
   * Register a runtime template (like a learned template)
   */
  async registerTemplate(template: IssueTemplate): Promise<void> {
    // Determine save location based on whether it's a learned template
    const targetDir = template.createdFrom ? this.learnedTemplatesDir : this.templatesDir;
    const templatePath = path.join(targetDir, `${template.id}.json`);
    await fs.writeJSON(templatePath, template, { spaces: 2 });
  }
  
  /**
   * Disable a template (marks it as disabled without deleting)
   */
  async disableTemplate(templateId: string): Promise<void> {
    // Check both standard and learned directories
    const standardPath = path.join(this.templatesDir, `${templateId}.json`);
    const learnedPath = path.join(this.learnedTemplatesDir, `${templateId}.json`);
    
    let templatePath: string | null = null;
    if (await fs.pathExists(standardPath)) {
      templatePath = standardPath;
    } else if (await fs.pathExists(learnedPath)) {
      templatePath = learnedPath;
    }
    
    if (!templatePath) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    const template = await fs.readJSON(templatePath);
    template.enabled = false;
    template.disabled_at = dayjs().toISOString();
    await fs.writeJSON(templatePath, template, { spaces: 2 });
  }
  
  /**
   * Get template statistics
   */
  async getTemplateStats(): Promise<{ total: number; enabled: number; disabled: number; learned: number }> {
    let total = 0;
    let enabled = 0;
    let disabled = 0;
    let learned = 0;
    
    // Count standard templates
    const standardFiles = await fs.readdir(this.templatesDir);
    for (const file of standardFiles) {
      if (file.endsWith('.json')) {
        total++;
        const content = await fs.readJSON(path.join(this.templatesDir, file));
        if (content.enabled === false) {
          disabled++;
        } else {
          enabled++;
        }
      }
    }
    
    // Count learned templates
    if (await fs.pathExists(this.learnedTemplatesDir)) {
      const learnedFiles = await fs.readdir(this.learnedTemplatesDir);
      for (const file of learnedFiles) {
        if (file.endsWith('.json')) {
          total++;
          learned++;
          const content = await fs.readJSON(path.join(this.learnedTemplatesDir, file));
          if (content.enabled === false) {
            disabled++;
          } else {
            enabled++;
          }
        }
      }
    }
    
    return { total, enabled, disabled, learned };
  }

  async incrementUsage(templateId: string): Promise<void> {
    const template = await this.load(templateId);
    if (template.metadata) {
      template.metadata.usageCount = (template.metadata.usageCount || 0) + 1;
      template.metadata.updatedAt = dayjs().toISOString();
      await this.save(template);
    }
  }

  async updateVersion(templateId: string, newQuestions?: Question[], newHypotheses?: Hypothesis[]): Promise<IssueTemplate> {
    const template = await this.load(templateId);
    
    // Increment version
    const [major, minor, patch] = template.version.split('.').map(Number);
    template.version = `${major}.${minor}.${patch + 1}`;

    // Merge new questions (avoid duplicates by 'ask' field)
    if (newQuestions) {
      const existingAsks = new Set(template.questions.map(q => q.ask));
      for (const q of newQuestions) {
        if (!existingAsks.has(q.ask)) {
          template.questions.push({
            id: q.id,
            ask: q.ask,
            required: q.required,
            expectedFormat: q.expectedFormat
          });
        }
      }
    }

    // Merge new hypotheses
    if (newHypotheses) {
      const existingDescs = new Set(template.initialHypotheses?.map(h => h.description) || []);
      for (const h of newHypotheses) {
        if (!existingDescs.has(h.description)) {
          if (!template.initialHypotheses) template.initialHypotheses = [];
          template.initialHypotheses.push({
            id: h.id,
            description: h.description
          });
        }
      }
    }

    if (template.metadata) {
      template.metadata.updatedAt = dayjs().toISOString();
    }

    await this.save(template);
    return template;
  }
}
