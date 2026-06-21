import express from 'express';
import axios from 'axios';
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

const TRANSLATION_REFUSAL_PATTERNS: RegExp[] = [
  /i'?m sorry/i,
  /cannot assist/i,
  /cannot help/i,
  /unable to/i,
  /not recognizable/i,
  /please provide/i,
];

function normalizeTargetLanguage(targetLang?: string): string {
  const normalized = typeof targetLang === 'string' ? targetLang.trim() : '';
  if (!normalized) return 'English';
  return normalized.slice(0, 32);
}

function looksLikeTranslationRefusal(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return true;
  return TRANSLATION_REFUSAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

async function requestTranslation(text: string, targetLanguage: string, strictFallback = false): Promise<string> {
  const systemPrompt = strictFallback
    ? `Translate the user text into ${targetLanguage}. Return translation only. If the text is noisy or fragmented, provide a best-effort translation or transliteration with no explanation.`
    : `You are a professional translator. Translate the user text into ${targetLanguage}. Return only the translated text. Preserve names, tone, and technical terms when possible.`;

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0,
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

  return String(response.data?.choices?.[0]?.message?.content ?? '').trim();
}

// ── Translate route ───────────────────────────────────────────────────────────
app.post('/api/translate', async (req, res) => {
  const { text, targetLang } = req.body as { text?: string; targetLang?: string };

  if (!text || text.trim().length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty "text" field.' });
    return;
  }

  if (text.length > 80_000) {
    res.status(400).json({ error: 'Text is too long.' });
    return;
  }

  const normalizedTargetLanguage = normalizeTargetLanguage(targetLang);

  try {
    let translation = await requestTranslation(text, normalizedTargetLanguage, false);

    // Retry once when the model returns refusal/policy chatter
    // instead of a direct translation output.
    if (looksLikeTranslationRefusal(translation)) {
      translation = await requestTranslation(text, normalizedTargetLanguage, true);
    }

    if (looksLikeTranslationRefusal(translation)) {
      res.status(502).json({ error: 'Translation model returned an invalid response. Please retry.' });
      return;
    }

    res.json({ translation: translation.trim() });
  } catch (err: any) {
    console.error('[translate] Error:', err.response?.data ?? err.message);
    res.status(500).json({ error: 'Translation failed.' });
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
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Generate one concise Korean lecture title (maximum 20 characters). Return only the title text.',
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
    res.status(500).json({ error: 'Title generation failed.' });
  }
});

// ── Quiz generation route ─────────────────────────────────────────────────────
// Generates multiple-choice quiz questions from a lecture transcript so students
// can self-test. Returns strict JSON the app renders as an interactive quiz.
app.post('/api/quiz', async (req, res) => {
  const { text, language, count } = req.body as {
    text?: string;
    language?: string;
    count?: number;
  };

  if (!text || text.trim().length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty "text" field.' });
    return;
  }
  if (text.length > 200_000) {
    res.status(400).json({ error: 'Text is too long.' });
    return;
  }

  const lang = language === 'en' ? 'English' : language === 'zh' ? '中文' : '한국어';
  const n = Math.min(Math.max(typeof count === 'number' ? count : 5, 3), 10);
  // Cap input so very long lectures stay within token/cost bounds for quizzes.
  const source = text.slice(0, 30_000);

  const systemPrompt =
    `You are an expert exam author. Create exactly ${n} multiple-choice questions that test ` +
    `understanding of the lecture content (not trivia). Write ALL text in ${lang}. ` +
    `Each question has exactly 4 options, exactly one correct, and a short explanation. ` +
    `Vary difficulty. Output ONLY this JSON object, nothing else:\n` +
    `{\n  "quiz": [\n    { "question": "...", "options": ["A","B","C","D"], "answerIndex": 0, "explanation": "..." }\n  ]\n}`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Lecture transcript:\n\n${source}` },
        ],
        temperature: 0.4,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${config.openAiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 90_000,
      }
    );

    const raw: string = response.data.choices[0].message.content;
    const parsed = JSON.parse(raw);
    const rawQuiz: any[] = Array.isArray(parsed.quiz) ? parsed.quiz : [];

    // Sanitize: keep only well-formed 4-option questions with a valid answer index.
    const quiz = rawQuiz
      .map((q: any) => {
        const options = Array.isArray(q.options) ? q.options.map((o: any) => String(o)).slice(0, 4) : [];
        let answerIndex = Number.isInteger(q.answerIndex) ? q.answerIndex : 0;
        if (answerIndex < 0 || answerIndex >= options.length) answerIndex = 0;
        return {
          question: String(q.question ?? '').trim(),
          options,
          answerIndex,
          explanation: String(q.explanation ?? '').trim(),
        };
      })
      .filter((q) => q.question && q.options.length === 4);

    if (quiz.length === 0) {
      res.status(502).json({ error: 'Quiz model returned no valid questions. Please retry.' });
      return;
    }

    res.json({ quiz });
  } catch (err: any) {
    if (err instanceof SyntaxError) {
      console.error('[quiz] JSON parse failure from GPT response');
      res.status(500).json({ error: 'AI 응답 파싱에 실패했습니다. 다시 시도해 주세요.' });
      return;
    }
    console.error('[quiz] Error:', err.response?.data ?? err.message);
    res.status(500).json({ error: '퀴즈 생성에 실패했습니다.' });
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
