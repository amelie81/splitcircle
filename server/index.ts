import { serve } from '@hono/node-server';
import { env } from './env.js';
import { app } from './app.js';

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[splitcircle] backend on http://localhost:${info.port}`);
});
