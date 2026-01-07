import * as fs from 'fs-extra';
import { Case } from '../types';

export class IntakeParser {
  static parse(markdown: string): Partial<Case> & { extraEvidencePaths: string[] } {
    const lines = markdown.split('\n');
    const result: any = {
      formal: { expected: "Successful run", actual: "" },
      unknowns: [],
      evidence: [] // Only used to hint at attached files, actual attachment handled by caller
    };
    const evidencePaths: string[] = [];

    let currentSection = "";
    let descriptionBuffer: string[] = [];

    for (const line of lines) {
      const trim = line.trim();
      
      if (trim.startsWith('## Environment')) currentSection = 'env';
      else if (trim.startsWith('## Issue Details')) currentSection = 'details';
      else if (trim.startsWith('## References')) currentSection = 'refs';
      else if (trim.startsWith('### Description')) currentSection = 'desc';
      else if (trim.startsWith('### Errors')) currentSection = 'errors';
      else if (trim.startsWith('#')) { /* Skip other headers */ }
      else {
        // Parsing Logic
        if (currentSection === 'desc' && trim) {
           if (!trim.startsWith('[')) descriptionBuffer.push(trim);
        }
        
        if (trim.startsWith('- **Logs Path**:')) {
            const path = trim.split(':')[1]?.trim();
            if (path && path.length > 0) evidencePaths.push(path);
        }

        // Generic Env parsing (naive)
        if (currentSection === 'env' && trim.startsWith('-')) {
             result.unknowns.push("Env: " + trim.replace('- **', '').replace('**:', ':'));
        }
      }
    }

    if (descriptionBuffer.length > 0) {
        result.formal.actual = descriptionBuffer.join('\n');
    }

    return { ...result, extraEvidencePaths: evidencePaths };
  }
}
