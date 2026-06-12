import { TaskService } from '../services/task.js';
import { resolveVariables } from '../services/variable.js';
import { ImportAnalyzer } from '../services/import-analyzer.js';
import { scheduleTask } from '../services/scheduler.js';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildCliSpawnEnv, resolveCommandPath } from '../utils/cli-path.js';
import { config } from '../config.js';
import { NotifyService } from '../services/notify.js';

const taskSchema = {
  body: {
    type: 'object',
    required: ['name', 'prompt_template', 'engine'],
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      prompt_template: { type: 'string' },
      engine: { type: 'string', enum: ['claude', 'codex'] },
      cron_expression: { type: 'string' },
      active_start_at: { type: 'string', nullable: true },
      active_end_at: { type: 'string', nullable: true },
      schedule_segments: { type: 'string' },
      timeout_seconds: { type: 'number', nullable: true },
      chain_parent_id: { type: 'string', nullable: true },
      auto_include_last_result: { type: 'boolean' },
      feishu_mode: { type: 'string', enum: ['full', 'summary'] },
      feishu_chat_ids: { type: 'string' },
      notify_on_change: { type: 'boolean' },
      tags: { type: 'string' },
    },
  },
};

function getPreviewCliArgs(engine, prompt) {
  return engine === 'codex'
    ? ['exec', prompt]
    : ['-p', prompt];
}

function getPreviewCliPath(app, engine) {
  const envPath = engine === 'codex' ? process.env.CODEX_CLI_PATH : process.env.CLAUDE_CLI_PATH;
  if (envPath) return envPath;
  const settingsKey = engine === 'codex' ? 'codexPath' : 'claudePath';
  const row = app.db.prepare('SELECT value FROM settings WHERE key = ?').get(settingsKey);
  const settingsPath = row?.value?.trim();
  return settingsPath || engine;
}

function executePreview(app, taskData) {
  const cliEnv = buildCliSpawnEnv();
  const cliPath = resolveCommandPath(getPreviewCliPath(app, taskData.engine), cliEnv.PATH);
  const args = getPreviewCliArgs(taskData.engine, taskData.prompt_template);
  const timeoutMs = (taskData.timeout_seconds || 60) * 1000;
  const cwd = join(config.DATA_DIR, 'preview-runs');
  mkdirSync(cwd, { recursive: true });

  return new Promise((resolve) => {
    const child = spawn(cliPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: cliEnv,
      cwd,
    });
    let stdout = '';
    let stderr = '';
    let finished = false;
    const finish = (status, exitCode, error = null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        id: `test-run-${randomUUID()}`,
        task_id: taskData.id,
        status,
        engine: taskData.engine,
        stdout,
        stderr: error ? `${stderr}${stderr ? '\n' : ''}${error.message}` : stderr,
        exit_code: exitCode,
        output: stdout || stderr || error?.message || '',
      });
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish('timeout', null, new Error('测试执行超时'));
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => finish(code === 0 ? 'succeeded' : 'failed', code));
    child.on('error', (err) => finish('failed', 1, err));
  });
}

async function notifyPreview(app, taskData, run) {
  const rows = app.db.prepare('SELECT * FROM settings').all();
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  if (!settings.feishuAppId || !settings.feishuAppSecret) {
    return { skipped: true, reason: '未配置飞书应用' };
  }
  try {
    const notifySvc = new NotifyService(app.db);
    const result = await notifySvc.notify(taskData, run, settings);
    return result?.skipped
      ? { skipped: true, reason: result.reason || '通知已跳过' }
      : { skipped: false, level: result?.level || 'inline' };
  } catch (err) {
    return { skipped: true, reason: err.message || '通知发送失败', error: true };
  }
}

