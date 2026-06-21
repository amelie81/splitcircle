import { getRequestListener } from '@hono/node-server';
import { app } from '../server/app.js';

export const config = { runtime: 'nodejs' };

// Vercel's Node runtime invokes a (req, res) handler. getRequestListener adapts
// the Hono app's web-standard fetch into exactly that signature.
export default getRequestListener(app.fetch);
