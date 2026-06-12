import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers.js';
import { AuthService } from '../../services/auth.js';
import { getDb, closeDb } from '../../db/index.js';

describe('Auth Routes', () => {
  let app;
  beforeEach(async () => {
    app = await buildApp();
    getDb().prepare('DELETE FROM users').run();
    const svc = new AuthService(getDb());
    await svc.createUser('testuser', 'testpass');
  });
  afterEach(async () => { await app.close(); closeDb(); });

  it('POST /login returns token on success', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'testuser', password: 'testpass' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeDefined();
  });

  it('POST /login rejects bad password', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'testuser', password: 'wrong' } });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me returns user with valid token', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'testuser', password: 'testpass' } });
    const token = login.json().token;
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.username).toBe('testuser');
  });

  it('GET /me rejects without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });
});