export async function taskRoutes(app) {
  const svc = () => new TaskService(app.db);
  const analyzer = () => app.importAnalyzer || new ImportAnalyzer(app.db);

  // ── CRUD routes ──────────────────────────────────────────────

  app.post('/api/tasks', { preHandler: [app.authenticate], schema: taskSchema }, async (request, reply) => {
    const task = svc().create(request.body);
    scheduleTask(app.scheduler, task);
    return reply.code(201).send(task);
  });

  app.get('/api/tasks', { preHandler: [app.authenticate] }, async (request) => {
    const { enabled, tag, engine } = request.query;
    const filters = {};
    if (enabled !== undefined) filters.enabled = enabled === 'true' || enabled === true;
    if (tag) filters.tag = tag;
    if (engine) filters.engine = engine;
    return svc().list(filters);
  });

  app.get('/api/tasks/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const task = svc().getById(request.params.id);
    if (!task) return reply.code(404).send({ error: '任务不存在' });
    return task;
  });

  app.put('/api/tasks/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const existing = svc().getById(request.params.id);
    if (!existing) return reply.code(404).send({ error: '任务不存在' });
    const updated = svc().update(request.params.id, request.body);
    scheduleTask(app.scheduler, updated);
    return updated;
  });

  app.delete('/api/tasks/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    app.scheduler.removeJob(request.params.id);
    svc().delete(request.params.id);
    return reply.code(204).send();
  });

  app.patch('/api/tasks/:id/toggle', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { enabled } = request.body;
    if (typeof enabled !== 'boolean') {
      return reply.code(400).send({ error: 'enabled 必须是布尔值' });
    }
    const toggled = svc().toggle(request.params.id, enabled);
    if (!toggled) return reply.code(404).send({ error: '任务不存在' });
    scheduleTask(app.scheduler, toggled);
    return toggled;
  });

  app.post('/api/tasks/import/analyze', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { text } = request.body || {};
      const draft = await analyzer().analyze(text);
      return draft;
    } catch (err) {
      const payload = { error: err.message };
      if (err.code === 'AI_IMPORT_PARSE_ERROR') {
        payload.code = err.code;
        payload.parse_message = err.parseMessage;
        payload.raw_output = err.rawOutput;
      }
      return reply.code(400).send(payload);
    }
  });

  app.post('/api/tasks/import/cron', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { text } = request.body || {};
      const draft = await analyzer().analyzeCron(text);
      return draft;
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // ── Execution routes ─────────────────────────────────────────

  // Manual trigger
  app.post('/api/tasks/:id/run', { preHandler: [app.authenticate] }, async (request, reply) => {
    const task = svc().getById(request.params.id);
    if (!task) return reply.code(404).send({ error: '任务不存在' });
    const { run, promise } = app.executor.executeAsync(task, { triggerType: 'manual' });
    promise.catch((err) => request.log.error({ err, runId: run.id }, 'Manual run failed'));
    return reply.code(202).send(run);
  });

  // Test run (no save)
  app.post('/api/tasks/test-run', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const taskData = {
        ...request.body,
        id: request.body?.id || `test-${randomUUID()}`,
        name: request.body?.name || '测试执行',
        prompt_template: request.body?.prompt_template || request.body?.prompt || '',
        engine: request.body?.engine || 'claude',
      };
      if (!taskData.prompt_template.trim()) {
        return reply.code(400).send({ error: '请输入 Agent 任务模板' });
      }
      const run = await executePreview(app, taskData);
      const notification = await notifyPreview(app, taskData, run);
      return { ...run, notification };
    } catch (err) {
      request.log.error({ err }, 'Test run failed');
      return reply.code(400).send({ error: err.message || '测试执行失败' });
    }
  });

  // Dry run (resolve variables only)
  app.post('/api/tasks/:id/dry-run', { preHandler: [app.authenticate] }, async (request, reply) => {
    const task = svc().getById(request.params.id);
    if (!task) return reply.code(404).send({ error: '任务不存在' });
    const resolved = resolveVariables(task.prompt_template, task, { now: new Date(), runId: 'dry-run' });
    return { resolved_prompt: resolved };
  });

  // Cancel running task
  app.post('/api/tasks/:id/runs/:runId/cancel', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      app.executor.cancel(request.params.runId);
      return { success: true };
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });
}
