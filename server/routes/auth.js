import { AuthService } from '../services/auth.js';
import { verifyToken } from '../utils/jwt.js';

async function authenticate(request, reply) {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return reply.code(401).send({ error: '未登录' });
  }
  try {
    request.user = verifyToken(auth.slice(7));
  } catch {
    return reply.code(401).send({ error: '登录已过期' });
  }
}

export async function authRoutes(app) {
  app.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body;
    if (!username || !password) return reply.code(400).send({ error: '用户名和密码不能为空' });
    const svc = new AuthService(app.db);
    try {
      const result = await svc.login(username, password);
      return result;
    } catch (err) {
      return reply.code(401).send({ error: err.message });
    }
  });

  app.get('/api/auth/me', { preHandler: [authenticate] }, async (request) => {
    return { user: request.user };
  });
}
