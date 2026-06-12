export async function settingsRoutes(app) {
  app.get('/api/settings', { preHandler: [app.authenticate] }, async () => {
    const rows = app.db.prepare('SELECT * FROM settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    return settings;
  });

  app.put('/api/settings', { preHandler: [app.authenticate] }, async (request) => {
    const stmt = app.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(request.body)) {
      // Skip non-string values (nested objects, arrays) — only save flat key-value pairs
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
      stmt.run(key, String(value));
    }
    return { success: true };
  });

  app.post('/api/settings/test-engine', { preHandler: [app.authenticate] }, async (request) => {
    const { path: cliPath } = request.body;
    if (!cliPath) return { success: false, output: '请提供 CLI 路径' };
    const { spawn } = await import('node:child_process');
    return new Promise((resolve) => {
      const child = spawn(cliPath, ['--version'], { timeout: 5000 });
      let out = '';
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr.on('data', (d) => { out += d.toString(); });
      child.on('close', (code) => resolve({ success: code === 0, output: out.trim() }));
      child.on('error', (err) => resolve({ success: false, output: err.message }));
    });
  });

  app.post('/api/settings/test-feishu', { preHandler: [app.authenticate] }, async (request) => {
    const { appId, appSecret } = request.body || {};
    if (!appId || !appSecret) return { success: false, message: '请提供 App ID 和 Secret' };
    try {
      const { getAppToken } = await import('../utils/feishu.js');
      await getAppToken(appId, appSecret);
      return { success: true, message: '飞书连接成功' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });
}
