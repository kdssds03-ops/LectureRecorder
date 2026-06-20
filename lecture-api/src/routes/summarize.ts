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

// ── Chunking configuration ─────────────────────────────────────────────────────
//
// gpt-4o-mini has a 128k-token context window, but quality degrades with very
// long inputs. 12,000 chars ≈ ~3,000 tokens — high quality per-chunk, and lets
// us keep ≤4 concurrent parallel calls to avoid OpenAI rate-limit hits.
//
// The threshold for enabling chunking is set intentionally higher (20,000 chars)
// so that short/medium lectures go through the simple direct path without any
// overhead. A 60-minute lecture transcript is typically 80,000–150,000 chars
// and will be split into 7–13 chunks.
const CHUNK_SIZE_CHARS   = 12_000; // target chars per chunk
const CHUNK_OVERLAP_CHARS =    200; // overlap to preserve context across boundaries
const DIRECT_PATH_LIMIT  = 20_000; // below this: single call, no chunking
const MAX_CONCURRENT     =      4; // parallel chunk summarization calls

/**
 * Splits text into overlapping chunks at paragraph or sentence boundaries.
 * Chunks are at most CHUNK_SIZE_CHARS characters, with CHUNK_OVERLAP_CHARS
 * of shared context between consecutive chunks to reduce coherence loss.
 */
function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE_CHARS) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE_CHARS, text.length);

    if (end < text.length) {
      // Try to break at a paragraph boundary first, then sentence boundary
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      const newlineBreak   = text.lastIndexOf('\n',   end);
      const sentenceBreak  = text.lastIndexOf('. ',   end);

      if (paragraphBreak > start + CHUNK_SIZE_CHARS * 0.5) {
        end = paragraphBreak + 2;
      } else if (newlineBreak > start + CHUNK_SIZE_CHARS * 0.5) {
        end = newlineBreak + 1;
      } else if (sentenceBreak > start + CHUNK_SIZE_CHARS * 0.5) {
        end = sentenceBreak + 2;
      }
      // else: hard-cut at CHUNK_SIZE_CHARS (last resort)
    }

    chunks.push(text.slice(start, end).trim());

    // Advance start with overlap so context isn't lost at boundaries
    start = Math.max(start + 1, end - CHUNK_OVERLAP_CHARS);
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Run an array of async tasks with bounded concurrency.
 * Resolves to an array of results in the same order as tasks.
 */
async function pooledMap<T, U>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ── Prompt builders ───────────────────────────────────────────────────────────

/**
 * Returns a category-specific system prompt for structured lecture summarization.
 * Supports multiple languages: 'ko' (Korean), 'en' (English), 'zh' (Chinese)
 */
