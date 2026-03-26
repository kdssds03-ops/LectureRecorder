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

type SummaryLanguage = 'ko' | 'en' | 'zh';

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
 * Supports multiple languages: 'ko' (Korean), 'en' (English), 'zh' (Chinese)
 */
function buildSystemPrompt(lectureType: LectureType, language: SummaryLanguage = 'ko'): string {
  const label = LECTURE_TYPE_LABELS[lectureType] ?? '일반 강의';

  // Language-specific base prompts
  const basePrompts: Record<SummaryLanguage, string> = {
    ko: `당신은 대학 강의 노트 전문가입니다. 주어진 강의 녹취록을 분석하여 아래 JSON 형식으로 정확하게 응답하세요.
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
}`,
    en: `You are an expert university lecture note specialist. Analyze the given lecture transcript and respond in the following JSON format.
Lecture Field: ${label}

Output ONLY the JSON format below. Do not include any other text:
{
  "suggestedName": "Lecture Title (max 20 characters)",
  "overview": "Summary of the lecture's core content in 2-3 sentences",
  "keyPoints": ["Key Point 1", "Key Point 2", "Key Point 3"],
  "details": [
    { "heading": "Subtopic Title", "content": "Detailed explanation of the subtopic" }
  ],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "studyTips": "Tips for effectively learning this lecture content in 1-2 sentences"
}`,
    zh: `您是大学讲座笔记专家。分析给定的讲座录音稿，并以以下JSON格式响应。
讲座领域：${label}

仅输出以下JSON格式。不包括任何其他文本：
{
  "suggestedName": "讲座标题（最多20个字符）",
  "overview": "讲座核心内容的2-3句总结",
  "keyPoints": ["关键点1", "关键点2", "关键点3"],
  "details": [
    { "heading": "子主题标题", "content": "子主题的详细说明" }
  ],
  "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"],
  "studyTips": "有效学习本讲座内容的提示（1-2句）"
}`,
  };

  const basePrompt = basePrompts[language] || basePrompts.ko;

  // Category-specific additional instructions (in the selected language)
  const categoryExtras: Partial<Record<LectureType, Partial<Record<SummaryLanguage, string>>>> = {
    math: {
      ko: `\n수학 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 공식, 정리, 증명 단계를 포함하세요
- details에 풀이 방법론과 예제 유형을 포함하세요
- keywords에 수학 용어와 기호를 포함하세요`,
      en: `\nSince this is a mathematics lecture, pay special attention to:
- Include key formulas, theorems, and proof steps in keyPoints
- Include solution methodologies and example types in details
- Include mathematical terms and symbols in keywords`,
      zh: `\n由于这是数学讲座，请特别注意：
- 在keyPoints中包括关键公式、定理和证明步骤
- 在details中包括求解方法和例题类型
- 在keywords中包括数学术语和符号`,
    },

    science: {
      ko: `\n과학 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 개념, 법칙, 실험 결과를 포함하세요
- details에 실험 방법과 과학적 원리를 포함하세요
- keywords에 과학 용어와 단위를 포함하세요`,
      en: `\nSince this is a science lecture, pay special attention to:
- Include key concepts, laws, and experimental results in keyPoints
- Include experimental methods and scientific principles in details
- Include scientific terms and units in keywords`,
      zh: `\n由于这是科学讲座，请特别注意：
- 在keyPoints中包括关键概念、定律和实验结果
- 在details中包括实验方法和科学原理
- 在keywords中包括科学术语和单位`,
    },

    coding: {
      ko: `\n프로그래밍 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 알고리즘, 자료구조, 패턴을 포함하세요
- details에 코드 로직과 구현 방법을 포함하세요
- keywords에 프로그래밍 용어, 함수명, 라이브러리를 포함하세요`,
      en: `\nSince this is a programming lecture, pay special attention to:
- Include key algorithms, data structures, and patterns in keyPoints
- Include code logic and implementation methods in details
- Include programming terms, function names, and libraries in keywords`,
      zh: `\n由于这是编程讲座，请特别注意：
- 在keyPoints中包括关键算法、数据结构和模式
- 在details中包括代码逻辑和实现方法
- 在keywords中包括编程术语、函数名和库`,
    },

    humanities: {
      ko: `\n인문학 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 사상, 논증, 철학적 개념을 포함하세요
- details에 주요 논점과 사례를 포함하세요
- keywords에 철학/인문학 용어와 사상가 이름을 포함하세요`,
      en: `\nSince this is a humanities lecture, pay special attention to:
- Include key ideas, arguments, and philosophical concepts in keyPoints
- Include main arguments and examples in details
- Include humanities/philosophy terms and philosopher names in keywords`,
      zh: `\n由于这是人文学讲座，请特别注意：
- 在keyPoints中包括关键思想、论证和哲学概念
- 在details中包括主要论点和例子
- 在keywords中包括人文学/哲学术语和思想家名字`,
    },

    history: {
      ko: `\n역사 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 사건, 연도, 인물을 포함하세요
- details에 역사적 배경과 인과관계를 포함하세요
- keywords에 역사적 사건명, 인물명, 시대명을 포함하세요`,
      en: `\nSince this is a history lecture, pay special attention to:
- Include key events, dates, and figures in keyPoints
- Include historical context and causal relationships in details
- Include historical event names, figure names, and era names in keywords`,
      zh: `\n由于这是历史讲座，请特别注意：
- 在keyPoints中包括关键事件、日期和人物
- 在details中包括历史背景和因果关系
- 在keywords中包括历史事件名、人物名和时代名`,
    },

    economics: {
      ko: `\n경제/경영 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 이론, 모델, 경제 지표를 포함하세요
- details에 경제 원리와 실제 사례를 포함하세요
- keywords에 경제/경영 용어와 지표를 포함하세요`,
      en: `\nSince this is an economics/business lecture, pay special attention to:
- Include key theories, models, and economic indicators in keyPoints
- Include economic principles and real-world examples in details
- Include economics/business terms and indicators in keywords`,
      zh: `\n由于这是经济学/商业讲座，请特别注意：
- 在keyPoints中包括关键理论、模型和经济指标
- 在details中包括经济原理和现实例子
- 在keywords中包括经济学/商业术语和指标`,
    },

    law: {
      ko: `\n법학 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 법 조항, 판례, 법적 원칙을 포함하세요
- details에 법적 요건과 적용 사례를 포함하세요
- keywords에 법학 용어와 법 조항을 포함하세요`,
      en: `\nSince this is a law lecture, pay special attention to:
- Include key legal provisions, precedents, and legal principles in keyPoints
- Include legal requirements and application cases in details
- Include legal terms and legal provisions in keywords`,
      zh: `\n由于这是法律讲座，请特别注意：
- 在keyPoints中包括关键法律条款、判例和法律原则
- 在details中包括法律要求和适用案例
- 在keywords中包括法律术语和法律条款`,
    },

    medicine: {
      ko: `\n의학/생명과학 강의이므로 다음에 특히 주의하세요:
- keyPoints에 핵심 의학 개념, 병리, 치료법을 포함하세요
- details에 해부학적 구조와 생리학적 원리를 포함하세요
- keywords에 의학 용어와 약물명을 포함하세요`,
      en: `\nSince this is a medicine/life sciences lecture, pay special attention to:
- Include key medical concepts, pathologies, and treatments in keyPoints
- Include anatomical structures and physiological principles in details
- Include medical terms and drug names in keywords`,
      zh: `\n由于这是医学/生命科学讲座，请特别注意：
- 在keyPoints中包括关键医学概念、病理和治疗方法
- 在details中包括解剖结构和生理学原理
- 在keywords中包括医学术语和药物名称`,
    },
  };

  const extra = categoryExtras[lectureType]?.[language] ?? '';
  return basePrompt + extra;
}

/**
 * POST /api/summarize
 * Summarizes a lecture transcript using OpenAI GPT and suggests a title.
 * Supports lecture-type-specific structured summaries in multiple languages.
 *
 * Body: { text: string, lectureType?: LectureType, language?: SummaryLanguage }
 * Response: { summary: string, suggestedName: string }
 */
router.post('/', async (req: Request, res: Response) => {
  const { text, lectureType = 'general', language = 'ko' } = req.body as {
    text?: string;
    lectureType?: LectureType;
    language?: SummaryLanguage;
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

  // Validate language
  const validLanguages: SummaryLanguage[] = ['ko', 'en', 'zh'];
  const resolvedLanguage: SummaryLanguage = validLanguages.includes(language) ? language : 'ko';

  try {
    const systemPrompt = buildSystemPrompt(resolvedType, resolvedLanguage);

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
            content: resolvedLanguage === 'ko' 
              ? `다음 강의 녹취록을 분석하고 JSON 형식으로 요약해 주세요:\n\n${text}`
              : resolvedLanguage === 'en'
              ? `Analyze the following lecture transcript and summarize it in JSON format:\n\n${text}`
              : `分析以下讲座录音稿，并以JSON格式总结：\n\n${text}`,
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
        language: resolvedLanguage,
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
