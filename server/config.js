import path from 'node:path';
import os from 'node:os';

export function buildConfig(env = process.env, cwd = process.cwd(), homeDir = os.homedir()) {
  const defaultRoot = env.NODE_ENV === 'test'
    ? path.resolve(cwd, '.test-aicron')
    : path.join(homeDir, '.aicron');
  const dataRoot = env.AICRON_HOME || defaultRoot;
  const DATA_DIR = env.DATA_DIR || path.join(dataRoot, 'data');
  const DB_PATH = env.DB_PATH || path.join(DATA_DIR, 'aicron.db');
  const RUNS_DIR = env.RUNS_DIR || path.join(DATA_DIR, 'runs');

  return Object.freeze({
    PORT: parseInt(env.PORT || '3000', 10),
    HOST: env.HOST || '127.0.0.1',
    AICRON_HOME: dataRoot,
    DATA_DIR,
    DB_PATH,
    RUNS_DIR,
    JWT_SECRET: env.JWT_SECRET || 'aicron-dev-secret-change-me',
    JWT_EXPIRES_IN: '3d',
    DEFAULT_CLAUDE_CLI: env.CLAUDE_CLI_PATH || 'claude',
    DEFAULT_CODEX_CLI: env.CODEX_CLI_PATH || 'codex',
  });
}

export const config = buildConfig();
