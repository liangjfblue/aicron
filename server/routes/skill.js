import { TaskService } from '../services/task.js';
import { scheduleTask } from '../services/scheduler.js';

export async function skillRoutes(app) {
  // Execute natural language command
  app.post('/api/skill/execute', async (request, reply) => {
    const { token, command } = request.body;
    if (!token || !command) return reply.code(400).send({ error: '需要 token 和 command' });

    // Verify skill token
    const row = app.db.prepare("SELECT value FROM settings WHERE key = 'skill_token'").get();
    if (!row || row.value !== token) return reply.code(401).send({ error: '无效的 Skill Token' });

    // Use Claude CLI for intent recognition
    const taskSvc = new TaskService(app.db);
    const tasks = taskSvc.list();
    const taskList = tasks.map(t => `- ${t.name} (id: ${t.id}, enabled: ${!!t.enabled}, engine: ${t.engine})`).join('\n');

    const { spawn } = await import('node:child_process');
    const intentResult = await new Promise((resolve) => {
      const systemPrompt = `你是一个任务管理助手。根据用户指令返回 JSON 操作。

可用任务列表：
${taskList}

用户指令：${command}

返回 JSON 格式：{"action":"toggle|run|status|list","taskId":"id或null","params":{}}
只返回 JSON，不要其他内容。`;
      const child = spawn('claude', ['--prompt', systemPrompt], { timeout: 30000 });
      let out = '';
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.on('close', () => resolve(out.trim()));
      child.on('error', () => resolve('{"action":"status"}'));
    });

    try {
      const jsonMatch = intentResult.match(/\{[\s\S]*\}/);
      const intent = jsonMatch ? JSON.parse(jsonMatch[0]) : { action: 'status' };

      if (intent.action === 'toggle' && intent.taskId) {
        const task = taskSvc.toggle(intent.taskId, intent.params?.enabled ?? false);
        scheduleTask(app.scheduler, task);
        return { success: true, action: 'toggle', task: { id: task.id, name: task.name, enabled: !!task.enabled } };
      }
      if (intent.action === 'run' && intent.taskId) {
        const task = taskSvc.getById(intent.taskId);
        if (!task) return { success: false, error: '任务不存在' };
        app.executor.execute(task, { triggerType: 'manual' }).catch(() => {});
        return { success: true, action: 'run', message: `任务 "${task.name}" 已触发执行` };
      }
      // Default: return status
      return { success: true, action: 'status', tasks: tasks.map(t => ({ id: t.id, name: t.name, enabled: !!t.enabled, engine: t.engine })) };
    } catch {
      return { success: false, error: '无法解析指令', raw: intentResult };
    }
  });

  // Get global status
  app.get('/api/skill/status', async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return reply.code(401).send({ error: '未授权' });
    const row = app.db.prepare("SELECT value FROM settings WHERE key = 'skill_token'").get();
    if (!row || row.value !== auth.slice(7)) return reply.code(401).send({ error: '无效 Token' });

    const taskSvc = new TaskService(app.db);
    const { RunService } = await import('../services/run.js');
    const runSvc = new RunService(app.db);
    const tasks = taskSvc.list();
    return {
      totalTasks: tasks.length,
      enabledTasks: tasks.filter(t => t.enabled).length,
      tasks: tasks.map(t => {
        const lastRun = runSvc.getLatestSuccess(t.id);
        return {
          id: t.id, name: t.name, enabled: !!t.enabled, engine: t.engine,
          lastRunTime: lastRun?.started_at || null,
        };
      }),
    };
  });
}
