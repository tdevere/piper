import * as fs from 'fs-extra';
import * as path from 'path';

export interface TroubleshootingQuestion {
  id: string;
  ask: string;
  required: boolean;
  expectedFormat: 'text' | 'json' | 'path';
  guidance?: string;
  examples?: string[];
  verificationRequired?: boolean;
  category?: string;
}

export interface TroubleshootingHypothesis {
  id: string;
  description: string;
  likelihood?: 'High' | 'Medium' | 'Low';
}

export interface TroubleshootingTemplate {
  id: string;
  version: string;
  name: string;
  description: string;
  templateType: 'troubleshooting';
  keywords: string[];
  errorPatterns?: string[];
  classification?: {
    domain: string;
    area: string;
    subArea?: string;
    tags: string[];
  };
  questions: TroubleshootingQuestion[];
  initialHypotheses?: TroubleshootingHypothesis[];
  externalReferences?: Array<{ title: string; url: string }>;
  metadata?: {
    source: string;
    createdAt: string;
    updatedAt: string;
  };
}

export class MarkdownToTroubleshootingTemplateConverter {
  
  /**
   * Parse markdown troubleshooting document and generate questions/hypotheses
   */
  async convertMarkdownFile(filePath: string): Promise<TroubleshootingTemplate | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const filename = path.basename(filePath, '.md');
    
    // Extract title
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const name = titleMatch ? titleMatch[1].trim() : filename;
    
