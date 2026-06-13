import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb, closeDb } from '../../db/index.js';
import { TaskService } from '../../services/task.js';
import { RunService } from '../../services/run.js';
import { triggerChildTasksAfterRun } from '../../services/task-chain.js';

describe('triggerChildTasksAfterRun', () => {
  let db, taskSvc, runSvc;

  beforeEach(() => {
    db = getDb();
    taskSvc = new TaskService(db);
    runSvc = new RunService(db);
  });

  afterEach(() => {
    closeDb();
  });

  function createRun(task, status = 'succeeded') {
    return runSvc.create({
      id: `${task.id}-run`,
      task_id: task.id,
      status,
      engine: task.engine,
      trigger_type: 'manual',
      started_at: '2026-06-13T00:00:00.000Z',
    });
  }

  it('starts enabled child tasks after parent run succeeds', async () => {
    const parent = taskSvc.create({ name: '父任务', prompt_template: '父', engine: 'claude' });
    const child = taskSvc.create({
      name: '子任务',
      prompt_template: '子 {{parent_result}}',
      engine: 'claude',
      chain_parent_id: parent.id,
      chain_trigger_mode: 'chain_only',
    });
    const parentRun = createRun(parent);
    const executor = {
      executeAsync: vi.fn((task, options) => ({
        run: { id: `${task.id}-child-run`, task_id: task.id, status: 'running', trigger_type: options.triggerType },
        promise: Promise.resolve(),
      })),
    };

    const childRuns = await triggerChildTasksAfterRun({ db, executor, task: parent, run: parentRun });

    expect(childRuns).toHaveLength(1);
    expect(executor.executeAsync).toHaveBeenCalledWith(child, expect.objectContaining({
      triggerType: 'chain',
      parentRun,
      chainDepth: 1,
    }));
  });

  it('does not trigger disabled or cron-only child tasks', async () => {
    const parent = taskSvc.create({ name: '父任务', prompt_template: '父', engine: 'claude' });
    const disabled = taskSvc.create({
      name: '禁用子任务',
      prompt_template: '子',
      engine: 'claude',
      chain_parent_id: parent.id,
      chain_trigger_mode: 'chain_only',
    });
    taskSvc.toggle(disabled.id, false);
    taskSvc.create({
      name: '仅定时子任务',
      prompt_template: '子',
      engine: 'claude',
      chain_parent_id: parent.id,
      chain_trigger_mode: 'cron_only',
    });
    const executor = { executeAsync: vi.fn() };

    const childRuns = await triggerChildTasksAfterRun({
      db,
      executor,
      task: parent,
      run: createRun(parent),
    });

    expect(childRuns).toEqual([]);
    expect(executor.executeAsync).not.toHaveBeenCalled();
  });

  it('does not trigger children when parent run did not succeed', async () => {
    const parent = taskSvc.create({ name: '父任务', prompt_template: '父', engine: 'claude' });
    taskSvc.create({
      name: '子任务',
      prompt_template: '子',
      engine: 'claude',
      chain_parent_id: parent.id,
      chain_trigger_mode: 'chain_only',
    });
    const executor = { executeAsync: vi.fn() };

    const childRuns = await triggerChildTasksAfterRun({
      db,
      executor,
      task: parent,
      run: createRun(parent, 'failed'),
    });

    expect(childRuns).toEqual([]);
    expect(executor.executeAsync).not.toHaveBeenCalled();
  });
});
