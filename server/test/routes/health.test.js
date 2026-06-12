import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { getDb, closeDb } from '../../db/index.js';
import { verifyToken } from '../../utils/jwt.js';
import { authRoutes } from '../../routes/auth.js';
import { healthRoutes } from '../../routes/health.js';
import { AuthService } from '../../services/auth.js';
import { TaskService } from '../../services/task.js';
import { RunService } from '../../services/run.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('db', getDb());
  app.decorate('authenticate', async function (request, reply) {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return reply.code(401).send({ error: '未登录' });
    try {
      request.user = verifyToken(auth.slice(7));
    } catch {
      return reply.code(401).send({ error: '登录已过期' });
    }
  });
  app.register(authRoutes);
  app.register(healthRoutes);
  await app.ready();
  return app;
}

describe('Health Routes', () => {
  let app, token, db;

  beforeEach(async () => {
    app = await buildApp();
    db = getDb();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM runs').run();
    db.prepare('DELETE FROM tasks').run();
    const authSvc = new AuthService(db);
    await authSvc.createUser('healthtester', 'testpass');
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'healthtester', password: 'testpass' },
    });
    token = login.json().token;
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  it('GET /api/dashboard/health returns task health summary', async () => {
    const taskSvc = new TaskService(db);
    const runSvc = new RunService(db);
    const task = taskSvc.create({ name: 'unstable task', prompt_template: 'p', engine: 'claude' });
    runSvc.create({
      id: 'run-failed',
      task_id: task.id,
      status: 'failed',
      engine: 'claude',
      trigger_type: 'manual',
      started_at: new Date().toISOString(),
    });
    runSvc.update('run-failed', {
      finished_at: new Date().toISOString(),
      failure_reason: '执行失败',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/health',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().totals.recent_failures).toBe(1);
    expect(res.json().tasks[0]).toMatchObject({
      task_name: 'unstable task',
      recent_failure_count: 1,
    });
  });

  it('server module exports a reusable app factory', async () => {
    const mod = await import('../../index.js');
    expect(typeof mod.createApp).toBe('function');
  });
});
