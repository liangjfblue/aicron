import { verifyToken } from '../utils/jwt.js';

export async function authPlugin(app) {
  app.decorate('authenticate', async function (request, reply) {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return reply.code(401).send({ error: '未登录' });
    }
    try {
      request.user = verifyToken(auth.slice(7));
    } catch {
      return reply.code(401).send({ error: '登录已过期' });
    }
  });
}
