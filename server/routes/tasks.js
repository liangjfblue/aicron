import { TaskService } from '../services/task.js';
import { resolveVariables } from '../services/variable.js';
import { ImportAnalyzer } from '../services/import-analyzer.js';
import { scheduleTask } from '../services/scheduler.js';

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
  app.post('/api/tasks/test-run', { preHandler: [app.authenticate] }, async (request) => {
    const taskData = request.body;
    const run = await app.executor.execute(taskData, { triggerType: 'test' });
    return run;
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