function buildSystemPrompt(lectureType: LectureType, language: SummaryLanguage = 'ko'): string {
  const label = LECTURE_TYPE_LABELS[lectureType] ?? '일반 강의';

  // Language-specific base prompts
  const basePrompts: Record<SummaryLanguage, string> = {
    ko: `당신은 최고 수준의 학술 노트 전문 AI입니다. 강의 녹취록을 분석하여 시험 공부와 복습에 최적화된 고밀도 요약 노트를 아래 JSON 형식으로만 작성하세요.\n강의 분야: ${label}\n\n1. 학술적이고 명확한 어조를 유지할 것\n2. 장황한 문장을 배제하고, 효율적인 구조화된 데이터를 제공할 것\n\n반드시 아래 JSON 형식만 출력하세요. 다른 텍스트는 절대 포함하지 마세요:\n{\n  "suggestedName": "강의 제목 (20자 이내)",\n  "overview": "이 강의의 핵심 목적과 주요 내용을 2~3문장으로 명확히 요약",\n  "keyPoints": ["핵심 개념 1", "핵심 원리 2", "주요 결론 3"],\n  "details": [\n    { "heading": "소주제/개념 이름", "content": "해당 개념의 학술적 정의, 중요성, 작동 원리를 상세하게 설명" }\n  ],\n  "keywords": ["핵심전문용어1", "핵심전문용어2", "핵심전문용어3", "핵심전문용어4", "핵심전문용어5"],\n  "studyTips": "이 강의에서 시험/실무를 위해 집중적으로 복습해야 할 주요 함정이나 포인트를 1~2문장으로 제안"\n}`,
    en: `You are an expert academic note-taking AI. Analyze the given lecture transcript and construct high-density, exam-optimized study notes in the following JSON format.\nLecture Field: ${label}\n\n1. Maintain a clear, academic tone.\n2. Avoid verbose sentences; provide efficient, structured data.\n\nOutput ONLY the JSON format below. Do not include any other text:\n{\n  "suggestedName": "Lecture Title (max 20 characters)",\n  "overview": "Clear summary of the lecture's core purpose and main content in 2-3 sentences",\n  "keyPoints": ["Core concept 1", "Core principle 2", "Main conclusion 3"],\n  "details": [\n    { "heading": "Subtopic/Concept Name", "content": "Detailed explanation of academic definition, significance, and mechanics" }\n  ],\n  "keywords": ["coreTerm1", "coreTerm2", "coreTerm3", "coreTerm4", "coreTerm5"],\n  "studyTips": "1-2 sentences suggesting key exam focuses, common pitfalls, or core takeaways for review"\n}`,
    zh: `您是顶级的学术笔记AI。分析讲座录音稿，并构建优化用于备考的高密度学习笔记，仅使用以下JSON格式。\n讲座领域：${label}\n\n1. 保持清晰且学术的语调。\n2. 避免冗长的句子；提供高效的结构化数据。\n\n仅输出以下JSON格式。不包括任何其他文本：\n{\n  "suggestedName": "讲座标题（最多20个字符）",\n  "overview": "清楚地总结讲座的核心目的和主要内容（2-3句）",\n  "keyPoints": ["核心概念1", "核心原理2", "主要结论3"],\n  "details": [\n    { "heading": "子主题/概念名称", "content": "详细说明学术定义、重要性和机制" }\n  ],\n  "keywords": ["核心术语1", "核心术语2", "核心术语3", "核心术语4", "核心术语5"],\n  "studyTips": "1-2句话，建议考试重点、常见陷阱或复习的核心要点"\n}`,
  };

  const basePrompt = basePrompts[language] || basePrompts.ko;

  // Category-specific additional instructions (in the selected language)
  const categoryExtras: Partial<Record<LectureType, Partial<Record<SummaryLanguage, string>>>> = {
    math: {
      ko: `\n수학/논리학 강의이므로 다음 규칙을 엄격히 따르세요:\n- keyPoints: 핵심 공식, 정리(Theorem), 연산자 우선순위 및 기본 정의를 추출하세요.\n- details: 증명 흐름, 공식의 유도 과정, 그리고 시험에 자주 나오는 실수(Common Mistakes)를 명확히 설명하세요.\n- keywords: 수학적 기호와 공식 명칭을 포함하세요.`,
      en: `\nSince this is a math/logic lecture, strictly follow these rules:\n- keyPoints: Extract core formulas, theorems, operator precedence, and basic definitions.\n- details: Clearly explain the proof flow, derivation of formulas, and common exam mistakes.\n- keywords: Include mathematical symbols and formula names.`,
      zh: `\n由于这是数学/逻辑讲座，请严格遵循以下规则：\n- keyPoints：提取核心公式，定理，运算符优先级和基本定义。\n- details：清楚地解释证明流程，公式推导以及常见的考试错误。\n- keywords：包括数学符号和公式名称。`,
    },

    science: {
      ko: `\n과학 강의이므로 다음 규칙을 엄격히 따르세요:\n- keyPoints: 핵심 과학 법칙, 현상, 임상적 발견이나 실험 결과를 추출하세요.\n- details: 실험 방법, 가설 검증 과정, 원인과 결과(인과관계), 원리를 심층적으로 분석하세요.\n- keywords: 핵심 과학 용어와 측정 단위(Units)를 포함하세요.`,
      en: `\nSince this is a science lecture, strictly follow these rules:\n- keyPoints: Extract key scientific laws, phenomena, and experimental results.\n- details: In-depth analysis of experimental methods, hypothesis testing, causal relationships, and mechanisms.\n- keywords: Include core scientific terms and measurement units.`,
      zh: `\n由于这是科学讲座，请严格遵循以下规则：\n- keyPoints：提取关键的科学定律，现象和实验结果。\n- details：深入分析实验方法，假设检验，因果关系和机制。\n- keywords：包括核心科学术语和测量单位。`,
    },

    coding: {
      ko: `\n컴퓨터 과학/프로그래밍 강의이므로 다음 규칙을 엄격히 따르세요:\n- keyPoints: 아키텍처, 알고리즘 원리, 자료구조 개념을 추출하세요.\n- details: 특정 함수나 API 이름, 구현 시 주의사항, 디버깅 팁 및 예외 처리(Edge Cases)를 상세히 설명하세요.\n- keywords: 프로그래밍 용어, 라이브러리, 프레임워크 명칭을 포함하세요.`,
      en: `\nSince this is a CS/programming lecture, strictly follow these rules:\n- keyPoints: Extract architecture, algorithm mechanics, and data structure concepts.\n- details: Detail specific function/API names, implementation cautions, debugging tips, and edge cases.\n- keywords: Include programming terms, libraries, and framework names.`,
      zh: `\n由于这是CS/编程讲座，请严格遵循以下规则：\n- keyPoints：提取架构，算法原理和数据结构概念。\n- details：详细说明特定的函数/API名称，实施注意事项，调试技巧和边缘情况。\n- keywords：包括编程术语，库和框架名称。`,
    },

    humanities: {
      ko: `\n인문학 강의이므로 다음 규칙을 엄격히 따르세요:\n- keyPoints: 학자의 중심 주장, 핵심 정의, 그리고 개념적 구분(Distinctions)을 명확히 하세요.\n- details: 주장을 뒷받침하는 추론 흐름, 철학적 해석 사례, 답안 작성에 활용하기 좋은 논리 구조를 설명하세요.\n- keywords: 철학/인문학 전문 조어 및 학자 이름을 포함하세요.`,
      en: `\nSince this is a humanities lecture, strictly follow these rules:\n- keyPoints: Clarify the scholar's core claims, definitions, and conceptual distinctions.\n- details: Explain the reasoning flow supporting the claims, interpretive examples, and logical structures useful for exam framing.\n- keywords: Include specialized philosophical/humanities terms and scholar names.`,
      zh: `\n由于这是人文学讲座，请严格遵循以下规则：\n- keyPoints：阐明学者的核心主张，定义和概念区分。\n- details：解释支持主张的推理流，解释性示例和有助于构建考试答案的逻辑结构。\n- keywords：包括专门的哲学/人文术语和学者姓名。`,
    },

    history: {
      ko: `\n역사 강의이므로 다음 규칙을 엄격히 따르세요:\n- keyPoints: 핵심 사건의 연대기적 가치, 전개 방향, 중심 인물의 영향을 정리하세요.\n- details: 역사적 배경, 인과관계(원인과 결과), 후대에 미친 영향, 체계적인 시대 구분을 서술하세요.\n- keywords: 시대명, 역사적 사건명, 지명, 조약 및 인물을 포함하세요.`,
      en: `\nSince this is a history lecture, strictly follow these rules:\n- keyPoints: Organize chronological events, developmental shifts, and impacts of key figures.\n- details: Describe the historical background, cause-and-effect relationships, lasting impacts, and periodization.\n- keywords: Include era names, historical events, locations, treaties, and figures.`,
      zh: `\n由于这是历史讲座，请严格遵循以下规则：\n- keyPoints：组织按时间顺序发生的事件，发展转变以及关键人物的影响。\n- details：描述历史背景，因果关系，深远影响和分期。\n- keywords：包括时代名称，历史事件，地点，条约和人物。`,
    },

    economics: {
      ko: `\n경제/경영 강의이므로 다음 규칙을 엄격히 따르세요:\n- keyPoints: 거시/미시 모델, 경제 주요 이론, 핵심 재무/경제 지표를 정리하세요.\n- details: 경제 원리의 작동 방식, 시장 변화 사례 분석, 이론의 한계점과 적용 조건을 분석하세요.\n- keywords: 경제/경영 지표, 수식 용어, 기관명 등을 포함하세요.`,
      en: `\nSince this is an economics/business lecture, strictly follow these rules:\n- keyPoints: Summarize macro/micro models, major economic theories, and core financial/economic indicators.\n- details: Analyze how economic principles operate, market shift examples, and the limitations/application conditions of theories.\n- keywords: Include economic/business indicators, formula terms, and institution names.`,
      zh: `\n由于这是经济学/商业讲座，请严格遵循以下规则：\n- keyPoints：总结宏观/微观模型，主要经济理论和核心财务/经济指标。\n- details：分析经济原理如何运作，市场变化示例，以及理论的局限性/应用条件。\n- keywords：包括经济/业务指标，公式术语和机构名称。`,
    },

    law: {
      ko: `\n법학/정책학 강의이므로 다음 규칙을 엄격히 따르세요:\n- keyPoints: 조문의 취지, 핵심 법리, 판례의 요지를 명확히 추출하세요.\n- details: 성립 요건, 예외 규정, 학설의 대립, 그리고 논술형 답안에 적합한 법적 판단 흐름을 상세히 작성하세요.\n- keywords: 주요 법률 용어, 조항 번호, 판례 번호를 포함하세요.`,
      en: `\nSince this is a law/policy lecture, strictly follow these rules:\n- keyPoints: Extract the legislative intent, core legal doctrines, and the gist of precedents.\n- details: Detail the establishment requirements, exception clauses, conflicting theories, and legal judgment flows suitable for essay answers.\n- keywords: Include major legal terms, provision numbers, and precedent citations.`,
      zh: `\n由于这是法律/政策讲座，请严格遵循以下规则：\n- keyPoints：提取立法意图，核心法律学说和判例要旨。\n- details：详细说明成立要求，例外条款，冲突理论以及适合论述题答案的法律判断流程。\n- keywords：包括主要法律术语，条款号和判例引用。`,
    },

    medicine: {
      ko: `\n의학/약학 강의이므로 다음 규칙을 엄격히 따르세요:\n- keyPoints: 주요 질환, 해부학적 구조, 병태생리 기전 및 진단 기준을 우선적으로 정리하세요.\n- details: 임상적 특징, 치료 방법(약물 기전), 부작용 및 금기사항을 체계적으로 기술하세요.\n- keywords: 정확한 의학 표준 용어, 약물 기호 표시를 포함하세요.`,
      en: `\nSince this is a medicine/pharmacy lecture, strictly follow these rules:\n- keyPoints: Prioritize major diseases, anatomical structures, pathophysiological mechanisms, and diagnostic criteria.\n- details: Systematically describe clinical features, treatment methods (drug mechanisms), side effects, and contraindications.\n- keywords: Include precise standard medical terminology and drug symbols.`,
      zh: `\n由于这是医学/药学讲座，请严格遵循以下规则：\n- keyPoints：优先考虑主要疾病，解剖结构，病理生理机制和诊断标准。\n- details：系统描述临床特征，治疗方法（药物机制），副作用和禁忌症。\n- keywords：包括精确的标准医学术语和药物符号。`,
    },
  };

  const extra = categoryExtras[lectureType]?.[language] ?? '';
  return basePrompt + extra;
}

