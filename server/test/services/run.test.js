import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../../db/index.js';
import { RunService } from '../../services/run.js';
import { TaskService } from '../../services/task.js';

describe('RunService', () => {
  let db, runSvc, task;

  beforeEach(() => {
    db = getDb();
    db.prepare('DELETE FROM runs').run();
    db.prepare('DELETE FROM tasks').run();
    runSvc = new RunService(db);
    const taskSvc = new TaskService(db);
    task = taskSvc.create({ name: 'event task', prompt_template: 'hello', engine: 'claude' });
  });

  afterEach(() => { closeDb(); });

  it('should add and read run events in order', () => {
    runSvc.create({
      id: 'run-events-1',
      task_id: task.id,
      status: 'running',
      engine: 'claude',
      trigger_type: 'manual',
    });

    runSvc.addEvent('run-events-1', 'preparing', '已准备执行', '变量替换完成', { engine: 'claude' });
    runSvc.addEvent('run-events-1', 'started', '已启动执行引擎');

    const run = runSvc.getById('run-events-1');
    expect(run.events).toHaveLength(2);
    expect(run.events.map((event) => event.type)).toEqual(['preparing', 'started']);
    expect(run.events[0].metadata).toEqual({ engine: 'claude' });
    expect(run.latest_event).toMatchObject({ type: 'started', title: '已启动执行引擎' });
  });
});
