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
    ko: `당신은 대학 강의 노트 전문가입니다. 주어진 강의 녹취록을 분석하여 아래 JSON 형식으로 정확하게 응답하세요.\n강의 분야: ${label}\n\n반드시 아래 JSON 형식만 출력하세요. 다른 텍스트는 절대 포함하지 마세요:\n{\n  "suggestedName": "강의 제목 (20자 이내)",\n  "overview": "이 강의의 핵심 내용을 2~3문장으로 요약",\n  "keyPoints": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],\n  "details": [\n    { "heading": "소주제 제목", "content": "해당 소주제의 상세 설명" }\n  ],\n  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],\n  "studyTips": "이 강의 내용을 효과적으로 학습하기 위한 팁 1~2문장"\n}`,
    en: `You are an expert university lecture note specialist. Analyze the given lecture transcript and respond in the following JSON format.\nLecture Field: ${label}\n\nOutput ONLY the JSON format below. Do not include any other text:\n{\n  "suggestedName": "Lecture Title (max 20 characters)",\n  "overview": "Summary of the lecture's core content in 2-3 sentences",\n  "keyPoints": ["Key Point 1", "Key Point 2", "Key Point 3"],\n  "details": [\n    { "heading": "Subtopic Title", "content": "Detailed explanation of the subtopic" }\n  ],\n  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],\n  "studyTips": "Tips for effectively learning this lecture content in 1-2 sentences"\n}`,
    zh: `您是大学讲座笔记专家。分析给定的讲座录音稿，并以以下JSON格式响应。\n讲座领域：${label}\n\n仅输出以下JSON格式。不包括任何其他文本：\n{\n  "suggestedName": "讲座标题（最多20个字符）",\n  "overview": "讲座核心内容的2-3句总结",\n  "keyPoints": ["关键点1", "关键点2", "关键点3"],\n  "details": [\n    { "heading": "子主题标题", "content": "子主题的详细说明" }\n  ],\n  "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"],\n  "studyTips": "有效学习本讲座内容的提示（1-2句）"\n}`,
  };

  const basePrompt = basePrompts[language] || basePrompts.ko;

  // Category-specific additional instructions (in the selected language)
  const categoryExtras: Partial<Record<LectureType, Partial<Record<SummaryLanguage, string>>>> = {
    math: {
      ko: `\n수학 강의이므로 다음에 특히 주의하세요:\n- keyPoints에 핵심 공식, 정리, 증명 단계를 포함하세요\n- details에 풀이 방법론과 예제 유형을 포함하세요\n- keywords에 수학 용어와 기호를 포함하세요`,
      en: `\nSince this is a mathematics lecture, pay special attention to:\n- Include key formulas, theorems, and proof steps in keyPoints\n- Include solution methodologies and example types in details\n- Include mathematical terms and symbols in keywords`,
      zh: `\n由于这是数学讲座，请特别注意：\n- 在keyPoints中包括关键公式、定理和证明步骤\n- 在details中包括求解方法和例题类型\n- 在keywords中包括数学术语和符号`,
    },

    science: {
      ko: `\n과학 강의이므로 다음에 특히 주의하세요:\n- keyPoints에 핵심 개념, 법칙, 실험 결과를 포함하세요\n- details에 실험 방법과 과학적 원리를 포함하세요\n- keywords에 과학 용어와 단위를 포함하세요`,
      en: `\nSince this is a science lecture, pay special attention to:\n- Include key concepts, laws, and experimental results in keyPoints\n- Include experimental methods and scientific principles in details\n- Include scientific terms and units in keywords`,
      zh: `\n由于这是科学讲座，请特别注意：\n- 在keyPoints中包括关键概念、定律和实验结果\n- 在details中包括实验方法和科学原理\n- 在keywords中包括科学术语和单位`,
    },

    coding: {
      ko: `\n프로그래밍 강의이므로 다음에 특히 주의하세요:\n- keyPoints에 핵심 알고리즘, 자료구조, 패턴을 포함하세요\n- details에 코드 로직과 구현 방법을 포함하세요\n- keywords에 프로그래밍 용어, 함수명, 라이브러리를 포함하세요`,
      en: `\nSince this is a programming lecture, pay special attention to:\n- Include key algorithms, data structures, and patterns in keyPoints\n- Include code logic and implementation methods in details\n- Include programming terms, function names, and libraries in keywords`,
      zh: `\n由于这是编程讲座，请特别注意：\n- 在keyPoints中包括关键算法、数据结构和模式\n- 在details中包括代码逻辑和实现方法\n- 在keywords中包括编程术语、函数名和库`,
    },

    humanities: {
      ko: `\n인문학 강의이므로 다음에 특히 주의하세요:\n- keyPoints에 핵심 사상, 논증, 철학적 개념을 포함하세요\n- details에 주요 논점과 사례를 포함하세요\n- keywords에 철학/인문학 용어와 사상가 이름을 포함하세요`,
      en: `\nSince this is a humanities lecture, pay special attention to:\n- Include key ideas, arguments, and philosophical concepts in keyPoints\n- Include main arguments and examples in details\n- Include humanities/philosophy terms and philosopher names in keywords`,
      zh: `\n由于这是人文学讲座，请特别注意：\n- 在keyPoints中包括关键思想、论证和哲学概念\n- 在details中包括主要论点和例子\n- 在keywords中包括人文学/哲学术语和思想家名字`,
    },

    history: {
      ko: `\n역사 강의이므로 다음에 특히 주의하세요:\n- keyPoints에 핵심 사건, 연도, 인물을 포함하세요\n- details에 역사적 배경과 인과관계를 포함하세요\n- keywords에 역사적 사건명, 인물명, 시대명을 포함하세요`,
      en: `\nSince this is a history lecture, pay special attention to:\n- Include key events, dates, and figures in keyPoints\n- Include historical context and causal relationships in details\n- Include historical event names, figure names, and era names in keywords`,
      zh: `\n由于这是历史讲座，请特别注意：\n- 在keyPoints中包括关键事件、日期和人物\n- 在details中包括历史背景和因果关系\n- 在keywords中包括历史事件名、人物名和时代名`,
    },

    economics: {
      ko: `\n경제/경영 강의이므로 다음에 특히 주의하세요:\n- keyPoints에 핵심 이론, 모델, 경제 지표를 포함하세요\n- details에 경제 원리와 실제 사례를 포함하세요\n- keywords에 경제/경영 용어와 지표를 포함하세요`,
      en: `\nSince this is an economics/business lecture, pay special attention to:\n- Include key theories, models, and economic indicators in keyPoints\n- Include economic principles and real-world examples in details\n- Include economics/business terms and indicators in keywords`,
      zh: `\n由于这是经济学/商业讲座，请特别注意：\n- 在keyPoints中包括关键理论、模型和经济指标\n- 在details中包括经济原理和现实例子\n- 在keywords中包括经济学/商业术语和指标`,
    },

    law: {
      ko: `\n법학 강의이므로 다음에 특히 주의하세요:\n- keyPoints에 핵심 법 조항, 판례, 법적 원칙을 포함하세요\n- details에 법적 요건과 적용 사례를 포함하세요\n- keywords에 법학 용어와 법 조항을 포함하세요`,
      en: `\nSince this is a law lecture, pay special attention to:\n- Include key legal provisions, precedents, and legal principles in keyPoints\n- Include legal requirements and application cases in details\n- Include legal terms and legal provisions in keywords`,
      zh: `\n由于这是法律讲座，请特别注意：\n- 在keyPoints中包括关键法律条款、判例和法律原则\n- 在details中包括法律要求和适用案例\n- 在keywords中包括法律术语和法律条款`,
    },

    medicine: {
      ko: `\n의학/생명과학 강의이므로 다음에 특히 주의하세요:\n- keyPoints에 핵심 의학 개념, 병리, 치료법을 포함하세요\n- details에 해부학적 구조와 생리학적 원리를 포함하세요\n- keywords에 의학 용어와 약물명을 포함하세요`,
      en: `\nSince this is a medicine/life sciences lecture, pay special attention to:\n- Include key medical concepts, pathologies, and treatments in keyPoints\n- Include anatomical structures and physiological principles in details\n- Include medical terms and drug names in keywords`,
      zh: `\n由于这是医学/生命科学讲座，请特别注意：\n- 在keyPoints中包括关键医学概念、病理和治疗方法\n- 在details中包括解剖结构和生理学原理\n- 在keywords中包括医学术语和药物名称`,
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
