import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../../db/index.js';
import { AuthService } from '../../services/auth.js';

describe('AuthService', () => {
  beforeEach(() => {
    getDb().prepare('DELETE FROM users').run();
  });
  afterEach(() => { closeDb(); });

  it('should create user and login', async () => {
    const svc = new AuthService(getDb());
    await svc.createUser('admin', 'password123');
    const result = await svc.login('admin', 'password123');
    expect(result.token).toBeDefined();
    expect(result.user.username).toBe('admin');
  });

  it('should reject wrong password', async () => {
    const svc = new AuthService(getDb());
    await svc.createUser('admin2', 'password123');
    await expect(svc.login('admin2', 'wrong')).rejects.toThrow('用户名或密码错误');
  });

  it('should reject non-existent user', async () => {
    const svc = new AuthService(getDb());
    await expect(svc.login('nobody', 'x')).rejects.toThrow('用户名或密码错误');
  });

  it('should verify a valid token', async () => {
    const svc = new AuthService(getDb());
    await svc.createUser('admin3', 'pass');
    const { token } = await svc.login('admin3', 'pass');
    const payload = svc.verifyToken(token);
    expect(payload.username).toBe('admin3');
  });
});
