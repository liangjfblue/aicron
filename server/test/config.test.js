import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { buildConfig } from '../config.js';

describe('server config data paths', () => {
  it('defaults app data to the user .aicron directory outside tests', async () => {
    const config = buildConfig({ NODE_ENV: 'development' }, process.cwd(), os.homedir());
    const expectedDataDir = path.join(os.homedir(), '.aicron', 'data');

    expect(config.DATA_DIR).toBe(expectedDataDir);
    expect(config.DB_PATH).toBe(path.join(expectedDataDir, 'aicron.db'));
    expect(config.RUNS_DIR).toBe(path.join(expectedDataDir, 'runs'));
  });

  it('keeps tests away from the real desktop database by default', async () => {
    const config = buildConfig({ NODE_ENV: 'test' }, process.cwd(), os.homedir());

    expect(config.DATA_DIR).toBe(path.resolve(process.cwd(), '.test-aicron', 'data'));
  });

  it('respects explicit data path environment overrides', async () => {
    const config = buildConfig({
      NODE_ENV: 'development',
      AICRON_HOME: '/tmp/custom-aicron',
      DATA_DIR: '/tmp/custom-data',
      DB_PATH: '/tmp/custom.db',
      RUNS_DIR: '/tmp/custom-runs',
    }, process.cwd(), os.homedir());

    expect(config.DATA_DIR).toBe('/tmp/custom-data');
    expect(config.DB_PATH).toBe('/tmp/custom.db');
    expect(config.RUNS_DIR).toBe('/tmp/custom-runs');
  });
});
