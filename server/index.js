import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { getDb, closeDb } from './db/index.js';
import { verifyToken } from './utils/jwt.js';
import { authRoutes } from './routes/auth.js';
import { taskRoutes } from './routes/tasks.js';
import { runRoutes } from './routes/runs.js';
import { settingsRoutes } from './routes/settings.js';
import { promptRoutes } from './routes/prompt.js';
import { skillRoutes } from './routes/skill.js';
import { healthRoutes } from './routes/health.js';
import { bootstrapRoutes } from './routes/bootstrap.js';
import { Scheduler, scheduleTask } from './services/scheduler.js';
import { Executor } from './services/executor.js';
import { TaskService } from './services/task.js';
import { NotifyService } from './services/notify.js';
import { triggerChildTasksAfterRun } from './services/task-chain.js';

async function authenticate(request, reply) {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return reply.code(401).send({ error: '未登录' });
  }
  try {
    request.user = verifyToken(auth.slice(7));
  } catch {
    return reply.code(401).send({ error: '登录已过期' });
  }
}

export async function createApp(options = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  const db = getDb();

  app.decorate('db', db);
  app.decorate('authenticate', authenticate);
  app.register(bootstrapRoutes);
  app.register(authRoutes);
  app.register(taskRoutes);
  app.register(runRoutes);
  app.register(settingsRoutes);
  app.register(promptRoutes);
  app.register(skillRoutes);
  app.register(healthRoutes);

  const executor = new Executor(db);
  const notifySvc = new NotifyService(db);
  executor.onRunComplete = async (task, run) => {
    if (options.onRunComplete) {
      try {
        await options.onRunComplete(task, run);
      } catch (err) {
        app.log.error({ err }, 'Run completion hook error');
      }
    }
    try {
      const rows = db.prepare('SELECT * FROM settings').all();
      const settings = {};
      for (const r of rows) settings[r.key] = r.value;
      if (settings.feishuAppId && settings.feishuAppSecret) {
        notifySvc.runSvc.addEvent(run.id, 'notifying', '准备发送通知', '执行结果已生成，正在推送飞书', {
          stage: 'notify',
          progress: 92,
          severity: 'info',
        });
        const result = await notifySvc.notify(task, run, settings);
        if (result?.skipped) {
          notifySvc.runSvc.addEvent(run.id, 'notify_skipped', '通知已跳过', result.reason || '未发送通知', {
            stage: 'notify',
            progress: 100,
            severity: 'warn',
          });
        } else {
          notifySvc.runSvc.addEvent(run.id, 'notified', '通知已发送', '飞书消息推送完成', {
            stage: 'notify',
            progress: 100,
            severity: 'success',
            notification_level: result?.level,
          });
        }
      } else {
        notifySvc.runSvc.addEvent(run.id, 'notify_skipped', '通知已跳过', '未配置飞书应用', {
          stage: 'notify',
          progress: 100,
          severity: 'warn',
        });
      }
    } catch (err) {
      notifySvc.runSvc.addEvent(run.id, 'notify_failed', '通知失败', err.message, {
        stage: 'notify',
        progress: 100,
        severity: 'error',
      });
      app.log.error({ err }, 'Notify error');
    }
    try {
      const childRuns = await triggerChildTasksAfterRun({
        db,
        executor,
        task,
        run,
        logger: app.log,
      });
      if (childRuns.length > 0) {
        notifySvc.runSvc.addEvent(run.id, 'chain_triggered', '已触发子任务', `已启动 ${childRuns.length} 个子任务`, {
          stage: 'chain',
          progress: 100,
          severity: 'success',
          child_run_ids: childRuns.map((childRun) => childRun.id),
        });
      }
    } catch (err) {
      notifySvc.runSvc.addEvent(run.id, 'chain_failed', '子任务触发失败', err.message, {
        stage: 'chain',
        progress: 100,
        severity: 'error',
      });
      app.log.error({ err }, 'Chain trigger error');
    }
  };

  const scheduler = new Scheduler(async (taskId) => {
    const taskSvc = new TaskService(db);
    const task = taskSvc.getById(taskId);
    if (!task || !task.enabled) return;
    if (task.chain_trigger_mode === 'chain_only') return;
    if (!Scheduler.isTaskActiveNow(task)) return;
    await executor.execute(task, { triggerType: 'cron' });
  });

  const taskSvc = new TaskService(db);
  const tasks = taskSvc.list({ enabled: true });
  for (const t of tasks) {
    scheduleTask(scheduler, t);
  }

  app.decorate('executor', executor);
  app.decorate('scheduler', scheduler);

  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  app.addHook('onClose', async () => {
    scheduler.stopAll();
    closeDb();
  });

  return app;
}

export async function startServer(options = {}) {
  const app = await createApp(options);
  await app.listen({
    port: options.port || config.PORT,
    host: options.host || config.HOST,
  });
  return app;
}

const isCli = process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  const app = await startServer();
  process.on('SIGINT', async () => {
    await app.close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await app.close();
    process.exit(0);
  });
}
