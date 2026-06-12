import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'aicron.db');
const RUNS_DIR = process.env.RUNS_DIR || path.join(DATA_DIR, 'runs');

export const config = Object.freeze({
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '127.0.0.1',
  DATA_DIR,
  DB_PATH,
  RUNS_DIR,
  JWT_SECRET: process.env.JWT_SECRET || 'aicron-dev-secret-change-me',
  JWT_EXPIRES_IN: '3d',
  DEFAULT_CLAUDE_CLI: process.env.CLAUDE_CLI_PATH || 'claude',
  DEFAULT_CODEX_CLI: process.env.CODEX_CLI_PATH || 'codex',
});
