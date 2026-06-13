import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../../services/auth.js';
import { createApp } from '../../index.js';
import { getDb, closeDb } from '../../db/index.js';

describe('Settings Routes', () => {
  let app;
  let oldClaudePath;

  beforeEach(async () => {
    oldClaudePath = process.env.CLAUDE_CLI_PATH;
    delete process.env.CLAUDE_CLI_PATH;
    app = await createApp({ logger: false });
    getDb().prepare('DELETE FROM settings').run();
    getDb().prepare('DELETE FROM users').run();
    const svc = new AuthService(getDb());
    await svc.createUser('settinguser', 'testpass');
  });

  afterEach(async () => {
    await app.close();
    closeDb();
    if (oldClaudePath === undefined) delete process.env.CLAUDE_CLI_PATH;
    else process.env.CLAUDE_CLI_PATH = oldClaudePath;
  });

  async function login() {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'settinguser', password: 'testpass' },
    });
    return res.json().token;
  }

  it('detects CLI engine paths for display in settings', async () => {
    const token = await login();

    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/detect-engines',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      claude: expect.objectContaining({
        command: 'claude',
        configuredPath: '',
        resolvedPath: expect.any(String),
        displayPath: expect.any(String),
        source: expect.any(String),
      }),
      codex: expect.objectContaining({
        command: 'codex',
        configuredPath: '',
        resolvedPath: expect.any(String),
        displayPath: expect.any(String),
        source: expect.any(String),
      }),
    });
  });

  it('keeps configured CLI paths as the displayed paths', async () => {
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('claudePath', ?)").run('/custom/bin/claude');
    const token = await login();

    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/detect-engines',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().claude).toMatchObject({
      command: 'claude',
      configuredPath: '/custom/bin/claude',
      displayPath: '/custom/bin/claude',
      source: 'configured',
    });
  });

  it('shows CLI paths provided by the desktop environment', async () => {
    process.env.CLAUDE_CLI_PATH = '/desktop/env/claude';
    const token = await login();

    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/detect-engines',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().claude).toMatchObject({
      configuredPath: '/desktop/env/claude',
      displayPath: '/desktop/env/claude',
      source: 'environment',
    });
  });

  it('fills missing CLI paths in settings response for display', async () => {
    process.env.CLAUDE_CLI_PATH = '/desktop/env/claude';
    const token = await login();

    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().claudePath).toBe('/desktop/env/claude');
  });

  it('exposes only desktop startup display settings without auth', async () => {
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('startMinimizedToTray', 'true')").run();
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('feishuAppSecret', 'secret-value')").run();

    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/public-desktop',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ startMinimizedToTray: 'true' });
  });

  it('stores the Skill token under the key used by the Skill API', async () => {
    const token = await login();
    const skillToken = 'sk-aicron-test-token';

    const save = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { skillToken },
    });
    expect(save.statusCode).toBe(200);

    const status = await app.inject({
      method: 'GET',
      url: '/api/skill/status',
      headers: { authorization: `Bearer ${skillToken}` },
    });

    expect(status.statusCode).toBe(200);
  });
});