/**
 * System prompt for the chunk phase: extract raw facts/notes from a segment.
 * Deliberately simpler than the full summary prompt to reduce per-chunk cost.
 */
function buildChunkExtractionPrompt(lectureType: LectureType, language: SummaryLanguage, chunkIndex: number, totalChunks: number): string {
  const label = LECTURE_TYPE_LABELS[lectureType] ?? '일반 강의';
  const segmentNote = language === 'ko'
    ? `(이것은 전체 강의의 ${chunkIndex + 1}/${totalChunks} 번째 부분입니다)`
    : language === 'en'
    ? `(This is segment ${chunkIndex + 1} of ${totalChunks} of the full lecture)`
    : `（这是完整讲座的第 ${chunkIndex + 1}/${totalChunks} 部分）`;

  if (language === 'en') {
    return `You are a lecture note extraction assistant. ${segmentNote}\nLecture field: ${label}\n\nExtract the key information from this lecture segment. Output ONLY a JSON object:\n{\n  "topics": ["main topic or concept covered"],\n  "keyPoints": ["important fact or concept 1", "important fact or concept 2"],\n  "details": [{"heading": "subtopic", "content": "explanation"}],\n  "keywords": ["term1", "term2", "term3"]\n}`;
  }
  if (language === 'zh') {
    return `您是讲座笔记提取助手。${segmentNote}\n讲座领域：${label}\n\n从这个讲座片段中提取关键信息。仅输出JSON对象：\n{\n  "topics": ["涵盖的主要主题或概念"],\n  "keyPoints": ["重要事实或概念1", "重要事实或概念2"],\n  "details": [{"heading": "子主题", "content": "说明"}],\n  "keywords": ["术语1", "术语2", "术语3"]\n}`;
  }
  // Default: Korean
  return `당신은 강의 내용 추출 전문가입니다. ${segmentNote}\n강의 분야: ${label}\n\n이 강의 구간에서 핵심 내용을 추출하세요. JSON 형식만 출력하세요:\n{\n  "topics": ["다룬 주요 주제나 개념"],\n  "keyPoints": ["중요한 사실이나 개념 1", "중요한 사실이나 개념 2"],\n  "details": [{"heading": "소주제", "content": "설명"}],\n  "keywords": ["용어1", "용어2", "용어3"]\n}`;
}

