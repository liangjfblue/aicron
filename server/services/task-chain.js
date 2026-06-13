import { Scheduler } from './scheduler.js';
import { TaskService } from './task.js';

export async function triggerChildTasksAfterRun({
  db,
  executor,
  task,
  run,
  logger,
  maxDepth = 5,
}) {
  if (!db || !executor || !task || !run) return [];
  if (run.status !== 'succeeded') return [];

  const depth = Number(run.chain_depth || 0);
  if (depth >= maxDepth) return [];

  const taskSvc = new TaskService(db);
  const children = taskSvc.listChainChildren(task.id)
    .filter((child) => child.enabled)
    .filter((child) => child.chain_trigger_mode !== 'cron_only')
    .filter((child) => child.id !== task.id)
    .filter((child) => Scheduler.isTaskActiveNow(child));

  const started = [];
  for (const child of children) {
    try {
      const { run: childRun } = executor.executeAsync(child, {
        triggerType: 'chain',
        parentRun: run,
        chainDepth: depth + 1,
      });
      started.push(childRun);
    } catch (err) {
      logger?.error?.({ err, childTaskId: child.id, parentTaskId: task.id }, 'Chain child trigger failed');
    }
  }
  return started;
}
