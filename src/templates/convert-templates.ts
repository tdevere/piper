#!/usr/bin/env node
/**
 * Template Conversion CLI
 * Converts markdown scoping and troubleshooting templates to structured JSON
 */

import { MarkdownToScopingTemplateConverter } from './MarkdownToScopingTemplate';
import { MarkdownToTroubleshootingTemplateConverter } from './MarkdownToTroubleshootingTemplate';
import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Recursively find all markdown files in a directory
 */
async function findMarkdownFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];
  
  const items = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    
    if (item.isDirectory()) {
      const subFiles = await findMarkdownFiles(fullPath);
      results.push(...subFiles);
    } else if (item.isFile() && item.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command || command === 'help') {
    console.log(`
Template Conversion CLI

Usage:
  node convert-templates.js scoping <input-dir> <output-dir>
  node convert-templates.js troubleshooting <input-dir> <output-dir>
  node convert-templates.js all <templates-root>
  
Examples:
  # Convert scoping templates
  node convert-templates.js scoping ./templates/scoping-templates ./templates/scoping
  
  # Convert troubleshooting templates
  node convert-templates.js troubleshooting ./templates/pipeline-templates ./templates/troubleshooting
  
  # Convert all templates (scans for .md files)
  node convert-templates.js all ./templates
`);
    return;
  }
  
  if (command === 'scoping') {
    const inputDir = args[1] || './templates/scoping-templates';
    const outputDir = args[2] || './templates/scoping';
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 CONVERTING SCOPING TEMPLATES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Input:  ${inputDir}`);
    console.log(`Output: ${outputDir}\n`);
    
    const converter = new MarkdownToScopingTemplateConverter();
    await converter.convertDirectory(inputDir, outputDir);
    
  } else if (command === 'troubleshooting') {
    const inputDir = args[1] || './templates/pipeline-templates';
    const outputDir = args[2] || './templates/troubleshooting';
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 CONVERTING TROUBLESHOOTING TEMPLATES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Input:  ${inputDir}`);
    console.log(`Output: ${outputDir}\n`);
    
    const converter = new MarkdownToTroubleshootingTemplateConverter();
    await converter.convertDirectory(inputDir, outputDir);
    
  } else if (command === 'all') {
    const templatesRoot = args[1] || './templates';
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 CONVERTING ALL TEMPLATES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Scan for product area directories with markdown files
    const productAreas = ['Pipelines', 'Repos', 'Boards', 'Artifacts', 'Test-Plans', 'AdminOps'];
    const scopingConverter = new MarkdownToScopingTemplateConverter();
    const troubleshootingConverter = new MarkdownToTroubleshootingTemplateConverter();
    
    for (const area of productAreas) {
      const areaPath = path.join(templatesRoot, area);
      if (await fs.pathExists(areaPath)) {
        console.log(`\n📁 Processing ${area} area...\n`);
        
        // Recursively find all markdown files in this area
        const markdownFiles = await findMarkdownFiles(areaPath);
        
        console.log(`Found ${markdownFiles.length} markdown files in ${area}`);
        
        for (const mdFile of markdownFiles) {
          const relativePath = path.relative(areaPath, mdFile);
          const filename = path.basename(mdFile, '.md');
          
          try {
            // Try scoping conversion first
            const scopingTemplate = await scopingConverter.convertMarkdownFile(mdFile);
            if (scopingTemplate) {
              const outputPath = path.join(templatesRoot, 'scoping', area.toLowerCase(), `${scopingTemplate.id}.json`);
              await fs.ensureDir(path.dirname(outputPath));
              await fs.writeJson(outputPath, scopingTemplate, { spaces: 2 });
              console.log(`  📋 Scoping: ${relativePath} → scoping/${area.toLowerCase()}/${scopingTemplate.id}.json`);
              continue;
            }
            
            // Try troubleshooting conversion
            const troubleshootingTemplate = await troubleshootingConverter.convertMarkdownFile(mdFile);
            if (troubleshootingTemplate) {
              const outputPath = path.join(templatesRoot, 'troubleshooting', area.toLowerCase(), `${troubleshootingTemplate.id}.json`);
              await fs.ensureDir(path.dirname(outputPath));
              await fs.writeJson(outputPath, troubleshootingTemplate, { spaces: 2 });
              console.log(`  🔧 Troubleshooting: ${relativePath} → troubleshooting/${area.toLowerCase()}/${troubleshootingTemplate.id}.json`);
              continue;
            }
            
            console.log(`  ⊘ Skipped: ${relativePath} (no recognizable content)`);
          } catch (err: any) {
            console.error(`  ✗ Error: ${relativePath} - ${err.message}`);
          }
        }
      }
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL CONVERSIONS COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Run "node convert-templates.js help" for usage information');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
