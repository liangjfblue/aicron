import { resolveVariables } from '../services/variable.js';

export async function promptRoutes(app) {
  // Resolve template variables without executing
  app.post('/api/prompt/resolve', { preHandler: [app.authenticate] }, async (request) => {
    const { prompt_template, task } = request.body;
    if (!prompt_template) return { error: '缺少 prompt_template' };
    const resolved = resolveVariables(prompt_template, task || { name: '', description: '' }, { now: new Date() });
    return { resolved_prompt: resolved };
  });

  // Optimize prompt using Claude CLI
  app.post('/api/prompt/optimize', { preHandler: [app.authenticate] }, async (request) => {
    const { prompt } = request.body;
    if (!prompt) return { error: '缺少 prompt' };
    const { spawn } = await import('node:child_process');
    const { buildCliSpawnEnv, resolveCommandPath } = await import('../utils/cli-path.js');
    return new Promise((resolve) => {
      const optimizeInstruction = `请优化以下 prompt，使其更清晰、更有效地完成目标。只返回优化后的 prompt，不要任何解释：\n\n${prompt}`;
      const cliEnv = buildCliSpawnEnv();
      const child = spawn(resolveCommandPath('claude', cliEnv.PATH), ['--prompt', optimizeInstruction], {
        timeout: 30000,
        env: cliEnv,
      });
      let out = '';
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.on('close', () => resolve({ optimized: out.trim() || prompt }));
      child.on('error', () => resolve({ optimized: prompt, error: '优化失败' }));
    });
  });
}
