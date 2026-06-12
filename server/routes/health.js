import { TaskService } from '../services/task.js';
import { RunService } from '../services/run.js';

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function buildTaskHealth(task, runs) {
  const latest = runs[0] || null;
  const latestSuccess = runs.find((run) => run.status === 'succeeded') || null;
  const recentFailures = runs.filter((run) => ['failed', 'timeout'].includes(run.status));
  const consecutiveFailures = [];
  for (const run of runs) {
    if (!['failed', 'timeout'].includes(run.status)) break;
    consecutiveFailures.push(run);
  }
  const finishedRuns = runs.filter((run) => Number.isFinite(run.duration_ms));
  const avgDurationMs = finishedRuns.length
    ? Math.round(finishedRuns.reduce((sum, run) => sum + run.duration_ms, 0) / finishedRuns.length)
    : null;
  const lastSuccessAt = latestSuccess?.finished_at || latestSuccess?.started_at || null;
  const stale = task.enabled && latest && lastSuccessAt && Date.parse(lastSuccessAt) < Date.parse(daysAgo(7));
  const issues = [];
  if (latest?.status === 'running') issues.push('正在执行');
  if (consecutiveFailures.length >= 2) issues.push(`连续失败 ${consecutiveFailures.length} 次`);
  if (recentFailures.length > 0) issues.push(`近 7 天失败/超时 ${recentFailures.length} 次`);
  if (stale) issues.push('超过 7 天未成功');
  if (task.enabled && !latest) issues.push('尚未执行');
  if (avgDurationMs && task.timeout_seconds && avgDurationMs > task.timeout_seconds * 1000 * 0.8) {
    issues.push('平均耗时接近超时');
  }

  let level = 'healthy';
  if (issues.some((item) => /连续失败|超过 7 天未成功/.test(item))) level = 'danger';
  else if (issues.length > 0) level = 'warn';

  return {
    task_id: task.id,
    task_name: task.name,
    enabled: Boolean(task.enabled),
    level,
    issues,
    latest_run: latest,
    last_success_at: lastSuccessAt,
    recent_failure_count: recentFailures.length,
    consecutive_failure_count: consecutiveFailures.length,
    avg_duration_ms: avgDurationMs,
  };
}

export async function healthRoutes(app) {
  app.get('/api/dashboard/health', { preHandler: [app.authenticate] }, async () => {
    const taskSvc = new TaskService(app.db);
    const runSvc = new RunService(app.db);
    const tasks = taskSvc.list();
    const since = daysAgo(7);
    const recentRuns = runSvc.listAll(500);
    const recentFailures = recentRuns.filter((run) =>
      ['failed', 'timeout'].includes(run.status) && Date.parse(run.finished_at || run.started_at || 0) >= Date.parse(since)
    );
    const runningRuns = recentRuns.filter((run) => run.status === 'running');
    const taskHealth = tasks.map((task) => buildTaskHealth(task, runSvc.listByTask(task.id, 20)));

    return {
      generated_at: new Date().toISOString(),
      totals: {
        tasks: tasks.length,
        enabled: tasks.filter((task) => task.enabled).length,
        running: runningRuns.length,
        recent_failures: recentFailures.length,
        unhealthy: taskHealth.filter((item) => item.level === 'danger').length,
        warnings: taskHealth.filter((item) => item.level === 'warn').length,
      },
      running_runs: runningRuns,
      recent_failures: recentFailures.slice(0, 20),
      tasks: taskHealth,
    };
  });
}
