import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '../../db/index.js';
import { verifyToken } from '../../utils/jwt.js';
import { authRoutes } from '../../routes/auth.js';
import { taskRoutes } from '../../routes/tasks.js';
import { AuthService } from '../../services/auth.js';
import { TaskService } from '../../services/task.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

vi.mock('../../utils/feishu.js', () => ({
  getAppToken: vi.fn().mockResolvedValue('mock-token'),
  sendMessage: vi.fn().mockResolvedValue({ code: 0 }),
  sendRichTextMessage: vi.fn().mockResolvedValue({ code: 0 }),
  sendFileMessage: vi.fn().mockResolvedValue({ code: 0 }),
  uploadFile: vi.fn().mockResolvedValue('mock-file-key'),
}));

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
    execute: vi.fn(async (taskData) => ({
      id: 'run-test',
      task_id: taskData.id,
      status: 'succeeded',
      engine: taskData.engine,
      stdout: 'ok',
    })),
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
    db.prepare('DELETE FROM settings').run();
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

  it('POST /api/tasks stores chain trigger mode', async () => {
    const parentSvc = new TaskService(getDb());
    const parent = parentSvc.create({ name: '父任务', prompt_template: '父', engine: 'claude' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: '子任务',
        prompt_template: '子 {{parent_result}}',
        engine: 'claude',
        chain_parent_id: parent.id,
        chain_trigger_mode: 'chain_only',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: '子任务',
      chain_parent_id: parent.id,
      chain_trigger_mode: 'chain_only',
    });
  });

  it('POST /api/tasks stores parent result auto include setting', async () => {
    const parentSvc = new TaskService(getDb());
    const parent = parentSvc.create({ name: '父任务', prompt_template: '父', engine: 'claude' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: '子任务不注入父结果',
        prompt_template: '子任务',
        engine: 'claude',
        chain_parent_id: parent.id,
        chain_trigger_mode: 'chain_only',
        auto_include_parent_result: false,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: '子任务不注入父结果',
      auto_include_parent_result: false,
    });
  });

  it('POST /api/tasks defaults chain trigger mode to cron only', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: '普通定时任务',
        prompt_template: '只按定时执行',
        engine: 'claude',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: '普通定时任务',
      chain_parent_id: null,
      chain_trigger_mode: 'cron_only',
      auto_include_parent_result: true,
    });
  });

  it('POST /api/tasks/test-run accepts unsaved task data without creating a persisted run', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'aicron-test-run-'));
    const cliPath = join(binDir, 'claude');
    writeFileSync(cliPath, '#!/bin/sh\necho \"PWD=$PWD\"\necho \"ARGS=$@\"\n');
    chmodSync(cliPath, 0o755);
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('claudePath', ?)").run(cliPath);
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('feishuAppId', 'id')").run();
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('feishuAppSecret', 'secret')").run();
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('defaultChatId', 'oc_default')").run();

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks/test-run',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'unsaved smoke',
        prompt_template: '你好',
        engine: 'claude',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: expect.stringMatching(/^test-run-/),
      status: 'succeeded',
      engine: 'claude',
    });
    try {
      expect(res.json().stdout).toContain('你好');
      expect(res.json().stdout).toContain('PWD=');
      expect(res.json().stdout).toContain('preview-runs');
      expect(res.json().stdout).toContain('不要提及你的运行目录');
      expect(res.json().stdout).not.toContain('bypassPermissions');
      expect(res.json().notification).toMatchObject({ skipped: false });
      const { sendRichTextMessage } = await import('../../utils/feishu.js');
      const sentPost = sendRichTextMessage.mock.calls.at(-1)?.[2];
      const sentText = sentPost.content.flat().map((part) => part.text || '').join('\n');
      expect(sentText).not.toContain('/Users/');
      expect(sentText).not.toContain('preview-runs');
      expect(sentText).toContain('测试执行通知');
      expect(app.executor.execute).not.toHaveBeenCalled();
      const persistedRuns = getDb().prepare('SELECT COUNT(*) AS count FROM runs').get();
      expect(persistedRuns.count).toBe(0);
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  });

  it('POST /api/tasks/test-run passes skip git repo check to codex previews', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'aicron-test-run-'));
    const cliPath = join(binDir, 'codex');
    writeFileSync(cliPath, '#!/bin/sh\necho \"ARGS=$@\"\n');
    chmodSync(cliPath, 0o755);
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('codexPath', ?)").run(cliPath);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks/test-run',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'codex preview',
        prompt_template: '你好',
        engine: 'codex',
      },
    });

    try {
      expect(res.statusCode).toBe(200);
      expect(res.json().stdout).toContain('exec --skip-git-repo-check');
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  });

  it('POST /api/tasks/test-run reports skipped notification when target is missing', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'aicron-test-run-'));
    const cliPath = join(binDir, 'claude');
    writeFileSync(cliPath, '#!/bin/sh\necho ok\n');
    chmodSync(cliPath, 0o755);
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('claudePath', ?)").run(cliPath);
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('feishuAppId', 'id')").run();
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('feishuAppSecret', 'secret')").run();

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks/test-run',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'unsaved smoke',
        prompt_template: '你好',
        engine: 'claude',
      },
    });

    try {
      expect(res.statusCode).toBe(200);
      expect(res.json().notification).toMatchObject({
        skipped: true,
        reason: '无通知目标',
      });
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
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