/**
 * System prompt for the merge phase: combine chunk extractions into one
 * coherent final summary in the full structured format.
 */
function buildMergePrompt(lectureType: LectureType, language: SummaryLanguage, totalChunks: number): string {
  const label = LECTURE_TYPE_LABELS[lectureType] ?? '일반 강의';
  const fullPrompt = buildSystemPrompt(lectureType, language);

  if (language === 'en') {
    return `${fullPrompt}\n\nIMPORTANT: You are given extracted notes from ${totalChunks} sequential segments of a long lecture (field: ${label}). Synthesize ALL segments into ONE coherent, comprehensive summary. Remove duplicates, maintain the logical flow, and ensure the final output represents the complete lecture, not just one part.`;
  }
  if (language === 'zh') {
    return `${fullPrompt}\n\n重要说明：您将获得一场长讲座（领域：${label}）${totalChunks}个连续片段的提取笔记。将所有片段综合成一个连贯、全面的摘要。删除重复内容，保持逻辑流程，确保最终输出代表完整讲座，而不仅是其中一部分。`;
  }
  return `${fullPrompt}\n\n중요: 긴 강의(분야: ${label})의 ${totalChunks}개 연속 구간에서 추출한 내용이 제공됩니다. 모든 구간을 하나의 일관되고 포괄적인 요약으로 통합하세요. 중복 내용을 제거하고 논리적 흐름을 유지하며, 최종 출력이 전체 강의를 대표하도록 하세요.`;
}

