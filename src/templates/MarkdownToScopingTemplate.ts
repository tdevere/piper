import * as fs from 'fs-extra';
import * as path from 'path';

export interface ScopingCategory {
  category: string;
  requiredFields: string[];
}

export interface ScopingTemplate {
  id: string;
  title: string;
  description: string;
  templateType: 'scoping';
  classification: {
    domain: string;
    area: string;
    subArea?: string;
    tags: string[];
  };
  metadata: {
    source: string;
    stage: 'intake';
    customerFacing: boolean;
    createdAt: string;
  };
  scopingCategories: ScopingCategory[];
  externalReferences?: Array<{ title: string; url: string }>;
}

export class MarkdownToScopingTemplateConverter {
  
  /**
   * Parse markdown scoping document and extract structured categories
   */
  async convertMarkdownFile(filePath: string): Promise<ScopingTemplate | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const filename = path.basename(filePath, '.md');
    
    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : filename;
    
    // Extract description from content after title
    const descMatch = content.match(/^#\s+.+?\n\n(.+?)(?:\n\n|$)/s);
    const description = descMatch ? descMatch[1].trim() : '';
    
    // Detect area from filename or content
    const area = this.detectArea(filename, content);
    
    // Parse scoping categories
    const scopingCategories = this.extractScopingCategories(content);
    
    // If no categories found, might not be a scoping template
    if (scopingCategories.length === 0) {
      return null;
    }
    
    // Extract external references
    const externalReferences = this.extractExternalReferences(content);
    
    // Generate ID from filename
    const id = filename.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    
    return {
      id,
      title,
      description,
      templateType: 'scoping',
      classification: {
        domain: 'Azure DevOps',
        area,
        tags: this.extractTags(content, area)
      },
      metadata: {
        source: 'Azure DevOps Wiki',
        stage: 'intake',
        customerFacing: true,
        createdAt: new Date().toISOString()
      },
      scopingCategories,
      externalReferences: externalReferences.length > 0 ? externalReferences : undefined
    };
  }
  
