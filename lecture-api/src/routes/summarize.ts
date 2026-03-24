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
            content: `당신은 강의 요약 및 제목 선정 전문가입니다. 
제공된 강의 텍스트를 분석하여 다음 두 가지를 수행하세요:
1. 강의 내용을 한국어로 요약하세요. [핵심 요약], [주요 내용], [키워드] 섹션으로 나누어 작성하세요.
2. 강의 내용을 대표하는 아주 짧고 간결한 제목(20자 이내)을 정하세요.

반드시 다음 JSON 형식으로 응답하세요:
{
  "summary": "요약 내용...",
  "suggestedName": "강의 제목"
}`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.5,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${config.openAiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60_000,
      }
    );

    const result = JSON.parse(response.data.choices[0].message.content);
    res.json({ 
      summary: result.summary, 
      suggestedName: result.suggestedName 
    });
  } catch (err: any) {
    console.error('[summarize] Error:', err.response?.data ?? err.message);
    res.status(500).json({ error: '요약 생성에 실패했습니다.' });
  }
});

export default router;
