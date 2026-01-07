import * as fs from 'fs-extra';
import * as path from 'path';
import { IssueTemplate, Question, Hypothesis } from '../types';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

export class TemplateManager {
  constructor(private templatesDir: string) {
    fs.ensureDirSync(templatesDir);
  }

  async load(templateId: string): Promise<IssueTemplate> {
    const templatePath = path.join(this.templatesDir, `${templateId}.json`);
    if (!await fs.pathExists(templatePath)) {
      throw new Error(`Template ${templateId} not found`);
    }
    return fs.readJSON(templatePath);
  }

  async save(template: IssueTemplate): Promise<void> {
    const templatePath = path.join(this.templatesDir, `${template.id}.json`);
    await fs.writeJSON(templatePath, template, { spaces: 2 });
  }

  async list(): Promise<IssueTemplate[]> {
    const files = await fs.readdir(this.templatesDir);
    const templates: IssueTemplate[] = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readJSON(path.join(this.templatesDir, file));
        templates.push(content);
      }
    }
    return templates;
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
