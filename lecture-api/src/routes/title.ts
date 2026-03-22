import { Router, Request, Response } from 'express';
import axios from 'axios';
import { config } from '../config';

const router = Router();

/**
 * POST /api/title
 * Generates a short, natural title for a transcript using OpenAI GPT.
 *
 * Body: { text: string }
 * Response: { title: string }
 */
router.post('/', async (req: Request, res: Response) => {
  const { text } = req.body as { text?: string };

  if (!text || text.trim().length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty "text" field.' });
    return;
  }

  // Guard against absurdly large inputs (limit specifically for title generation)
  const truncatedText = text.substring(0, 15000);

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '당신은 텍스트의 제목을 생성하는 전문가입니다. 주어진 텍스트의 핵심을 파악하여 8~30자 내외의 짧고 자연스러운 파일 제목을 작성하세요. 불필요한 구두점, 이모지, 따옴표 없이 텍스트만 출력하세요. 단어 위주의 짧은 구문을 사용하고 전체 문장을 피하세요. 예시: 운영체제 강의 정리, 마케팅 회의 액션 아이템',
          },
          {
            role: 'user',
            content: `다음 강의 녹취록을 기반으로 짧은 제목을 하나만 출력해 주세요:\n\n${truncatedText}`,
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

    let title: string = response.data.choices[0].message.content;
    title = title.replace(/["']/g, '').trim();

    res.json({ title });
  } catch (err: any) {
    console.error('[title] Error:', err.response?.data ?? err.message);
    res.status(500).json({ error: '제목 생성에 실패했습니다.' });
  }
});

export default router;
