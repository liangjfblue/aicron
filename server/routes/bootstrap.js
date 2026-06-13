import { AuthService } from '../services/auth.js';

const SETTING_KEY_ALIASES = {
  skillToken: 'skill_token',
};

function normalizeSettingKey(key) {
  return SETTING_KEY_ALIASES[key] || key;
}

function getUserCount(db) {
  return db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
}

export async function bootstrapRoutes(app) {
  function detectEngineForBootstrap(engine) {
    const envKey = engine === 'codex' ? 'CODEX_CLI_PATH' : 'CLAUDE_CLI_PATH';
    const configuredPath = process.env[envKey] || '';
    const source = configuredPath ? 'environment' : null;
    return { configuredPath, source };
  }

  app.get('/api/bootstrap/status', async () => {
    const userCount = getUserCount(app.db);
    const onboardingRow = app.db.prepare("SELECT value FROM settings WHERE key = 'onboardingCompleted'").get();
    const settingsRows = app.db.prepare("SELECT key, value FROM settings WHERE key IN ('claudePath', 'codexPath', 'feishuAppId', 'defaultChatId')").all();
    const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
    return {
      needsOnboarding: userCount === 0,
      hasUser: userCount > 0,
      onboardingCompleted: onboardingRow?.value === 'true' || userCount > 0,
      hasClaudePath: Boolean(settings.claudePath),
      hasCodexPath: Boolean(settings.codexPath),
      hasFeishu: Boolean(settings.feishuAppId && settings.defaultChatId),
    };
  });

  app.get('/api/bootstrap/detect-engines', async () => {
    const { detectCliCommand } = await import('../utils/cli-path.js');
    const claude = detectEngineForBootstrap('claude');
    const codex = detectEngineForBootstrap('codex');
    return {
      claude: detectCliCommand('claude', claude.configuredPath, process.env, claude.source),
      codex: detectCliCommand('codex', codex.configuredPath, process.env, codex.source),
    };
  });

  app.post('/api/bootstrap/complete', async (request, reply) => {
    if (getUserCount(app.db) > 0) {
      return reply.code(409).send({ error: '已经完成初始化' });
    }

    const body = request.body || {};
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username || !password) {
      return reply.code(400).send({ error: '用户名和密码不能为空' });
    }
    if (password.length < 6) {
      return reply.code(400).send({ error: '密码至少 6 位' });
    }

    const authSvc = new AuthService(app.db);
    await authSvc.createUser(username, password);

    const allowedSettings = [
      'claudePath',
      'codexPath',
      'feishuAppId',
      'feishuAppSecret',
      'defaultChatId',
      'startMinimizedToTray',
    ];
    const stmt = app.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const key of allowedSettings) {
      const value = body[key];
      if (value === undefined || value === null || value === '') continue;
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
      stmt.run(normalizeSettingKey(key), String(value));
    }
    stmt.run('onboardingCompleted', 'true');

    const login = await authSvc.login(username, password);
    return login;
  });
}