    // Extract description (usually first paragraph after title)
    const descMatch = content.match(/^#\s+.+?\n\n(.+?)(?:\n\n|$)/s);
    const description = descMatch ? descMatch[1].trim().substring(0, 200) : '';
    
    // Detect area
    const area = this.detectArea(filename, content);
    
    // Extract issue/cause/resolution structure
    const { issue, cause, resolution } = this.extractIssueCauseResolution(content);
    
    // Generate questions from resolution steps and verification phrases
    const questions = this.generateQuestions(content, resolution);
    
    // Generate hypotheses from cause/symptom sections
    const hypotheses = this.generateHypotheses(content, cause, issue);
    
    // Extract keywords
    const keywords = this.extractKeywords(content, name, area);
    
    // Extract error patterns
    const errorPatterns = this.extractErrorPatterns(content);
    
    // Extract external references
    const externalReferences = this.extractExternalReferences(content);
    
    // Generate ID
    const id = filename.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    
    // If no questions or hypotheses, might not be suitable as template
    if (questions.length === 0 && hypotheses.length === 0) {
      return null;
    }
    
    return {
      id,
      version: '1.0.0',
      name,
      description,
      templateType: 'troubleshooting',
      keywords,
      errorPatterns: errorPatterns.length > 0 ? errorPatterns : undefined,
      classification: {
        domain: 'Azure DevOps',
        area,
        tags: this.extractTags(content, area)
      },
      questions,
      initialHypotheses: hypotheses.length > 0 ? hypotheses : undefined,
      externalReferences: externalReferences.length > 0 ? externalReferences : undefined,
      metadata: {
        source: 'Azure DevOps Wiki',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
  }
  
  /**
   * Extract Issue/Cause/Resolution structure from troubleshooting doc
   */
  private extractIssueCauseResolution(content: string): {
    issue: string;
    cause: string;
    resolution: string;
  } {
    let issue = '';
    let cause = '';
    let resolution = '';
    
    // Pattern 1: # Issue:, # Cause:, # Resolution:
    const issueMatch = content.match(/(?:^|\n)#+ Issue:?\s*\n(.+?)(?=\n#|$)/is);
    if (issueMatch) issue = issueMatch[1].trim();
    
    const causeMatch = content.match(/(?:^|\n)#+ (?:Cause|Root Cause):?\s*\n(.+?)(?=\n#|$)/is);
    if (causeMatch) cause = causeMatch[1].trim();
    
    const resolutionMatch = content.match(/(?:^|\n)#+ (?:Resolution|Solution|Fix):?\s*\n(.+?)(?=\n#|$)/is);
    if (resolutionMatch) resolution = resolutionMatch[1].trim();
    
    // Pattern 2: **Issue**, **Cause**, **Resolution**
    if (!issue) {
      const boldIssueMatch = content.match(/\*\*Issue\*\*:?\s*\n(.+?)(?=\n\*\*|$)/is);
      if (boldIssueMatch) issue = boldIssueMatch[1].trim();
    }
    
    if (!cause) {
      const boldCauseMatch = content.match(/\*\*(?:Cause|Root Cause)\*\*:?\s*\n(.+?)(?=\n\*\*|$)/is);
      if (boldCauseMatch) cause = boldCauseMatch[1].trim();
    }
    
    if (!resolution) {
      const boldResolutionMatch = content.match(/\*\*(?:Resolution|Solution)\*\*:?\s*\n(.+?)(?=\n\*\*|$)/is);
      if (boldResolutionMatch) resolution = boldResolutionMatch[1].trim();
    }
    
    // Pattern 3: Scenario/Symptom/Resolution
    if (!issue) {
      const scenarioMatch = content.match(/(?:^|\n)#+ (?:Scenario|Symptom):?\s*\n(.+?)(?=\n#|$)/is);
      if (scenarioMatch) issue = scenarioMatch[1].trim();
    }
    
    return { issue, cause, resolution };
  }
  
  /**
   * Auto-generate diagnostic questions from resolution steps and verification phrases
   */
  private generateQuestions(content: string, resolution: string): TroubleshootingQuestion[] {
    const questions: TroubleshootingQuestion[] = [];
    let questionId = 1;
    
    // Pattern 1: Extract imperative statements from resolution and convert to questions
    const imperativePatterns = [
      /(?:^|\n)[-*]\s+(Verify|Check|Ensure|Confirm|Validate|Review|Inspect|Examine)\s+(.+?)(?:\n|$)/gi,
      /(?:^|\n)\d+\.\s+(Verify|Check|Ensure|Confirm|Validate|Review|Inspect|Examine)\s+(.+?)(?:\n|$)/gi
    ];
    
    for (const pattern of imperativePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const action = match[1];
        const target = match[2].trim();
        
        questions.push({
          id: `q${questionId++}`,
          ask: `Have you ${action.toLowerCase()}d: ${target}?`,
          required: true,
          expectedFormat: 'text',
          guidance: `Steps to verify:\n${match[0].trim()}`,
          examples: ['Yes, verified and working correctly', 'No, issue identified'],
          verificationRequired: true,
          category: 'verification'
        });
      }
    }
    
    // Pattern 2: Extract questions already in content
    const questionPattern = /(?:^|\n)[-*]\s+(.+?\?)\s*(?:\n|$)/g;
    let match;
    while ((match = questionPattern.exec(content)) !== null) {
      const question = match[1].trim();
      
      // Avoid duplicates
      if (!questions.some(q => q.ask === question)) {
        questions.push({
          id: `q${questionId++}`,
          ask: question,
          required: false,
          expectedFormat: 'text',
          category: 'diagnostic'
        });
      }
    }
    
    // Pattern 3: Generate questions from "Run the following command" patterns
    const commandPattern = /Run\s+(?:the following command|this command):?\s*\n\s*```[\w]*\n(.+?)\n```/gis;
    while ((match = commandPattern.exec(content)) !== null) {
      const command = match[1].trim();
      
      questions.push({
        id: `q${questionId++}`,
        ask: `Have you run the diagnostic command to check the status?`,
        required: true,
        expectedFormat: 'text',
        guidance: `Run the following command:\n\`\`\`\n${command}\n\`\`\``,
        examples: ['Yes, output shows: ...', 'No, unable to run command'],
        verificationRequired: true,
        category: 'diagnostic'
      });
    }
    
    return questions;
  }
  
  /**
   * Generate hypotheses from cause/symptom sections
   */
  private generateHypotheses(content: string, cause: string, issue: string): TroubleshootingHypothesis[] {
    const hypotheses: TroubleshootingHypothesis[] = [];
    let hypId = 1;
    
    // Add cause as primary hypothesis if present
    if (cause) {
      hypotheses.push({
        id: `h${hypId++}`,
        description: cause.split('\n')[0].trim(), // First sentence
        likelihood: 'High'
      });
    }
    
    // Extract additional causes from bullet points
    const causePattern = /(?:Possible (?:causes?|reasons?)|Known causes?|Common issues?):?\s*\n((?:[-*]\s+.+?\n)+)/gis;
    let match;
    
    while ((match = causePattern.exec(content)) !== null) {
      const bulletsText = match[1];
      const bulletPattern = /[-*]\s+(.+?)(?:\n|$)/g;
      let bulletMatch;
      
      while ((bulletMatch = bulletPattern.exec(bulletsText)) !== null) {
        const hypothesis = bulletMatch[1].trim();
        
        if (hypothesis && !hypotheses.some(h => h.description === hypothesis)) {
          hypotheses.push({
            id: `h${hypId++}`,
            description: hypothesis,
            likelihood: 'Medium'
          });
        }
      }
    }
    
    // If still no hypotheses but we have an issue, create generic hypothesis
    if (hypotheses.length === 0 && issue) {
      hypotheses.push({
        id: `h${hypId++}`,
        description: `Issue may be caused by configuration or environment mismatch`,
        likelihood: 'Medium'
      });
    }
    
    return hypotheses;
  }
  
  /**
   * Extract keywords from content
   */
  private extractKeywords(content: string, name: string, area: string): string[] {
    const keywords = new Set<string>();
    
    // Add area as keyword
    keywords.add(area.toLowerCase());
    
    // Extract key technical terms
    const technicalTerms = [
      'pipeline', 'build', 'release', 'agent', 'artifact', 'deployment',
      'git', 'tfvc', 'repository', 'repo', 'branch', 'pull request',
      'work item', 'board', 'backlog', 'query', 'sprint',
      'service connection', 'wif', 'workload identity', 'authentication',
      'docker', 'container', 'kubernetes', 'yaml', 'classic',
      'permission', 'access', 'identity', 'security', 'token',
      'feed', 'package', 'npm', 'nuget', 'maven',
      'test', 'test plan', 'test case', 'test suite',
      'server', 'tfs', 'azure devops', 'devops'
    ];
    
    const lower = content.toLowerCase();
    for (const term of technicalTerms) {
      if (lower.includes(term)) {
        keywords.add(term.replace(/\s+/g, '-'));
      }
    }
    
    // Extract from title
    const titleWords = name.toLowerCase().split(/\s+/);
    for (const word of titleWords) {
      if (word.length > 3 && !['with', 'from', 'that', 'this', 'have'].includes(word)) {
        keywords.add(word);
      }
    }
    
    return Array.from(keywords).slice(0, 10); // Limit to 10 most relevant
  }
  
  /**
   * Extract error patterns (regex patterns for error matching)
   */
  private extractErrorPatterns(content: string): string[] {
    const patterns: string[] = [];
    
    // Extract quoted error codes
    const errorCodePattern = /["`']([A-Z]{2,}[A-Z0-9_]+)["`']/g;
    let match;
    while ((match = errorCodePattern.exec(content)) !== null) {
      patterns.push(match[1]);
    }
    
    // Extract error messages in quotes
    const errorMsgPattern = /error:?\s+["`']([^"`']+)["`']/gi;
    while ((match = errorMsgPattern.exec(content)) !== null) {
      const msg = match[1].trim();
      if (msg.length > 10 && msg.length < 100) {
        patterns.push(msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // Escape regex chars
      }
    }
    
    return patterns.slice(0, 5); // Limit to 5 patterns
  }
  
  /**
   * Extract external reference links
   */
  private extractExternalReferences(content: string): Array<{ title: string; url: string }> {
    const references: Array<{ title: string; url: string }> = [];
    
    // Find markdown links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      
      if (url.startsWith('http') && 
          (url.includes('learn.microsoft.com') || 
           url.includes('docs.microsoft.com') ||
           url.includes('aka.ms'))) {
        references.push({ title, url });
      }
    }
    
    return references;
  }
  
  /**
   * Detect Azure DevOps area
   */
  private detectArea(filename: string, content: string): string {
    const lower = filename.toLowerCase() + ' ' + content.toLowerCase();
    
    if (lower.includes('pipeline') || lower.includes('build') || lower.includes('release')) return 'Pipelines';
    if (lower.includes('artifact') || lower.includes('feed') || lower.includes('package')) return 'Artifacts';
    if (lower.includes('board') || lower.includes('work item') || lower.includes('backlog')) return 'Boards';
    if (lower.includes('repo') || lower.includes('git') || lower.includes('tfvc') || lower.includes('source control')) return 'Repos';
    if (lower.includes('test plan') || lower.includes('test case') || lower.includes('test suite')) return 'Test Plans';
    if (lower.includes('server') || lower.includes('tfs')) return 'Server';
    if (lower.includes('admin') || lower.includes('identity') || lower.includes('permission') || lower.includes('security')) return 'Administration';
    
    return 'General';
  }
  
  /**
   * Extract tags
   */
  private extractTags(content: string, area: string): string[] {
    const tags: string[] = ['troubleshooting', 'diagnostic'];
    
    const lower = content.toLowerCase();
    
    if (lower.includes('error')) tags.push('error');
    if (lower.includes('fail')) tags.push('failure');
    if (lower.includes('authentication') || lower.includes('auth')) tags.push('authentication');
    if (lower.includes('permission') || lower.includes('access')) tags.push('permissions');
    if (lower.includes('timeout')) tags.push('timeout');
    if (lower.includes('configuration') || lower.includes('config')) tags.push('configuration');
    
    return tags;
  }
  
  /**
   * Batch convert multiple markdown files
   */
  async convertDirectory(dirPath: string, outputDir: string): Promise<void> {
    const files = await fs.readdir(dirPath);
    const markdownFiles = files.filter(f => f.endsWith('.md'));
    
    console.log(`Converting ${markdownFiles.length} troubleshooting templates from ${dirPath}...`);
    
    let converted = 0;
    let skipped = 0;
    
    for (const file of markdownFiles) {
      try {
        const filePath = path.join(dirPath, file);
        const template = await this.convertMarkdownFile(filePath);
        
        if (template) {
          const outputPath = path.join(outputDir, `${template.id}.json`);
          await fs.ensureDir(path.dirname(outputPath));
          await fs.writeJson(outputPath, template, { spaces: 2 });
          console.log(`✓ Converted: ${file} → ${template.id}.json`);
          converted++;
        } else {
          console.log(`⊘ Skipped: ${file} (no diagnostic content found)`);
          skipped++;
        }
      } catch (err: any) {
        console.error(`✗ Error converting ${file}: ${err.message}`);
      }
    }
    
    console.log(`\nCompleted: ${converted} converted, ${skipped} skipped`);
  }
}
