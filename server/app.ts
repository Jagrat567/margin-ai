import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { config, readiness } from './config.js';
import { AppError, publicDocument, validateChat, type Services, type StoredDocument } from './domain.js';

export function createApp(services: Services, options: { ready?: typeof readiness; secret?: string; rateLimits?: boolean } = {}) {
  const app = express();
  const ready = options.ready || readiness;
  const activeSessions = new Set<string>();
  let processingCount = 0;
  app.disable('x-powered-by');
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
  app.get('/api/status', async (_req, res) => {
    const state = ready();
    const document = state.pdfReady ? await services.latest(res.locals.session) : null;
    res.json({ ...state, document: publicDocument(document) });
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 }, fileFilter: (_req, file, cb) => { if (!file.originalname.toLowerCase().endsWith('.pdf')) return cb(new AppError(400, 'Please upload a PDF file.')); cb(null, true); } });
  const uploadLimit = rateLimit({ windowMs: 3600000, limit: 10, message: { error: 'Upload limit reached. Please try again later.' }, skip: () => options.rateLimits === false });
  app.post('/api/documents', uploadLimit, (req, res, next) => {
    if (!ready().pdfReady) return next(new AppError(503, 'Connect Pinecone and Supabase before uploading a PDF.'));
    if (processingCount >= 2 || activeSessions.has(res.locals.session)) return next(new AppError(409, 'A document is already processing. Please wait and try again.'));
    // Reserve capacity before reading the multipart body, to bound memory usage.
    processingCount++; activeSessions.add(res.locals.session);
    let released = false;
    const release = () => { if (!released) { released = true; processingCount--; activeSessions.delete(res.locals.session); } };
    upload.single('pdf')(req, res, async (error: unknown) => {
      if (error) { release(); next(error); return; }
      try {
        if (!req.file) throw new AppError(400, 'Choose a PDF to upload.');
        if (req.file.buffer.subarray(0, 1024).indexOf('%PDF-') < 0) throw new AppError(400, 'This file is not a valid PDF.');
        const previous = await services.latest(res.locals.session);
        if (previous?.status === 'processing') throw new AppError(409, 'Wait until your current document finishes processing.');
        const id = randomUUID();
        const doc: StoredDocument = { id, session_hash: res.locals.session, name: req.file.originalname.replace(/[\x00-\x1f]/g, '').slice(0, 180), status: 'processing', stage: 'Reading PDF', pages: 0, chunks: 0, error: null, storage_path: `${id}/source.pdf`, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() };
        await services.create(doc, req.file.buffer);
        if (previous) { try { await services.remove(previous); } catch (e) { await services.remove(doc).catch(() => {}); throw e; } }
        res.status(202).json({ document: publicDocument(doc) });
        void services.process(doc, req.file.buffer).catch(async (e: unknown) => {
          const message = e instanceof AppError ? e.message : 'Processing failed. Check the embedding download and service connections, then replace the PDF to retry.';
          await services.update(doc.id, { status: 'failed', stage: 'Failed', error: message }).catch(() => console.error('Could not update failed document status.'));
        }).finally(release);
      } catch (e) { release(); next(e); }
    });
  });
  app.delete('/api/documents/:id', async (req, res) => {
    if (!ready().pdfReady) throw new AppError(503, 'Document storage is not configured.');
    if (activeSessions.has(res.locals.session)) throw new AppError(409, 'Wait for the current operation to finish.');
    activeSessions.add(res.locals.session);
    try {
      const doc = await services.get(req.params.id, res.locals.session);
      if (!doc) throw new AppError(404, 'Document not found or expired.');
      if (doc.status === 'processing') throw new AppError(409, 'Wait for PDF processing to finish.');
      await services.remove(doc); res.json({ ok: true });
    } finally { activeSessions.delete(res.locals.session); }
  });
  app.get('/api/documents/:id/file', async (req, res) => {
    if (!ready().pdfReady) throw new AppError(503, 'Document storage is not configured.');
    const doc = await services.get(req.params.id, res.locals.session);
    if (!doc) throw new AppError(404, 'Document not found or expired.');
    res.type('application/pdf').setHeader('Content-Disposition', 'inline; filename="study-notes.pdf"');
    res.send(Buffer.from(await services.file(doc)));
  });
  const chatLimit = rateLimit({ windowMs: 60000, limit: 12, message: { error: 'Take a moment, then ask your next question.' }, skip: () => options.rateLimits === false });
  app.post('/api/chat', chatLimit, async (req, res) => {
    if (!ready().chatReady) throw new AppError(503, 'Add your Groq API key to enable AI answers.');
    const { message, history, documentId, strict } = validateChat(req.body);
    if (strict && !documentId) throw new AppError(400, 'Upload a PDF before using PDF-only answers.');
    if (activeSessions.has(res.locals.session)) throw new AppError(409, 'Wait for the current operation to finish.');
    activeSessions.add(res.locals.session);
    const controller = new AbortController();
    const streaming = req.get('accept')?.includes('text/event-stream');
    const disconnected = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnected);
    try {
      let sources: Awaited<ReturnType<Services['retrieve']>> = [];
      if (documentId) {
        if (!ready().pdfReady) throw new AppError(503, 'Document search is not configured.');
        const doc = await services.get(documentId, res.locals.session);
        if (!doc) throw new AppError(404, 'Your PDF has expired or is unavailable. Please upload it again.');
        if (doc.status !== 'ready') throw new AppError(409, 'Your PDF is not ready yet.');
        // Bring the last user question into short follow-ups without embedding a whole chat.
        const previous = [...history].reverse().find(m => m.role === 'user');
        const followup = /^(why|how so|what about|explain (that|it|this)|give me|show me|can you|and |what does (that|it)|make (it|that))/i.test(message);
        const query = followup && previous ? `${message.slice(0, 450)}\nPrevious question: ${previous.content.slice(0, 350)}` : message.slice(0, 800);
        sources = await services.retrieve(doc, query);
      }
      if (controller.signal.aborted) return;
      if (!streaming) { res.json(await services.answer(message, history, sources, strict, !!documentId)); return; }
      res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15000);
      try {
        if (services.streamAnswer) {
          for await (const event of services.streamAnswer(message, history, sources, strict, !!documentId, controller.signal)) {
            if (controller.signal.aborted || res.destroyed) break;
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        } else {
          const result = await services.answer(message, history, sources, strict, !!documentId);
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
    if (error instanceof multer.MulterError) { res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Please choose a PDF smaller than 10 MB.' : 'Upload one PDF at a time.' }); return; }
    if (error instanceof AppError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: 'Invalid request body.' }); return; }
    res.status(500).json({ error: 'Something went wrong. Please try again or check the server configuration.' });
    console.error('Request failed:', error instanceof Error ? error.name : 'Unknown error');
  };
  app.use(errors);
  return app;
}
