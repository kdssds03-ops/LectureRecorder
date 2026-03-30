import express from 'express';
import { config } from './config';
import transcribeRouter from './routes/transcribe';
import summarizeRouter from './routes/summarize';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Startup env validation ────────────────────────────────────────────────────
// Log clearly which keys are present/missing so Railway logs immediately reveal
// the cause of any 401 / 500 / 502 errors on first deploy.
function validateEnv(): void {
  console.log('[startup] Validating required environment variables...');
  const checks = [
    { key: 'ASSEMBLYAI_API_KEY', value: config.assemblyAiKey, desc: 'transcription (AssemblyAI)' },
    { key: 'OPENAI_API_KEY',     value: config.openAiKey,     desc: 'summarization / translation / title' },
    { key: 'APP_SECRET',         value: config.appSecret !== 'default_secret' ? config.appSecret : '', desc: 'request authentication' },
  ];
  let allOk = true;
  for (const { key, value, desc } of checks) {
    if (value) {
      console.log(`[startup]   ✓ ${key} — configured (${desc})`);
    } else {
      console.warn(`[startup]   ✗ ${key} — MISSING — ${desc} will fail!`);
      allOk = false;
    }
  }
  if (config.appSecret === 'default_secret') {
    console.warn('[startup]   ✗ APP_SECRET is the insecure default — set it in Railway dashboard');
    allOk = false;
  }
  if (allOk) {
    console.log('[startup] All required env vars are configured.');
  } else {
    console.warn('[startup] WARNING: One or more required env vars are missing. See above.');
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── CORS (allow all origins for mobile app) ───────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-app-key, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// ── Auth middleware ───────────────────────────────────────────────────────────
// Validates x-app-key header against APP_SECRET env var
app.use((req, res, next) => {
  // Skip auth for health check
  if (req.path === '/health' || req.path === '/') {
    return next();
  }

  const appKey = req.headers['x-app-key'];
  if (!appKey || appKey !== config.appSecret) {
    res.status(401).json({ error: '인증에 실패했습니다. 올바른 앱 키를 설정해 주세요.' });
    return;
  }
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      openai:     config.openAiKey     ? 'configured' : 'MISSING',
      assemblyai: config.assemblyAiKey ? 'configured' : 'MISSING',
      appSecret:  config.appSecret !== 'default_secret' ? 'configured' : 'INSECURE_DEFAULT',
    },
  });
});

app.get('/', (_req, res) => {
  res.json({ message: 'LectureRecorder API is running.' });
});

app.use('/api/transcribe', transcribeRouter);
app.use('/api/summarize', summarizeRouter);

// ── Translate route ───────────────────────────────────────────────────────────
app.post('/api/translate', async (req, res) => {
  const { text, targetLang = 'English' } = req.body as { text?: string; targetLang?: string };

  if (!text || text.trim().length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty "text" field.' });
    return;
  }

  if (text.length > 80_000) {
    res.status(400).json({ error: 'Text is too long.' });
    return;
  }

  try {
    const axios = require('axios');
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `당신은 전문 번역가입니다. 주어진 텍스트를 ${targetLang}로 자연스럽게 번역해 주세요. 번역문만 출력하고 다른 설명은 포함하지 마세요.`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.2,
        max_tokens: 4000,
      },
      {
        headers: {
          Authorization: `Bearer ${config.openAiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60_000,
      }
    );

    const translation: string = response.data.choices[0].message.content;
    res.json({ translation });
  } catch (err: any) {
    console.error('[translate] Error:', err.response?.data ?? err.message);
    res.status(500).json({ error: '번역에 실패했습니다.' });
  }
});

// ── Title generation route ────────────────────────────────────────────────────
app.post('/api/title', async (req, res) => {
  const { text } = req.body as { text?: string };

  if (!text || text.trim().length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty "text" field.' });
    return;
  }

  try {
    const axios = require('axios');
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '주어진 강의 내용을 보고 가장 적합한 제목을 한국어로 20자 이내로 작성하세요. 제목만 출력하고 다른 설명은 포함하지 마세요.',
          },
          {
            role: 'user',
            content: text.slice(0, 3000), // Use first 3000 chars for title
          },
        ],
        temperature: 0.3,
        max_tokens: 50,
      },
      {
        headers: {
          Authorization: `Bearer ${config.openAiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );

    const title: string = response.data.choices[0].message.content.trim();
    res.json({ title });
  } catch (err: any) {
    console.error('[title] Error:', err.response?.data ?? err.message);
    res.status(500).json({ error: '제목 생성에 실패했습니다.' });
  }
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
// Belt-and-suspenders: catch multer errors that escape the per-route wrapper,
// plus any other unhandled errors from async route handlers.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Multer-specific errors (e.g. from a route that forgot to use uploadSingle wrapper)
  const multer = require('multer');
  if (err instanceof multer.MulterError) {
    console.warn(`[server] MulterError: code=${err.code} message=${err.message}`);
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({
      error: err.code === 'LIMIT_FILE_SIZE'
        ? '파일이 너무 큽니다.'
        : `업로드 오류: ${err.message}`,
      code: err.code,
    });
    return;
  }

  console.error('[server] Unhandled error:', err?.message ?? err);
  if (err?.stack) console.error('[server] Stack:', err.stack);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
validateEnv();
const server = app.listen(PORT, () => {
  console.log(`[server] LectureRecorder API listening on port ${PORT}`);
});

// Increase server timeout for large file uploads (10 minutes)
server.timeout = 600_000;
server.keepAliveTimeout = 600_000;
server.headersTimeout = 601_000;

export default app;
