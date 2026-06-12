import { RunService } from '../services/run.js';
import { deleteResult, readResult } from '../utils/result-store.js';
import { computeDiff } from '../utils/diff.js';

export async function runRoutes(app) {
  app.get('/api/runs', { preHandler: [app.authenticate] }, async () => {
    const svc = new RunService(app.db);
    return svc.listAll();
  });

  app.get('/api/runs/compare', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { runId1, runId2 } = request.query;
    if (!runId1 || !runId2) return reply.code(400).send({ error: '需要 runId1 和 runId2 参数' });
    const svc = new RunService(app.db);
    const r1 = svc.getById(runId1);
    const r2 = svc.getById(runId2);
    if (!r1 || !r2) return reply.code(404).send({ error: 'Run 不存在' });
    const t1 = readResult(r1.result_path) || '';
    const t2 = readResult(r2.result_path) || '';
    return { diff: computeDiff(t1, t2) };
  });

  app.get('/api/tasks/:id/runs', { preHandler: [app.authenticate] }, async (request) => {
    const svc = new RunService(app.db);
    return svc.listByTask(request.params.id);
  });

  app.get('/api/runs/:runId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const svc = new RunService(app.db);
    const run = svc.getById(request.params.runId);
    if (!run) return reply.code(404).send({ error: 'Run 不存在' });
    return run;
  });

  app.get('/api/runs/:runId/result', { preHandler: [app.authenticate] }, async (request, reply) => {
    const svc = new RunService(app.db);
    const run = svc.getById(request.params.runId);
    if (!run?.result_path) return reply.code(404).send({ error: '无结果文件' });
    const content = readResult(run.result_path);
    if (!content) return reply.code(404).send({ error: '文件不存在' });
    return reply.type('text/markdown').send(content);
  });

  app.delete('/api/runs/:runId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const svc = new RunService(app.db);
    const run = svc.getById(request.params.runId);
    if (!run) return reply.code(404).send({ error: 'Run 不存在' });
    if (run.status === 'running') return reply.code(400).send({ error: '运行中的记录不能删除，请等待结束后再删' });

    const deleted = svc.delete(request.params.runId);
    deleteResult(deleted?.result_path);
    return reply.code(204).send();
  });

}
