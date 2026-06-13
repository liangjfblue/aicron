import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { getDb, closeDb } from '../../db/index.js';
import { bootstrapRoutes } from '../../routes/bootstrap.js';
import { AuthService } from '../../services/auth.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('db', getDb());
  app.register(bootstrapRoutes);
  await app.ready();
  return app;
}

describe('Bootstrap Routes', () => {
  let app, db;

  beforeEach(async () => {
    app = await buildApp();
    db = getDb();
    db.prepare('DELETE FROM settings').run();
    db.prepare('DELETE FROM users').run();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  it('reports onboarding is needed when no user exists', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/bootstrap/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      needsOnboarding: true,
      hasUser: false,
      onboardingCompleted: false,
    });
  });

  it('detects CLI engine paths without authentication during onboarding', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/bootstrap/detect-engines' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      claude: expect.objectContaining({
        command: 'claude',
        displayPath: expect.any(String),
        source: expect.any(String),
      }),
      codex: expect.objectContaining({
        command: 'codex',
        displayPath: expect.any(String),
        source: expect.any(String),
      }),
    });
  });

  it('creates the first user, saves setup settings, and returns a login token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bootstrap/complete',
      payload: {
        username: 'owner',
        password: 'secret123',
        claudePath: '/bin/claude',
        codexPath: '/bin/codex',
        feishuAppId: 'cli_x',
        feishuAppSecret: 'secret',
        defaultChatId: 'oc_x',
        startMinimizedToTray: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeDefined();
    expect(db.prepare('SELECT username FROM users').get().username).toBe('owner');
    expect(db.prepare("SELECT value FROM settings WHERE key = 'claudePath'").get().value).toBe('/bin/claude');
    expect(db.prepare("SELECT value FROM settings WHERE key = 'startMinimizedToTray'").get().value).toBe('true');
    expect(db.prepare("SELECT value FROM settings WHERE key = 'onboardingCompleted'").get().value).toBe('true');
  });

  it('does not allow bootstrapping again after a user exists', async () => {
    const authSvc = new AuthService(db);
    await authSvc.createUser('existing', 'secret123');

    const res = await app.inject({
      method: 'POST',
      url: '/api/bootstrap/complete',
      payload: { username: 'other', password: 'secret123' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('requires a valid first account password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bootstrap/complete',
      payload: { username: 'owner', password: '123' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('密码至少 6 位');
  });
});
