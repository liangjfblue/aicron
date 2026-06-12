import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { getDb, closeDb } from '../../db/index.js';
import { verifyToken } from '../../utils/jwt.js';
import { authRoutes } from '../../routes/auth.js';
import { taskRoutes } from '../../routes/tasks.js';
import { AuthService } from '../../services/auth.js';
import { TaskService } from '../../services/task.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('db', getDb());
  app.decorate('authenticate', async function (request, reply) {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return reply.code(401).send({ error: '未登录' });
    }
    try {
      request.user = verifyToken(auth.slice(7));
    } catch {
      return reply.code(401).send({ error: '登录已过期' });
    }
  });
  app.register(authRoutes);
  app.decorate('scheduler', {
    addJob: vi.fn(),
    removeJob: vi.fn(),
  });
  app.decorate('executor', {
    executeAsync: vi.fn(() => ({
      run: {
        id: 'run-async',
        task_id: 'task-1',
        status: 'running',
        engine: 'claude',
        started_at: new Date().toISOString(),
      },
      promise: Promise.resolve(),
    })),
  });
  app.decorate('importAnalyzer', {
    analyze: vi.fn(async (text) => ({
      name: '产品发布前分析',
      description: '分析产品发布前市场状态',
      prompt_template: text,
      engine: 'claude',
      cron_expression: null,
      timeout_seconds: 1800,
      tags: ['产品', '发布'],
      feishu_mode: 'full',
      confidence: {
        name: 'high',
        description: 'medium',
        cron_expression: 'low',
        tags: 'medium',
      },
      notes: ['检测到一次性日期，未生成 cron'],
    })),
    analyzeCron: vi.fn(async (text) => ({
      cron_expression: '0 9 * * 1',
      confidence: 'high',
      explanation: `已解析：${text}`,
    })),
  });
  app.register(taskRoutes);
  await app.ready();
  return app;
}

describe('Task Routes', () => {
  let app, token, task;

  beforeEach(async () => {
    app = await buildApp();
    const db = getDb();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM runs').run();
    db.prepare('DELETE FROM tasks').run();

    const authSvc = new AuthService(db);
    await authSvc.createUser('tasktester', 'testpass');
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'tasktester', password: 'testpass' },
    });
    token = login.json().token;

    const taskSvc = new TaskService(db);
    task = taskSvc.create({ name: 'async task', prompt_template: 'hello', engine: 'claude' });
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  it('POST /api/tasks/:id/run returns a running run immediately', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/run`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({
      id: 'run-async',
      status: 'running',
      engine: 'claude',
    });
    expect(app.executor.executeAsync).toHaveBeenCalledTimes(1);
  });

  it('POST /api/tasks/import/analyze returns AI import draft', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks/import/analyze',
      headers: { authorization: `Bearer ${token}` },
      payload: { text: '/research-skill 分析产品发布前市场状态' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: '产品发布前分析',
      engine: 'claude',
      cron_expression: null,
      timeout_seconds: 1800,
      tags: ['产品', '发布'],
    });
    expect(app.importAnalyzer.analyze).toHaveBeenCalledWith('/research-skill 分析产品发布前市场状态');
  });

  it('POST /api/tasks/import/analyze returns raw output on parse error', async () => {
    const err = new Error('AI 返回格式不符合要求，请查看原始返回');
    err.code = 'AI_IMPORT_PARSE_ERROR';
    err.parseMessage = "Expected ',' or '}' after property value";
    err.rawOutput = '{"name":"bad" "description":"json"}';
    app.importAnalyzer.analyze.mockRejectedValueOnce(err);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks/import/analyze',
      headers: { authorization: `Bearer ${token}` },
      payload: { text: 'bad json please' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'AI 返回格式不符合要求，请查看原始返回',
      code: 'AI_IMPORT_PARSE_ERROR',
      parse_message: "Expected ',' or '}' after property value",
      raw_output: '{"name":"bad" "description":"json"}',
    });
  });

  it('POST /api/tasks/import/cron returns cron draft', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks/import/cron',
      headers: { authorization: `Bearer ${token}` },
      payload: { text: '每周一早上 9 点' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      cron_expression: '0 9 * * 1',
      confidence: 'high',
    });
    expect(app.importAnalyzer.analyzeCron).toHaveBeenCalledWith('每周一早上 9 点');
  });
});
