import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../../db/index.js';
import { TaskService } from '../../services/task.js';

describe('TaskService', () => {
  let svc;

  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM runs').run();
    db.prepare('DELETE FROM tasks').run();
    svc = new TaskService(db);
  });

  afterEach(() => { closeDb(); });

  const sampleTask = {
    name: 'Test Task',
    description: 'A test task',
    prompt_template: 'Hello {{name}}',
    engine: 'claude',
    cron_expression: '*/5 * * * *',
    active_start_at: '2026-07-01T00:00',
    active_end_at: '2026-12-31T23:59',
    schedule_segments: JSON.stringify([
      {
        label: '中报窗口',
        cron_expression: '0 9 * * 1',
        active_start_at: '2026-07-01T00:00',
        active_end_at: '2026-08-31T23:59',
      },
    ]),
    timeout_seconds: 60,
    feishu_mode: 'full',
    feishu_chat_ids: '["chat1"]',
    notify_on_change: true,
    auto_include_last_result: false,
    tags: '["daily"]',
  };

  it('should create a task', () => {
    const task = svc.create(sampleTask);
    expect(task).toBeDefined();
    expect(task.id).toBeDefined();
    expect(task.name).toBe('Test Task');
    expect(task.engine).toBe('claude');
    expect(task.enabled).toBe(1);
    expect(task.active_start_at).toBe('2026-07-01T00:00');
    expect(task.active_end_at).toBe('2026-12-31T23:59');
    expect(task.schedule_segments).toHaveLength(1);
    expect(task.schedule_segments[0].label).toBe('中报窗口');
    expect(task.feishu_chat_ids).toEqual(['chat1']);
    expect(task.tags).toEqual(['daily']);
    expect(task.notify_on_change).toBe(1);
    expect(task.auto_include_last_result).toBe(false);
  });

  it('should list all tasks', () => {
    svc.create(sampleTask);
    svc.create({ ...sampleTask, name: 'Task 2', engine: 'codex' });
    const tasks = svc.list();
    expect(tasks).toHaveLength(2);
  });

  it('should get task by id', () => {
    const created = svc.create(sampleTask);
    const found = svc.getById(created.id);
    expect(found).toBeDefined();
    expect(found.name).toBe('Test Task');
  });

  it('should return null for non-existent id', () => {
    const found = svc.getById('non-existent-id');
    expect(found).toBeNull();
  });

  it('should update a task', () => {
    const created = svc.create(sampleTask);
    const updated = svc.update(created.id, {
      name: 'Updated Task',
      description: 'New desc',
      active_start_at: '2027-01-01T00:00',
      active_end_at: null,
      schedule_segments: '[]',
      auto_include_last_result: true,
    });
    expect(updated.name).toBe('Updated Task');
    expect(updated.description).toBe('New desc');
    expect(updated.engine).toBe('claude');
    expect(updated.active_start_at).toBe('2027-01-01T00:00');
    expect(updated.active_end_at).toBeNull();
    expect(updated.schedule_segments).toEqual([]);
    expect(updated.auto_include_last_result).toBe(true);
  });

  it('should return task unchanged when update has no allowed fields', () => {
    const created = svc.create(sampleTask);
    const updated = svc.update(created.id, {});
    expect(updated.name).toBe(created.name);
  });

  it('should delete a task', () => {
    const created = svc.create(sampleTask);
    svc.delete(created.id);
    const found = svc.getById(created.id);
    expect(found).toBeNull();
  });

  it('should toggle task enabled state', () => {
    const created = svc.create(sampleTask);
    expect(created.enabled).toBe(1);
    const disabled = svc.toggle(created.id, false);
    expect(disabled.enabled).toBe(0);
    const enabled = svc.toggle(created.id, true);
    expect(enabled.enabled).toBe(1);
  });

  it('should list tasks with enabled filter', () => {
    const t1 = svc.create(sampleTask);
    svc.toggle(t1.id, false);
    svc.create({ ...sampleTask, name: 'Task 2' });
    const enabledTasks = svc.list({ enabled: true });
    const disabledTasks = svc.list({ enabled: false });
    expect(enabledTasks).toHaveLength(1);
    expect(enabledTasks[0].name).toBe('Task 2');
    expect(disabledTasks).toHaveLength(1);
    expect(disabledTasks[0].name).toBe('Test Task');
  });

  it('should list tasks with tag filter', () => {
    svc.create({ ...sampleTask, tags: '["daily","report"]' });
    svc.create({ ...sampleTask, name: 'Weekly', tags: '["weekly"]' });
    const daily = svc.list({ tag: 'daily' });
    expect(daily).toHaveLength(1);
    expect(daily[0].name).toBe('Test Task');
  });

  it('should list tasks with engine filter', () => {
    svc.create(sampleTask);
    svc.create({ ...sampleTask, name: 'Codex Task', engine: 'codex' });
    const claudeTasks = svc.list({ engine: 'claude' });
    expect(claudeTasks).toHaveLength(1);
    expect(claudeTasks[0].engine).toBe('claude');
  });

  it('should parse JSON fields on read', () => {
    const task = svc.create({
      ...sampleTask,
      feishu_chat_ids: '["chat1","chat2"]',
      tags: '["tag1","tag2","tag3"]',
    });
    expect(task.feishu_chat_ids).toEqual(['chat1', 'chat2']);
    expect(task.tags).toEqual(['tag1', 'tag2', 'tag3']);
  });
});
