import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { Evidence, EvidenceExtract } from '../types';
import { Redactor } from './Redactor';
import { v4 as uuidv4 } from 'uuid';

export class EvidenceManager {
  private redactor: Redactor;
  private stagingDir: string;

  constructor(private casesRoot: string) {
      this.redactor = new Redactor();
      this.stagingDir = path.join(this.casesRoot, '.staging');
  }

  async addFile(caseId: string, filePath: string, tags: string[] = []): Promise<{ evidence: Evidence, isRedacted: boolean }> {
    const caseDir = path.join(this.casesRoot, caseId);
    const artifactsDir = path.join(caseDir, 'artifacts');
    await fs.ensureDir(artifactsDir);

    const buffer = await fs.readFile(filePath);
    let content = buffer.toString('utf-8'); // Assume text for initial processing
    const originalHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = path.extname(filePath).toLowerCase();
    const evidenceId = uuidv4();
    
    // Sniff type FIRST to decide on redaction
    const mediaType = this.sniffType(ext);
    
    let isRedacted = false;
    let storedContent = buffer;

    // Apply Redaction if it's text-based
    if (mediaType.startsWith('text/') || mediaType.includes('json') || mediaType.includes('yaml')) {
        const { redacted, check } = this.redactor.process(content);
        if (check.hasChanges) {
            isRedacted = true;
            storedContent = Buffer.from(redacted, 'utf-8');
            content = redacted; // Update content variable for extractors
        }
    }

    // Storage Policy: Copy (possibly redacted) file to artifacts/{id}_original{ext}
    // We still call it "_original" in the file name structure for consistency, 
    // but the Evidence metadata flag 'isRedacted' tells the truth.
    const storedFileName = `${evidenceId}_original${ext}`;
    const storedPath = path.join(artifactsDir, storedFileName);
    
    await fs.writeFile(storedPath, storedContent); // Write buffer (raw or redacted)

    const storedHash = crypto.createHash('sha256').update(storedContent).digest('hex');

    const evidence: Evidence = {
      id: evidenceId,
      kind: 'file',
      originalPath: filePath, // Keep pointer to the REAL original on disk
      path: `artifacts/${storedFileName}`,
      mediaType,
      hash: storedHash, // Hash of what we actually stored
      sizeBytes: storedContent.length,
      tags,
      isRedacted,
      extracts: []
    };

    // Run Extractors based on the STORED (safe) content
    evidence.extracts = await this.runExtractors(evidence, caseId, content);

    return { evidence, isRedacted };
  }

  private sniffType(ext: string): string {
    const map: Record<string, string> = {
      '.json': 'application/json',
      '.log': 'text/plain',
      '.txt': 'text/plain',
      '.yml': 'application/yaml',
      '.yaml': 'application/yaml',
      '.md': 'text/markdown'
    };
    return map[ext] || 'application/octet-stream';
  }

  private async runExtractors(evidence: Evidence, caseId: string, content?: string): Promise<EvidenceExtract[]> {
    const extracts: EvidenceExtract[] = [];
    
    // If content not passed (e.g. reload scenario), read from stored (redacted) path
    if (!content) {
        const absPath = path.join(this.casesRoot, caseId, evidence.path);
        content = await fs.readFile(absPath, 'utf-8');
    }

    // 1. Text Extractor (Universal)
    if (evidence.mediaType.startsWith('text/') || evidence.mediaType === 'application/json' || evidence.mediaType === 'application/yaml') {
        extracts.push({
            extractorName: 'BasicText',
            type: 'Text',
            summary: content.substring(0, 200) + (content.length > 200 ? '...' : '')
        });
    }

    // 2. Log Indexer
    if (evidence.path.endsWith('.log')) {
        const errorCount = (content.match(/error/gi) || []).length;
        extracts.push({
            extractorName: 'LogIndex',
            type: 'LogIndex',
            summary: `Log file with ${content.split('\n').length} lines. Detected ${errorCount} 'error' keywords.`
        });
    }

    return extracts;
  }

  async extractZipToStaging(zipPath: string, progressCallback?: (message: string) => void): Promise<string> {
    const extractId = uuidv4().substring(0, 8);
    const extractPath = path.join(this.stagingDir, extractId);
    await fs.ensureDir(extractPath);

    if (progressCallback) progressCallback('Reading zip file...');
    
    // Use a zip library to extract
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    
    if (progressCallback) {
      const entries = zip.getEntries();
      progressCallback(`Found ${entries.length} files in archive`);
    }
    
    zip.extractAllTo(extractPath, true);
    
    if (progressCallback) progressCallback('Extraction complete');

    return extractPath;
  }

  async ingestFromStaging(
    caseId: string, 
    stagingPath: string, 
    tags: string[] = [],
    deleteOriginal: boolean = false,
    progressCallback?: (current: number, total: number, filename: string, isRedacted: boolean) => void
  ): Promise<{ evidence: Evidence[], redactedCount: number }> {
    const evidenceList: Evidence[] = [];
    let redactedCount = 0;

    const files = await this.getAllFiles(stagingPath);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filename = path.basename(file);
      
      const { evidence, isRedacted } = await this.addFile(caseId, file, tags);
      evidenceList.push(evidence);
      if (isRedacted) redactedCount++;
      
      if (progressCallback) {
        progressCallback(i + 1, files.length, filename, isRedacted);
      }
    }

    // Clean up staging
    await fs.remove(stagingPath);

    // Optionally delete original zip (based on flag)
    // Note: We don't have the original zip path here, caller should handle this

    return { evidence: evidenceList, redactedCount };
  }

  private async getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files.push(...await this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }
}
