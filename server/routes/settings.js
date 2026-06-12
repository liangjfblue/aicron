export async function settingsRoutes(app) {
  function detectEngineForSettings(settings, engine) {
    const key = engine === 'codex' ? 'codexPath' : 'claudePath';
    const envKey = engine === 'codex' ? 'CODEX_CLI_PATH' : 'CLAUDE_CLI_PATH';
    const configuredPath = settings[key] || process.env[envKey];
    const source = settings[key] ? 'configured' : process.env[envKey] ? 'environment' : null;
    return { key, configuredPath, source };
  }

  app.get('/api/settings', { preHandler: [app.authenticate] }, async () => {
    const { detectCliCommand } = await import('../utils/cli-path.js');
    const rows = app.db.prepare('SELECT * FROM settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    for (const engine of ['claude', 'codex']) {
      const { key, configuredPath, source } = detectEngineForSettings(settings, engine);
      const detected = detectCliCommand(engine, configuredPath, process.env, source);
      if (!settings[key] && detected.displayPath) settings[key] = detected.displayPath;
    }
    return settings;
  });

  app.get('/api/settings/detect-engines', { preHandler: [app.authenticate] }, async () => {
    const { detectCliCommand } = await import('../utils/cli-path.js');
    const rows = app.db.prepare("SELECT key, value FROM settings WHERE key IN ('claudePath', 'codexPath')").all();
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const claude = detectEngineForSettings(settings, 'claude');
    const codex = detectEngineForSettings(settings, 'codex');
    return {
      claude: detectCliCommand('claude', claude.configuredPath, process.env, claude.source),
      codex: detectCliCommand('codex', codex.configuredPath, process.env, codex.source),
    };
  });

  app.get('/api/settings/public-desktop', async () => {
    const row = app.db.prepare("SELECT value FROM settings WHERE key = 'startMinimizedToTray'").get();
    return { startMinimizedToTray: row?.value || 'false' };
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
