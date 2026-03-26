import { Router, Request, Response } from 'express';
import axios from 'axios';
import { config } from '../config';

const router = Router();

type LectureType =
  | 'general'
  | 'math'
  | 'science'
  | 'coding'
  | 'humanities'
  | 'language'
  | 'history'
  | 'economics'
  | 'law'
  | 'medicine'
  | 'art'
  | 'other';

const LECTURE_TYPE_LABELS: Record<LectureType, string> = {
  general: '일반 강의',
  math: '수학',
  science: '과학',
  coding: '코딩 / 프로그래밍',
  humanities: '인문학',
  language: '어문학 / 언어',
  history: '역사',
  economics: '경제 / 경영',
  law: '법학',
  medicine: '의학 / 생명과학',
  art: '예술 / 디자인',
  other: '기타',
};

/**
 * Returns a category-specific system prompt for structured lecture summarization.
 */
function buildSystemPrompt(lectureType: LectureType): string {
  const label = LECTURE_TYPE_LABELS[lectureType] ?? '일반 강의';

  const commonInstructions = `당신은 대학 강의 노트 전문가입니다. 주어진 강의 녹취록을 분석하여 아래 JSON 형식으로 정확하게 응답하세요.
강의 분야: ${label}

반드시 아래 JSON 형식만 출력하세요. 다른 텍스트는 절대 포함하지 마세요:
{
  "suggestedName": "강의 제목 (20자 이내)",
  "overview": "이 강의의 핵심 내용을 2~3문장으로 요약",
  "keyPoints": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
  "details": [
    { "heading": "소주제 제목", "content": "해당 소주제의 상세 설명" }
  ],
  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],
  "studyTips": "이 강의 내용을 효과적으로 학습하기 위한 팁 1~2문장"
}`;

  // Category-specific additional instructions
  const categoryExtras: Partial<Record<LectureType, string>> = {
    math: `
수학 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 공식, 정리, 증명 단계를 포함하세요
- details에 풀이 방법론과 예제 유형을 포함하세요
- keywords에 수학 용어와 기호를 포함하세요`,

    science: `
과학 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 개념, 법칙, 실험 결과를 포함하세요
- details에 실험 방법과 과학적 원리를 포함하세요
- keywords에 과학 용어와 단위를 포함하세요`,

    coding: `
프로그래밍 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 알고리즘, 자료구조, 패턴을 포함하세요
- details에 코드 로직과 구현 방법을 포함하세요
- keywords에 프로그래밍 용어, 함수명, 라이브러리를 포함하세요`,

    humanities: `
인문학 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 사상, 논증, 철학적 개념을 포함하세요
- details에 주요 논점과 사례를 포함하세요
- keywords에 철학/인문학 용어와 사상가 이름을 포함하세요`,

    history: `
역사 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 사건, 연도, 인물을 포함하세요
- details에 역사적 배경과 인과관계를 포함하세요
- keywords에 역사적 사건명, 인물명, 시대명을 포함하세요`,

    economics: `
경제/경영 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 이론, 모델, 경제 지표를 포함하세요
- details에 경제 원리와 실제 사례를 포함하세요
- keywords에 경제/경영 용어와 지표를 포함하세요`,

    law: `
법학 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 법 조항, 판례, 법적 원칙을 포함하세요
- details에 법적 요건과 적용 사례를 포함하세요
- keywords에 법학 용어와 법 조항을 포함하세요`,

    medicine: `
의학/생명과학 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 의학 개념, 병리, 치료법을 포함하세요
- details에 해부학적 구조와 생리학적 원리를 포함하세요
- keywords에 의학 용어와 약물명을 포함하세요`,
  };

  const extra = categoryExtras[lectureType] ?? '';
  return commonInstructions + extra;
}

/**
 * POST /api/summarize
 * Summarizes a lecture transcript using OpenAI GPT and suggests a title.
 * Supports lecture-type-specific structured summaries.
 *
 * Body: { text: string, lectureType?: LectureType }
 * Response: { summary: string, suggestedName: string }
 */
router.post('/', async (req: Request, res: Response) => {
  const { text, lectureType = 'general' } = req.body as {
    text?: string;
    lectureType?: LectureType;
  };

  if (!text || text.trim().length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty "text" field.' });
    return;
  }

  // Guard against absurdly large inputs (rough safety limit)
  if (text.length > 80_000) {
    res.status(400).json({ error: 'Text is too long. Please split into smaller segments.' });
    return;
  }

  // Validate lectureType
  const validTypes: LectureType[] = [
    'general', 'math', 'science', 'coding', 'humanities',
    'language', 'history', 'economics', 'law', 'medicine', 'art', 'other'
  ];
  const resolvedType: LectureType = validTypes.includes(lectureType) ? lectureType : 'general';

  try {
    const systemPrompt = buildSystemPrompt(resolvedType);

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `다음 강의 녹취록을 분석하고 JSON 형식으로 요약해 주세요:\n\n${text}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${config.openAiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60_000,
      }
    );

    const fullContent: string = response.data.choices[0].message.content;
    
    let parsed: any;
    try {
      parsed = JSON.parse(fullContent);
    } catch (parseErr) {
      console.error('[summarize] Failed to parse JSON response:', fullContent);
      // Fallback: return raw content as plain summary
      res.json({ summary: fullContent, suggestedName: '' });
      return;
    }

    const suggestedName: string = (parsed.suggestedName ?? '').trim().slice(0, 20);
    
    // Store the structured summary as a JSON string so the app can render it properly
    res.json({
      summary: JSON.stringify({
        lectureType: resolvedType,
        overview: parsed.overview ?? '',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        details: Array.isArray(parsed.details) ? parsed.details : [],
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        studyTips: parsed.studyTips ?? '',
      }),
      suggestedName,
    });
  } catch (err: any) {
    console.error('[summarize] Error:', err.response?.data ?? err.message);
    res.status(500).json({ error: '요약 생성에 실패했습니다.' });
  }
});

export default router;