// ── OpenAI call helper ────────────────────────────────────────────────────────

interface OpenAICallOptions {
  systemPrompt: string;
  userContent: string;
  maxTokens?: number;
  timeout?: number;
  label?: string;
}

async function callOpenAI(opts: OpenAICallOptions): Promise<string> {
  const { systemPrompt, userContent, maxTokens = 3000, timeout = 120_000, label = 'openai' } = opts;

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userContent },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        Authorization: `Bearer ${config.openAiKey}`,
        'Content-Type': 'application/json',
      },
      timeout,
    }
  );

  const content: string = response.data.choices[0].message.content;
  console.log(`[summarize/${label}] tokens_used=${response.data.usage?.total_tokens ?? '?'}`);
  return content;
}

// ── Summarization paths ───────────────────────────────────────────────────────

/**
 * Direct path: single OpenAI call for short transcripts (<= DIRECT_PATH_LIMIT).
 * Identical to the original behavior, fully backwards-compatible.
 */
async function summarizeDirect(
  text: string,
  lectureType: LectureType,
  language: SummaryLanguage
): Promise<{ parsed: Record<string, unknown>; rawContent: string }> {
  const systemPrompt = buildSystemPrompt(lectureType, language);
  const userContent = language === 'ko'
    ? `다음 강의 녹취록을 분석하고 JSON 형식으로 요약해 주세요:\n\n${text}`
    : language === 'en'
    ? `Analyze the following lecture transcript and summarize it in JSON format:\n\n${text}`
    : `分析以下讲座录音稿，并以JSON格式总结：\n\n${text}`;

  const rawContent = await callOpenAI({ systemPrompt, userContent, maxTokens: 3000, timeout: 120_000, label: 'direct' });
  const parsed = JSON.parse(rawContent);
  return { parsed, rawContent };
}

