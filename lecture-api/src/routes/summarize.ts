import { Router, Request, Response } from 'express';
import axios from 'axios';
import { config } from '../config';

const router = Router();

/**
 * POST /api/summarize
 * Summarizes a lecture transcript using OpenAI GPT.
 *
 * Body: { text: string }
 * Response: { summary: string }
 */
router.post('/', async (req: Request, res: Response) => {
  const { text } = req.body as { text?: string };

  if (!text || text.trim().length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty "text" field.' });
    return;
  }

  // Guard against absurdly large inputs (rough safety limit)
  if (text.length > 80_000) {
    res.status(400).json({ error: 'Text is too long. Please split into smaller segments.' });
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
            content:
              '당신은 강의 내용을 정리해주는 전문가입니다. 강의 녹취록을 받으면 아래 형식으로 정리해 주세요:\n\n## 핵심 요약\n핵심 내용을 3~5줄로 요약\n\n## 주요 내용\n- 불릿 포인트로 정리\n\n## 키워드\n중요 키워드 나열',
          },
          {
            role: 'user',
            content: `다음 강의 녹취록을 요약해 주세요:\n\n${text}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${config.openAiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60_000, // 60s — GPT can take a while on long text
      }
    );

    const summary: string = response.data.choices[0].message.content;
    res.json({ summary });
  } catch (err: any) {
    console.error('[summarize] Error:', err.response?.data ?? err.message);
    res.status(500).json({ error: '요약 생성에 실패했습니다.' });
  }
});

export default router;
