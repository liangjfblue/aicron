import Fastify from 'fastify';
import { getDb, closeDb } from '../db/index.js';
import { authPlugin } from '../plugins/auth.js';
import { authRoutes } from '../routes/auth.js';

export async function buildApp() {
  const app = Fastify();
  app.decorate('db', getDb());
  app.decorate('authenticate', null);
  app.register(authPlugin);
  app.register(authRoutes);
  await app.ready();
  return app;
}
