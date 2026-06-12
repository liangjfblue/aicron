import Fastify from 'fastify';
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
import { Scheduler, scheduleTask } from './services/scheduler.js';
import { Executor } from './services/executor.js';
import { TaskService } from './services/task.js';
import { NotifyService } from './services/notify.js';
import { AuthService } from './services/auth.js';

const app = Fastify({ logger: true });

// Auth middleware — defined at top level so all routes can access it
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

app.decorate('db', getDb());
app.decorate('authenticate', authenticate);
app.register(authRoutes);
app.register(taskRoutes);
app.register(runRoutes);
app.register(settingsRoutes);
app.register(promptRoutes);
app.register(skillRoutes);
app.register(healthRoutes);

// Initialize executor
const executor = new Executor(getDb());

// Wire notification into executor
const notifySvc = new NotifyService(getDb());
executor.onRunComplete = async (task, run) => {
  try {
    const rows = getDb().prepare('SELECT * FROM settings').all();
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
};

// Initialize scheduler
const scheduler = new Scheduler(async (taskId) => {
  const taskSvc = new TaskService(app.db);
  const task = taskSvc.getById(taskId);
  if (!task || !task.enabled) return;
  if (!Scheduler.isTaskActiveNow(task)) return;
  await executor.execute(task, { triggerType: 'cron' });
});

// Load existing enabled tasks with cron into scheduler
const taskSvc = new TaskService(getDb());
const tasks = taskSvc.list({ enabled: true });
for (const t of tasks) {
  scheduleTask(scheduler, t);
}

// Decorate fastify with executor and scheduler
app.decorate('executor', executor);
app.decorate('scheduler', scheduler);

// Create default admin user if no users exist
const authSvc = new AuthService(getDb());
const existingUser = getDb().prepare('SELECT id FROM users LIMIT 1').get();
if (!existingUser) {
  const defaultUser = process.env.ADMIN_USER || 'admin';
  const defaultPass = process.env.ADMIN_PASS || 'admin123';
  try {
    await authSvc.createUser(defaultUser, defaultPass);
    app.log.info(`默认用户已创建: ${defaultUser} / ${defaultPass}`);
  } catch (err) {
    app.log.warn(`创建默认用户失败: ${err.message}`);
  }
}

app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

try {
  getDb();
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

process.on('SIGINT', async () => {
  scheduler.stopAll();
  closeDb();
  await app.close();
  process.exit(0);
});

export default app;
