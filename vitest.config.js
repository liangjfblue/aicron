import { defineConfig } from 'vitest/config';
import os from 'node:os';
import path from 'node:path';

const testDataDir = path.join(os.tmpdir(), `aicron-vitest-${process.pid}`);

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-packages/**'],
    fileParallelism: false,
    env: {
      DATA_DIR: testDataDir,
      DB_PATH: path.join(testDataDir, 'aicron.db'),
      RUNS_DIR: path.join(testDataDir, 'runs'),
    },
  },
});
