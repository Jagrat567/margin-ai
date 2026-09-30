import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { config, readiness } from './config.js';
import { AppError, validateChat, type Services } from './domain.js';

export function createApp(services: Services, options: { ready?: typeof readiness; secret?: string; rateLimits?: boolean } = {}) {
  const app = express();
  const ready = options.ready || readiness;
  const activeSessions = new Set<string>();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use(helmet({ contentSecurityPolicy: config.production ? { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"], fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] } } : false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.get('origin');
      if ((origin && origin !== config.origin) || req.get('sec-fetch-site') === 'cross-site') return next(new AppError(403, 'This request came from a different site.'));
    }
    next();
  });
  if (options.rateLimits !== false) app.use('/api', rateLimit({ windowMs: 60000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Please wait a minute.' } }));
  app.use(express.json({ limit: '80kb' }));
  app.use(cookieParser(options.secret || config.secret));
  app.use('/api', (req, res, next) => {
    let token = req.signedCookies.margin_session;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      token = randomBytes(32).toString('hex');
      res.cookie('margin_session', token, { httpOnly: true, signed: true, sameSite: 'strict', secure: config.production, maxAge: 86400000, path: '/' });
    }
    res.locals.session = createHash('sha256').update(token).digest('hex'); next();
  });
  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.get('/api/status', (_req, res) => { res.json(ready()); });
  const chatLimit = rateLimit({ windowMs: 60000, limit: 12, message: { error: 'Take a moment, then ask your next question.' }, skip: () => options.rateLimits === false });
  app.post('/api/chat', chatLimit, async (req, res) => {
    if (!ready().chatReady) throw new AppError(503, 'Add your Groq API key to enable AI answers.');
    const { message, history } = validateChat(req.body);
    if (activeSessions.has(res.locals.session)) throw new AppError(409, 'Wait for the current operation to finish.');
    activeSessions.add(res.locals.session);
    const controller = new AbortController();
    const streaming = req.get('accept')?.includes('text/event-stream');
    const disconnected = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnected);
    try {
      if (controller.signal.aborted) return;
      if (!streaming) { res.json(await services.answer(message, history, controller.signal)); return; }
      res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15000);
      try {
        if (services.streamAnswer) {
          for await (const event of services.streamAnswer(message, history, controller.signal)) {
            if (controller.signal.aborted || res.destroyed) break;
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        } else {
          const result = await services.answer(message, history, controller.signal);
          if (!res.destroyed) res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
        }
      } catch (e) {
        if (!controller.signal.aborted && !res.destroyed) res.write(`data: ${JSON.stringify({ type: 'error', message: e instanceof AppError ? e.message : 'The answer was interrupted. Please try again.' })}\n\n`);
      } finally { clearInterval(heartbeat); if (!res.destroyed) res.end(); }
    } finally { res.off('close', disconnected); activeSessions.delete(res.locals.session); }
  });
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Unknown API endpoint.')));
  app.use(express.static(path.resolve('dist')));
  app.get('/{*path}', (_req, res, next) => res.sendFile(path.resolve('dist/index.html'), e => { if (e) next(new AppError(404, 'Frontend not built. Run npm run dev, or npm run build first.')); }));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof AppError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: 'Invalid request body.' }); return; }
    res.status(500).json({ error: 'Something went wrong. Please try again or check the server configuration.' });
    console.error('Request failed:', error instanceof Error ? error.name : 'Unknown error');
  };
  app.use(errors);
  return app;
}