interface ChunkExtraction {
  topics:    string[];
  keyPoints: string[];
  details:   { heading: string; content: string }[];
  keywords:  string[];
}

/**
 * Summarize a single chunk and return its extraction.
 * On parse failure, returns a best-effort empty extraction rather than throwing.
 */
async function summarizeChunk(
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  lectureType: LectureType,
  language: SummaryLanguage
): Promise<ChunkExtraction> {
  const fallback: ChunkExtraction = { topics: [], keyPoints: [], details: [], keywords: [] };
  try {
    const systemPrompt = buildChunkExtractionPrompt(lectureType, language, chunkIndex, totalChunks);
    const userContent = language === 'ko'
      ? `강의 구간 ${chunkIndex + 1}/${totalChunks}:\n\n${chunk}`
      : language === 'en'
      ? `Lecture segment ${chunkIndex + 1}/${totalChunks}:\n\n${chunk}`
      : `讲座片段 ${chunkIndex + 1}/${totalChunks}：\n\n${chunk}`;

    const raw = await callOpenAI({
      systemPrompt,
      userContent,
      maxTokens: 1500,
      timeout: 90_000,
      label: `chunk-${chunkIndex + 1}/${totalChunks}`,
    });

    const p = JSON.parse(raw);
    return {
      topics:    Array.isArray(p.topics)    ? p.topics    : [],
      keyPoints: Array.isArray(p.keyPoints) ? p.keyPoints : [],
      details:   Array.isArray(p.details)   ? p.details   : [],
      keywords:  Array.isArray(p.keywords)  ? p.keywords  : [],
    };
  } catch (err: any) {
    console.warn(`[summarize] chunk ${chunkIndex + 1}/${totalChunks} extraction failed: ${err.message}`);
    return fallback;
  }
}

/**
 * Chunked map-reduce path for long transcripts.
 *
 * Phase 1 (Map):   Split transcript → summarize each chunk in parallel (bounded).
 * Phase 2 (Reduce): Feed all chunk extractions to GPT → produce final structured summary.
 */
