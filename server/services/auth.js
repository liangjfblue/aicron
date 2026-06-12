import bcrypt from 'bcryptjs';
import { signToken, verifyToken } from '../utils/jwt.js';

export class AuthService {
  constructor(db) { this.db = db; }

  async createUser(username, password) {
    const existing = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) throw new Error('用户名已存在');
    const hash = await bcrypt.hash(password, 10);
    this.db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    return { username };
  }

  async login(username, password) {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!row) throw new Error('用户名或密码错误');
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) throw new Error('用户名或密码错误');
    const token = signToken({ id: row.id, username: row.username });
    return { token, user: { id: row.id, username: row.username } };
  }

  verifyToken(token) {
    return verifyToken(token);
  }
}