  /**
   * Extract scoping categories from markdown sections
   * Standardized category names:
   * - Environment Details
   * - Issue Details  
   * - Affected Resources
   * - Logs and Evidence
   * - Configuration Details
   * - User and Permissions
   */
  private extractScopingCategories(content: string): ScopingCategory[] {
    const categories: ScopingCategory[] = [];
    
    // Standardized category mapping
    const categoryAliases: Record<string, string> = {
      'environment': 'Environment Details',
      'environment details': 'Environment Details',
      'environment info': 'Environment Details',
      'environment information': 'Environment Details',
      
      'issue': 'Issue Details',
      'issue details': 'Issue Details',
      'problem details': 'Issue Details',
      'incident details': 'Issue Details',
      
      'affected resources': 'Affected Resources',
      'resources': 'Affected Resources',
      'impacted resources': 'Affected Resources',
      
      'logs': 'Logs and Evidence',
      'logs and evidence': 'Logs and Evidence',
      'logs and references': 'Logs and Evidence',
      'evidence': 'Logs and Evidence',
      'diagnostic data': 'Logs and Evidence',
      
      'configuration': 'Configuration Details',
      'configuration details': 'Configuration Details',
      'config': 'Configuration Details',
      'settings': 'Configuration Details',
      
      'user': 'User and Permissions',
      'user and permissions': 'User and Permissions',
      'user information': 'User and Permissions',
      'permissions': 'User and Permissions',
      'access': 'User and Permissions'
    };
    
    // Find sections with emoji or ### headings followed by bullet points
    const sectionRegex = /(?:###?\s*[🔹🧾📋📁🖥️⚙️👤]*\s*(.+?)\n((?:[-*]\s+.+\n?)+))/g;
    
    let match;
    while ((match = sectionRegex.exec(content)) !== null) {
      const rawCategory = match[1].trim().replace(/[🔹🧾📋📁🖥️⚙️👤]/g, '').trim();
      const itemsText = match[2];
      
      // Normalize category name
      const normalizedCategory = categoryAliases[rawCategory.toLowerCase()] || rawCategory;
      
      // Extract required fields from bullets
      const requiredFields: string[] = [];
      const fieldRegex = /[-*]\s+(?:\*\*)?(.+?)(?:\*\*)?:\s*(?:e\.g\.|e\.g)?/g;
      let fieldMatch;
      
      while ((fieldMatch = fieldRegex.exec(itemsText)) !== null) {
        const field = fieldMatch[1].trim();
        if (field && !field.toLowerCase().includes('screenshot') && !field.toLowerCase().includes('detailed description')) {
          requiredFields.push(field);
        }
      }
      
      // Also extract fields without colons (simple bullet items)
      const simpleBulletRegex = /[-*]\s+([^:\n]+?)(?:\n|$)/g;
      while ((fieldMatch = simpleBulletRegex.exec(itemsText)) !== null) {
        const field = fieldMatch[1].trim();
        if (field && 
            !field.includes('e.g.') && 
            !field.toLowerCase().includes('screenshot') &&
            !requiredFields.some(f => field.startsWith(f))) {
          requiredFields.push(field);
        }
      }
      
      if (requiredFields.length > 0) {
        categories.push({
          category: normalizedCategory,
          requiredFields
        });
      }
    }
    
    return categories;
  }
  
  /**
   * Extract external reference links from markdown
   */
  private extractExternalReferences(content: string): Array<{ title: string; url: string }> {
    const references: Array<{ title: string; url: string }> = [];
    
    // Find markdown links [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      
      // Only include http/https links to documentation
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
   * Detect Azure DevOps area from filename and content
   */
  private detectArea(filename: string, content: string): string {
    const lower = filename.toLowerCase() + ' ' + content.toLowerCase();
    
    if (lower.includes('pipeline')) return 'Pipelines';
    if (lower.includes('artifact')) return 'Artifacts';
    if (lower.includes('board') || lower.includes('work item')) return 'Boards';
    if (lower.includes('repo') || lower.includes('git') || lower.includes('tfvc')) return 'Repos';
    if (lower.includes('test plan')) return 'Test Plans';
    if (lower.includes('server') || lower.includes('tfs')) return 'Server';
    if (lower.includes('admin') || lower.includes('identity') || lower.includes('permission')) return 'Administration';
    
    return 'General';
  }
  
  /**
   * Extract relevant tags from content
   */
  private extractTags(content: string, area: string): string[] {
    const tags: string[] = ['scoping', 'intake', 'information-gathering'];
    
    const lower = content.toLowerCase();
    
    // Add area-specific tags
    if (area === 'Pipelines') {
      if (lower.includes('yaml')) tags.push('yaml');
      if (lower.includes('classic')) tags.push('classic');
      if (lower.includes('agent')) tags.push('agent');
      if (lower.includes('service connection')) tags.push('service-connection');
    } else if (area === 'Repos') {
      if (lower.includes('git')) tags.push('git');
      if (lower.includes('tfvc')) tags.push('tfvc');
    } else if (area === 'Boards') {
      if (lower.includes('query')) tags.push('query');
      if (lower.includes('process')) tags.push('process-template');
    }
    
    return tags;
  }
  
  /**
   * Batch convert multiple markdown files
   */
  async convertDirectory(dirPath: string, outputDir: string): Promise<void> {
    const files = await fs.readdir(dirPath);
    const markdownFiles = files.filter(f => f.endsWith('.md'));
    
    console.log(`Converting ${markdownFiles.length} scoping templates from ${dirPath}...`);
    
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
          console.log(`⊘ Skipped: ${file} (no scoping content found)`);
          skipped++;
        }
      } catch (err: any) {
        console.error(`✗ Error converting ${file}: ${err.message}`);
      }
    }
    
    console.log(`\nCompleted: ${converted} converted, ${skipped} skipped`);
  }
}
