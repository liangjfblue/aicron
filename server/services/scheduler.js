import { CronExpressionParser } from 'cron-parser';

export class Scheduler {
  constructor(onTrigger) {
    this.onTrigger = onTrigger;
    this.jobs = new Map(); // taskId → [{ timer, cronExpression, activeStartAt, activeEndAt }]
  }

  _addTimer(taskId, segment) {
    const timer = setInterval(() => {
      try {
        const now = new Date();
        if (!Scheduler.isTaskActiveNow({
          active_start_at: segment.activeStartAt,
          active_end_at: segment.activeEndAt,
        }, now)) return;
        const expr = CronExpressionParser.parse(segment.cronExpression);
        const prev = expr.prev().getTime();
        const diff = now.getTime() - prev;
        // If the previous fire time was within the last 60 seconds, trigger
        if (diff >= 0 && diff < 60000) {
          this.onTrigger(taskId);
        }
      } catch {
        // Invalid cron expression, skip this check
      }
    }, 60000); // Check every minute
    return { timer, ...segment };
  }

  addJob(taskId, cronExpression, options = {}) {
    this.addSegments(taskId, [{
      cronExpression,
      activeStartAt: options.activeStartAt || null,
      activeEndAt: options.activeEndAt || null,
      label: options.label || '',
    }]);
  }

  addSegments(taskId, segments) {
    this.removeJob(taskId); // Remove existing first
    const normalized = (segments || [])
      .filter((segment) => segment?.cronExpression)
      .map((segment) => this._addTimer(taskId, {
        cronExpression: segment.cronExpression,
        activeStartAt: segment.activeStartAt || null,
        activeEndAt: segment.activeEndAt || null,
        label: segment.label || '',
      }));
    if (normalized.length) this.jobs.set(taskId, normalized);
  }

  removeJob(taskId) {
    const entries = this.jobs.get(taskId);
    if (entries) {
      for (const entry of entries) clearInterval(entry.timer);
      this.jobs.delete(taskId);
    }
  }

  listJobs() {
    return Array.from(this.jobs.entries()).flatMap(([taskId, entries]) =>
      entries.map(({ cronExpression, activeStartAt, activeEndAt, label }) => ({
        taskId,
        cronExpression,
        activeStartAt,
        activeEndAt,
        label,
      }))
    );
  }

  static isTaskActiveNow(task, now = new Date()) {
    if (!task) return false;
    const nowTime = now.getTime();
    if (task.active_start_at) {
      const start = new Date(task.active_start_at).getTime();
      if (!Number.isNaN(start) && nowTime < start) return false;
    }
    if (task.active_end_at) {
      const end = Scheduler._parseActiveEndTime(task.active_end_at);
      if (!Number.isNaN(end) && nowTime > end) return false;
    }
    return true;
  }

  static _parseActiveEndTime(value) {
    const end = new Date(value);
    if (Number.isNaN(end.getTime())) return Number.NaN;

    // datetime-local values are usually minute precision. Treat an end like
    // 21:49 as inclusive through 21:49:59.999, matching user expectation.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value))) {
      end.setSeconds(59, 999);
    }
    return end.getTime();
  }

  stopAll() {
    for (const entries of this.jobs.values()) {
      for (const entry of entries) clearInterval(entry.timer);
    }
    this.jobs.clear();
  }
}

export function getTaskScheduleSegments(task) {
  const segments = Array.isArray(task?.schedule_segments) ? task.schedule_segments : [];
  const normalized = segments
    .filter((segment) => segment?.cron_expression || segment?.cronExpression)
    .map((segment) => ({
      label: segment.label || '',
      cronExpression: segment.cron_expression || segment.cronExpression,
      activeStartAt: segment.active_start_at || segment.activeStartAt || null,
      activeEndAt: segment.active_end_at || segment.activeEndAt || null,
    }));

  if (normalized.length) return normalized;
  if (!task?.cron_expression) return [];
  return [{
    label: '',
    cronExpression: task.cron_expression,
    activeStartAt: task.active_start_at || null,
    activeEndAt: task.active_end_at || null,
  }];
}

export function scheduleTask(scheduler, task) {
  scheduler.removeJob(task.id);
  if (!task?.enabled) return;
  const segments = getTaskScheduleSegments(task);
  if (segments.length) scheduler.addSegments(task.id, segments);
}
