import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';

export function writeResult(taskId, runId, content) {
  const dir = join(config.RUNS_DIR, taskId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${runId}.md`);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function readResult(resultPath) {
  try { return readFileSync(resultPath, 'utf-8'); }
  catch { return null; }
}

export function deleteResult(resultPath) {
  if (!resultPath) return false;
  try {
    unlinkSync(resultPath);
    return true;
  } catch {
    return false;
  }
}