async function summarizeChunked(
  text: string,
  lectureType: LectureType,
  language: SummaryLanguage
): Promise<{ parsed: Record<string, unknown>; rawContent: string }> {
  const chunks = splitIntoChunks(text);
  console.log(`[summarize] chunked path — ${chunks.length} chunks, total ${text.length} chars`);

  // ── Phase 1: Extract from each chunk in parallel (bounded) ──────────────────
  const extractions = await pooledMap(
    chunks,
    MAX_CONCURRENT,
    (chunk, i) => summarizeChunk(chunk, i, chunks.length, lectureType, language)
  );

  // Filter out empty extractions (failed chunks)
  const successfulExtractions = extractions.filter(
    e => e.keyPoints.length > 0 || e.topics.length > 0 || e.details.length > 0
  );

  if (successfulExtractions.length === 0) {
    throw new Error('All chunk extractions failed — cannot produce summary.');
  }

  console.log(`[summarize] chunk extraction complete — ${successfulExtractions.length}/${chunks.length} successful`);

  // ── Phase 2: Merge all extractions into one final summary ───────────────────
  // Build a compact text representation of the extractions to feed to GPT.
  const extractionSummary = successfulExtractions.map((e, i) => {
    const lines: string[] = [`[Segment ${i + 1}]`];
    if (e.topics.length)    lines.push(`Topics: ${e.topics.join(', ')}`);
    if (e.keyPoints.length) lines.push(`Key Points:\n${e.keyPoints.map(p => `  - ${p}`).join('\n')}`);
    if (e.details.length)   lines.push(`Details:\n${e.details.map(d => `  [${d.heading}] ${d.content}`).join('\n')}`);
    if (e.keywords.length)  lines.push(`Keywords: ${e.keywords.join(', ')}`);
    return lines.join('\n');
  }).join('\n\n---\n\n');

  const mergeSystemPrompt = buildMergePrompt(lectureType, language, successfulExtractions.length);
  const mergeUserContent = language === 'ko'
    ? `다음은 강의 전체에서 추출된 구간별 내용입니다. 이를 종합하여 전체 강의의 JSON 요약을 작성해 주세요:\n\n${extractionSummary}`
    : language === 'en'
    ? `The following are per-segment extractions from the full lecture. Synthesize them into a complete JSON summary:\n\n${extractionSummary}`
    : `以下是完整讲座各片段的提取内容。将其综合成完整的JSON摘要：\n\n${extractionSummary}`;

  // Merge response needs more tokens since it synthesizes many chunks
  const rawContent = await callOpenAI({
    systemPrompt: mergeSystemPrompt,
    userContent:  mergeUserContent,
    maxTokens:    3000,
    timeout:      120_000,
    label:        'merge',
  });

  const parsed = JSON.parse(rawContent);
  return { parsed, rawContent };
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/summarize
 * Summarizes a lecture transcript using OpenAI GPT and suggests a title.
 * Supports lecture-type-specific structured summaries in multiple languages.
 *
 * Short transcripts (<= 20,000 chars): single direct OpenAI call (original path).
 * Long transcripts (> 20,000 chars): chunked map-reduce summarization.
 *
 * Body: { text: string, lectureType?: LectureType, language?: SummaryLanguage }
 * Response: { summary: string, suggestedName: string }
 */
router.post('/', async (req: Request, res: Response) => {
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  const { text, lectureType = 'general', language = 'ko' } = req.body as {
    text?: string;
    lectureType?: LectureType;
    language?: SummaryLanguage;
  };

  if (!text || text.trim().length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty "text" field.' });
    return;
  }

  // Hard safety ceiling: 500,000 chars ≈ ~8 hours of lecture content.
  // Anything beyond this is almost certainly a bug on the sending side.
  if (text.length > 500_000) {
    res.status(400).json({
      error: '텍스트가 너무 깁니다. 강의 녹취록을 나누어 전송해 주세요.',
      lengthChars: text.length,
    });
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

  const isChunked = text.length > DIRECT_PATH_LIMIT;
  console.log(
    `[summarize] POST / — text=${text.length} chars, type=${resolvedType}, lang=${resolvedLanguage}, ` +
    `path=${isChunked ? 'chunked' : 'direct'}`
  );

  try {
    let parsed: Record<string, unknown>;
    let rawContent: string;

    if (isChunked) {
      ({ parsed, rawContent } = await summarizeChunked(text, resolvedType, resolvedLanguage));
    } else {
      ({ parsed, rawContent } = await summarizeDirect(text, resolvedType, resolvedLanguage));
    }

    const suggestedName: string = (typeof parsed.suggestedName === 'string' ? parsed.suggestedName : '').trim().slice(0, 20);

    // Preserve exact response shape expected by mobile app
    const summaryPayload = {
      lectureType:  resolvedType,
      language:     resolvedLanguage,
      overview:     typeof parsed.overview   === 'string' ? parsed.overview   : '',
      keyPoints:    Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      details:      Array.isArray(parsed.details)   ? parsed.details   : [],
      keywords:     Array.isArray(parsed.keywords)  ? parsed.keywords  : [],
      studyTips:    typeof parsed.studyTips  === 'string' ? parsed.studyTips  : '',
    };

    console.log(`[summarize] success — elapsed=${elapsed()}, path=${isChunked ? 'chunked' : 'direct'}`);

    res.json({
      summary:       JSON.stringify(summaryPayload),
      suggestedName,
    });
  } catch (err: any) {
    const detail = err.response?.data ?? err.message;
    const detailStr = typeof detail === 'object' ? JSON.stringify(detail) : String(detail);
    console.error(`[summarize] error — elapsed=${elapsed()}: ${detailStr}`);

    // If it was a JSON parse failure on GPT's response, try returning whatever we got
    if (err instanceof SyntaxError) {
      console.error('[summarize] JSON parse failure from GPT response');
      res.status(500).json({ error: 'AI 응답 파싱에 실패했습니다. 다시 시도해 주세요.' });
      return;
    }

    const status = err.response?.status;
    if (status === 429) {
      res.status(429).json({ error: 'AI 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.' });
      return;
    }
    if (status === 401) {
      res.status(401).json({ error: 'OpenAI API 키가 유효하지 않습니다.' });
      return;
    }

    res.status(500).json({ error: '요약 생성에 실패했습니다.' });
  }
});

export default router;
