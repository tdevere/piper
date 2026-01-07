import * as fs from 'fs-extra';
import * as path from 'path';
import { Case, CaseEvent } from '../types';
import dayjs from 'dayjs';

export class CaseStore {
  constructor(private rootDir: string) {
    fs.ensureDirSync(rootDir);
  }

  async load(id: string): Promise<Case> {
    const casePath = path.join(this.rootDir, id, 'case.json');
    if (!await fs.pathExists(casePath)) {
        throw new Error(`Case ${id} not found at ${casePath}`);
    }
    return fs.readJSON(casePath);
  }

  async save(c: Case): Promise<void> {
    const caseDir = path.join(this.rootDir, c.id);
    await fs.ensureDir(caseDir);
    await fs.writeJSON(path.join(caseDir, 'case.json'), c, { spaces: 2 });
  }

  async appendEvent(id: string, type: string, detail: string, actor: string = 'System') {
    const c = await this.load(id);
    const event: CaseEvent = {
        ts: dayjs().toISOString(),
        type,
        actor,
        detail
    };
    c.events.push(event);
    await this.save(c);
  }

  async list(): Promise<Case[]> {
     const dirs = await fs.readdir(this.rootDir);
     const cases: Case[] = [];
     for (const d of dirs) {
         if (await fs.pathExists(path.join(this.rootDir, d, 'case.json'))) {
             cases.push(await fs.readJSON(path.join(this.rootDir, d, 'case.json')));
         }
     }
     return cases;
  }

  async createBackup(): Promise<string> {
    const timestamp = dayjs().format('YYYYMMDD_HHmmss');
    const backupDir = path.join(path.dirname(this.rootDir), `cases_backup_${timestamp}`);
    await fs.copy(this.rootDir, backupDir);
    return backupDir;
  }

  async deleteAll(): Promise<void> {
    await fs.emptyDir(this.rootDir);
  }
}
