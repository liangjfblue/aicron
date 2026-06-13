import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '../../db/index.js';
import { Executor } from '../../services/executor.js';
import { TaskService } from '../../services/task.js';
import { buildCliPathEnv } from '../../utils/cli-path.js';
import { writeResult } from '../../utils/result-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SLEEP_BIN = join(__dirname, '..', 'helpers', 'sleep-bin.js');

describe('Executor', () => {
  let db, executor, taskSvc;
  beforeEach(() => {
    db = getDb();
    executor = new Executor(db);
    taskSvc = new TaskService(db);
  });
  afterEach(() => { closeDb(); });

  it('should execute echo command and capture stdout', async () => {
    const task = taskSvc.create({
      name: 'echo test', prompt_template: 'hello world', engine: 'claude',
    });
    const run = await executor.execute(task, {
      engineCli: 'echo', timeoutSeconds: 5, triggerType: 'manual',
    });
    expect(run.status).toBe('succeeded');
    expect(run.exit_code).toBe(0);
    expect(run.stdout).toContain('hello world');
    expect(run.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['preparing', 'started', 'streaming', 'succeeded']),
    );
    expect(run.latest_event).toMatchObject({ type: 'succeeded', title: '执行完成' });
  }, 15000);

  it('should timeout a long-running command', async () => {
    const task = taskSvc.create({
      name: 'timeout test', prompt_template: 'sleep forever', engine: 'claude',
    });
    const run = await executor.execute(task, {
      engineCli: 'node', engineArgs: [SLEEP_BIN], timeoutSeconds: 1, triggerType: 'manual',
    });
    expect(run.status).toBe('timeout');
  }, 15000);

  it('should fail on non-existent command', async () => {
    const task = taskSvc.create({
      name: 'fail test', prompt_template: 'oops', engine: 'claude',
    });
    const run = await executor.execute(task, {
      engineCli: 'nonexistent_command_xyz', timeoutSeconds: 5, triggerType: 'manual',
    });
    expect(run.status).toBe('failed');
    expect(run.failure_reason).toContain('执行引擎或任务依赖的命令不存在');
    expect(run.failure_hint).toContain('检查设置页');
  }, 15000);

  it('should auto include previous successful result when enabled', async () => {
    const task = taskSvc.create({
      name: 'last result test',
      prompt_template: '本次任务',
      engine: 'claude',
      auto_include_last_result: true,
    });
    const oldPath = writeResult(task.id, 'previous-run', '上次报告结论');
    executor.runSvc.create({
      id: 'previous-run',
      task_id: task.id,
      status: 'succeeded',
      engine: 'claude',
      trigger_type: 'manual',
      started_at: '2026-06-01T00:00:00.000Z',
    });
    executor.runSvc.update('previous-run', {
      result_path: oldPath,
      summary: '上次摘要',
      finished_at: '2026-06-01T00:01:00.000Z',
    });

    const run = await executor.execute(task, {
      engineCli: 'echo', timeoutSeconds: 5, triggerType: 'manual',
    });

    expect(run.resolved_prompt).toContain('【AICron 自动注入：上次成功执行摘要】');
    expect(run.resolved_prompt).toContain('上次报告结论');
  }, 15000);

  it('should expose parent run result and summary to chained child prompts', async () => {
    const parent = taskSvc.create({
      name: 'parent task',
      prompt_template: '父任务',
      engine: 'claude',
    });
    const child = taskSvc.create({
      name: 'child task',
      prompt_template: '摘要={{parent_summary}}\n结果={{parent_result}}\n前序={{prev_output}}',
      engine: 'claude',
      chain_parent_id: parent.id,
    });
    const parentPath = writeResult(parent.id, 'parent-run', '父任务完整输出');
    executor.runSvc.create({
      id: 'parent-run',
      task_id: parent.id,
      status: 'succeeded',
      engine: 'claude',
      trigger_type: 'manual',
      started_at: '2026-06-01T00:00:00.000Z',
    });
    const parentRun = executor.runSvc.update('parent-run', {
      result_path: parentPath,
      summary: '父任务摘要',
      finished_at: '2026-06-01T00:01:00.000Z',
    });

    const run = await executor.execute(child, {
      engineCli: 'echo',
      timeoutSeconds: 5,
      triggerType: 'chain',
      parentRun,
    });

    expect(run.resolved_prompt).toContain('摘要=父任务摘要');
    expect(run.resolved_prompt).toContain('结果=父任务完整输出');
    expect(run.resolved_prompt).toContain('前序=父任务完整输出');
    expect(run.trigger_type).toBe('chain');
  }, 15000);

  it('should not auto include previous result by default', async () => {
    const task = taskSvc.create({
      name: 'last result default off', prompt_template: '本次任务', engine: 'claude',
    });
    const oldPath = writeResult(task.id, 'previous-run-default-off', '不应注入');
    executor.runSvc.create({
      id: 'previous-run-default-off',
      task_id: task.id,
      status: 'succeeded',
      engine: 'claude',
      trigger_type: 'manual',
      started_at: '2026-06-01T00:00:00.000Z',
    });
    executor.runSvc.update('previous-run-default-off', {
      result_path: oldPath,
      finished_at: '2026-06-01T00:01:00.000Z',
    });

    const run = await executor.execute(task, {
      engineCli: 'echo', timeoutSeconds: 5, triggerType: 'manual',
    });

    expect(run.resolved_prompt).toBe('本次任务');
  }, 15000);

  it('should use CLI path from settings when no env override exists', () => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('claudePath', ?)").run('/tmp/mock-claude');

    expect(executor._getCliPath('claude')).toBe('/tmp/mock-claude');
  });

  it('should build a PATH that discovers CLI tools from extra desktop directories', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'aicron-cli-bin-'));
    writeFileSync(join(binDir, 'claude'), '#!/bin/sh\necho mock claude\n');
    chmodSync(join(binDir, 'claude'), 0o755);

    try {
      const nextPath = buildCliPathEnv({ PATH: '/usr/bin' }, [binDir]);

      expect(nextPath.split(':')[0]).toBe(binDir);
      expect(executor._resolveCommandPath('claude', nextPath)).toBe(join(binDir, 'claude'));
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  });

  it('should build non-interactive CLI args for each engine', () => {
    expect(executor._getCliArgs('claude', 'hello')).toEqual([
      '--permission-mode',
      'bypassPermissions',
      '-p',
      'hello',
    ]);
    expect(executor._getCliArgs('codex', 'hello')).toEqual(['exec', 'hello']);
  });
});
