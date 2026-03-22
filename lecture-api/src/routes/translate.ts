import { Router, Request, Response } from 'express';
import axios from 'axios';
import { config } from '../config';

const router = Router();

/**
 * POST /api/translate
 * Translates lecture text using OpenAI GPT.
 * Auto-detects language direction: Korean ↔ English.
 *
 * Body: { text: string, targetLang?: string }
 * Response: { translation: string }
 */
router.post('/', async (req: Request, res: Response) => {
  const { text, targetLang } = req.body as { text?: string; targetLang?: string };

  if (!text || text.trim().length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty "text" field.' });
    return;
  }

  if (text.length > 80_000) {
    res.status(400).json({ error: 'Text is too long. Please split into smaller segments.' });
    return;
  }

  const target = targetLang ?? 'English';

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate the following text to ${target}. If the source is Korean, translate to English. If it is English, translate to Korean. Preserve speaker labels like [화자 A] if present. Return only the translation, no explanations.`,
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

export default router;
