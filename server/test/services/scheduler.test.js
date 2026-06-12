import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTaskScheduleSegments, Scheduler } from '../../services/scheduler.js';

describe('Scheduler', () => {
  let scheduler;
  let executed;
  beforeEach(() => {
    scheduler = new Scheduler((taskId) => { executed.push(taskId); });
    executed = [];
  });
  afterEach(() => { scheduler.stopAll(); });

  it('should add and list jobs', () => {
    scheduler.addJob('task-1', '*/1 * * * *');
    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].taskId).toBe('task-1');
    expect(jobs[0].cronExpression).toBe('*/1 * * * *');
  });

  it('should remove a job', () => {
    scheduler.addJob('task-1', '*/1 * * * *');
    scheduler.removeJob('task-1');
    expect(scheduler.listJobs()).toHaveLength(0);
  });

  it('should stop all jobs', () => {
    scheduler.addJob('task-1', '*/1 * * * *');
    scheduler.addJob('task-2', '0 9 * * *');
    scheduler.stopAll();
    expect(scheduler.listJobs()).toHaveLength(0);
  });

  it('should clear every timer when stopping segmented jobs', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    scheduler.addSegments('task-1', [
      { cronExpression: '*/1 * * * *' },
      { cronExpression: '0 9 * * *' },
    ]);

    scheduler.stopAll();

    expect(clearSpy).toHaveBeenCalledTimes(2);
    clearSpy.mockRestore();
  });

  it('should replace existing job when adding same taskId', () => {
    scheduler.addJob('task-1', '*/1 * * * *');
    scheduler.addJob('task-1', '0 9 * * *');
    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].cronExpression).toBe('0 9 * * *');
  });

  it('should add multiple schedule segments for one task', () => {
    scheduler.addSegments('task-1', [
      { label: '阶段一', cronExpression: '0 9 * * 1', activeStartAt: '2026-07-01T00:00' },
      { label: '阶段二', cronExpression: '0 9 * * 1,4', activeEndAt: '2026-12-31T23:59' },
    ]);
    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.label)).toEqual(['阶段一', '阶段二']);
  });

  it('should identify whether a task is inside its active window', () => {
    const now = new Date('2026-12-03T12:00:00');
    expect(Scheduler.isTaskActiveNow({
      active_start_at: '2026-10-01T00:00:00',
      active_end_at: '2027-01-31T23:59:59',
    }, now)).toBe(true);
    expect(Scheduler.isTaskActiveNow({
      active_start_at: '2026-12-04T00:00:00',
    }, now)).toBe(false);
    expect(Scheduler.isTaskActiveNow({
      active_end_at: '2026-12-02T23:59:59',
    }, now)).toBe(false);
  });

  it('should include the whole end minute for minute-precision active windows', () => {
    expect(Scheduler.isTaskActiveNow({
      active_start_at: '2026-06-11T21:46',
      active_end_at: '2026-06-11T21:49',
    }, new Date('2026-06-11T21:49:47'))).toBe(true);

    expect(Scheduler.isTaskActiveNow({
      active_start_at: '2026-06-11T21:46',
      active_end_at: '2026-06-11T21:49',
    }, new Date('2026-06-11T21:50:00'))).toBe(false);
  });

  it('should prefer schedule segments over legacy cron expression', () => {
    const segments = getTaskScheduleSegments({
      cron_expression: '0 9 * * *',
      active_start_at: '2026-01-01T00:00',
      schedule_segments: [
        {
          label: '解禁窗口',
          cron_expression: '0 9 * * 1,4',
          active_start_at: '2026-10-01T00:00',
          active_end_at: '2027-01-31T23:59',
        },
      ],
    });

    expect(segments).toEqual([
      {
        label: '解禁窗口',
        cronExpression: '0 9 * * 1,4',
        activeStartAt: '2026-10-01T00:00',
        activeEndAt: '2027-01-31T23:59',
      },
    ]);
  });
});
