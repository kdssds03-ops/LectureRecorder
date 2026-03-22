import express from 'express';
import cors from 'cors';
import { config } from './config';
import { requireAppKey } from './middleware/auth';
import transcribeRouter from './routes/transcribe';
import summarizeRouter from './routes/summarize';
import translateRouter from './routes/translate';
import titleRouter from './routes/title';

const app = express();

// ─── Global Middleware ─────────────────────────────────────────────────────────

// Allow requests from any origin — tighten this once you have a fixed domain
app.use(cors());

// Parse JSON bodies (for summarize / translate routes)
app.use(express.json({ limit: '1mb' }));

// ─── Health Check (no auth required) ──────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: config.nodeEnv, timestamp: new Date().toISOString() });
});

// ─── Protected API Routes ──────────────────────────────────────────────────────
// All /api/* routes require the x-app-key header
app.use('/api', requireAppKey);

app.use('/api/transcribe', transcribeRouter);
app.use('/api/summarize', summarizeRouter);
app.use('/api/translate', translateRouter);
app.use('/api/title', titleRouter);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`🚀 lecture-api running on port ${config.port} [${config.nodeEnv}]`);
  console.log(`   Health check: http://localhost:${config.port}/health`);
});

export default app;
