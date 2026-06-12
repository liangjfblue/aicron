import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { getDb, closeDb } from '../../db/index.js';
import { verifyToken } from '../../utils/jwt.js';
import { authRoutes } from '../../routes/auth.js';
import { runRoutes } from '../../routes/runs.js';
import { RunService } from '../../services/run.js';
import { TaskService } from '../../services/task.js';
import { AuthService } from '../../services/auth.js';
import { writeResult } from '../../utils/result-store.js';
import { existsSync } from 'node:fs';

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
  app.register(runRoutes);
  await app.ready();
  return app;
}

describe('Run Routes', () => {
  let app, token, taskId, runSvc;

  beforeEach(async () => {
    app = await buildApp();
    const db = getDb();

    // Clean up users from previous test runs
    db.prepare('DELETE FROM users').run();

    // Create a user and get auth token
    const authSvc = new AuthService(db);
    await authSvc.createUser('runtester', 'testpass');
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'runtester', password: 'testpass' },
    });
    token = login.json().token;

    // Create a task
    const taskSvc = new TaskService(db);
    const task = taskSvc.create({ name: 'test task', prompt_template: 'hello', engine: 'claude' });
    taskId = task.id;

    runSvc = new RunService(db);
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  it('GET /api/tasks/:id/runs returns runs for a task', async () => {
    runSvc.create({
      id: 'run-1', task_id: taskId, status: 'succeeded',
      engine: 'claude', resolved_prompt: 'hello', trigger_type: 'manual',
    });

    const res = await app.inject({
      method: 'GET', url: `/api/tasks/${taskId}/runs`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('run-1');
  });

  it('GET /api/runs/:runId returns a single run', async () => {
    runSvc.create({
      id: 'run-2', task_id: taskId, status: 'succeeded',
      engine: 'claude', resolved_prompt: 'hello', trigger_type: 'manual',
    });

    const res = await app.inject({
      method: 'GET', url: '/api/runs/run-2',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('run-2');
  });

  it('GET /api/runs/:runId returns 404 for missing run', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/runs/nonexistent',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/runs/:runId/result returns markdown content', async () => {
    const resultPath = writeResult(taskId, 'run-3', '# Hello Result\nThis is a test.');
    runSvc.create({
      id: 'run-3', task_id: taskId, status: 'succeeded',
      engine: 'claude', resolved_prompt: 'hello', trigger_type: 'manual',
    });
    runSvc.update('run-3', { result_path: resultPath });

    const res = await app.inject({
      method: 'GET', url: '/api/runs/run-3/result',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.body).toContain('# Hello Result');
  });

  it('GET /api/runs/:runId/result returns 404 when no result file', async () => {
    runSvc.create({
      id: 'run-4', task_id: taskId, status: 'failed',
      engine: 'claude', resolved_prompt: 'hello', trigger_type: 'manual',
    });

    const res = await app.inject({
      method: 'GET', url: '/api/runs/run-4/result',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/runs/compare returns diff between two runs', async () => {
    const path1 = writeResult(taskId, 'run-5', 'line1\nline2\n');
    const path2 = writeResult(taskId, 'run-6', 'line1\nline3\n');

    runSvc.create({
      id: 'run-5', task_id: taskId, status: 'succeeded',
      engine: 'claude', resolved_prompt: 'hello', trigger_type: 'manual',
    });
    runSvc.update('run-5', { result_path: path1 });

    runSvc.create({
      id: 'run-6', task_id: taskId, status: 'succeeded',
      engine: 'claude', resolved_prompt: 'hello', trigger_type: 'manual',
    });
    runSvc.update('run-6', { result_path: path2 });

    const res = await app.inject({
      method: 'GET', url: '/api/runs/compare?runId1=run-5&runId2=run-6',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.diff).toBeDefined();
    expect(Array.isArray(body.diff)).toBe(true);
    expect(body.diff.some((c) => c.removed)).toBe(true);
    expect(body.diff.some((c) => c.added)).toBe(true);
  });

  it('GET /api/runs/compare returns 400 without required params', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/runs/compare?runId1=run-5',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/runs/compare returns 404 for missing runs', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/runs/compare?runId1=nope1&runId2=nope2',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/runs/:runId deletes a run, events, and result file', async () => {
    const resultPath = writeResult(taskId, 'run-delete', '# Delete me');
    runSvc.create({
      id: 'run-delete', task_id: taskId, status: 'succeeded',
      engine: 'claude', resolved_prompt: 'hello', trigger_type: 'manual',
    });
    runSvc.update('run-delete', { result_path: resultPath });
    runSvc.addEvent('run-delete', 'succeeded', '执行完成');

    const res = await app.inject({
      method: 'DELETE', url: '/api/runs/run-delete',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(204);
    expect(runSvc.getById('run-delete')).toBeNull();
    expect(runSvc.listEvents('run-delete')).toHaveLength(0);
    expect(existsSync(resultPath)).toBe(false);
  });

  it('DELETE /api/runs/:runId rejects running runs', async () => {
    runSvc.create({
      id: 'run-running', task_id: taskId, status: 'running',
      engine: 'claude', resolved_prompt: 'hello', trigger_type: 'manual',
    });

    const res = await app.inject({
      method: 'DELETE', url: '/api/runs/run-running',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
    expect(runSvc.getById('run-running')).toBeDefined();
  });

  it('routes require authentication', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/tasks/${taskId}/runs`,
    });
    expect(res.statusCode).toBe(401);
  });
});
