export async function settingsRoutes(app) {
  app.get('/api/settings', { preHandler: [app.authenticate] }, async () => {
    const rows = app.db.prepare('SELECT * FROM settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    return settings;
  });

  app.get('/api/settings/detect-engines', { preHandler: [app.authenticate] }, async () => {
    const { detectCliCommand } = await import('../utils/cli-path.js');
    const rows = app.db.prepare("SELECT key, value FROM settings WHERE key IN ('claudePath', 'codexPath')").all();
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const claudePath = settings.claudePath || process.env.CLAUDE_CLI_PATH;
    const codexPath = settings.codexPath || process.env.CODEX_CLI_PATH;
    return {
      claude: detectCliCommand('claude', claudePath, process.env, settings.claudePath ? 'configured' : process.env.CLAUDE_CLI_PATH ? 'environment' : null),
      codex: detectCliCommand('codex', codexPath, process.env, settings.codexPath ? 'configured' : process.env.CODEX_CLI_PATH ? 'environment' : null),
    };
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
    const { buildCliSpawnEnv, resolveCommandPath } = await import('../utils/cli-path.js');
    return new Promise((resolve) => {
      const cliEnv = buildCliSpawnEnv();
      const resolvedPath = resolveCommandPath(cliPath, cliEnv.PATH);
      const child = spawn(resolvedPath, ['--version'], {
        timeout: 5000,
        env: cliEnv,
      });
      let out = '';
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr.on('data', (d) => { out += d.toString(); });
      child.on('close', (code) => resolve({ success: code === 0, output: out.trim(), resolvedPath }));
      child.on('error', (err) => resolve({ success: false, output: err.message, resolvedPath }));
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
