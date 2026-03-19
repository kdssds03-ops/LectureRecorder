import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_KEYS = {
  ASSEMBLYAI: 'assemblyai_key',
  OPENAI: 'openai_key',
};

export async function getApiKey(service: 'assemblyai' | 'openai'): Promise<string> {
  const key = await AsyncStorage.getItem(`${service}_api_key`);
  return key ?? '';
}

export async function setApiKey(service: 'assemblyai' | 'openai', key: string): Promise<void> {
  await AsyncStorage.setItem(`${service}_api_key`, key);
}

/**
 * AssemblyAI를 통한 음성 인식 + 화자 구분
 */
export async function transcribeAudio(audioUri: string): Promise<string> {
  const apiKey = await getApiKey('assemblyai');
  if (!apiKey) {
    throw new Error('AssemblyAI API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해 주세요.');
  }

  // Step 1: Upload audio file
  const response = await fetch(audioUri);
  const blob = await response.blob();

  const uploadRes = await axios.post('https://api.assemblyai.com/v2/upload', blob, {
    headers: {
      authorization: apiKey,
      'Content-Type': 'application/octet-stream',
    },
  });

  const uploadUrl = uploadRes.data.upload_url;

  // Step 2: Start transcription with speaker diarization
  const transcriptRes = await axios.post(
    'https://api.assemblyai.com/v2/transcript',
    {
      audio_url: uploadUrl,
      speaker_labels: true,       // 화자 구분 활성화
      language_code: 'ko',        // 한국어 설정
    },
    {
      headers: { authorization: apiKey },
    }
  );

  const transcriptId = transcriptRes.data.id;

  // Step 3: Poll for completion
  let result = transcriptRes.data;
  while (result.status !== 'completed' && result.status !== 'error') {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const pollingRes = await axios.get(
      `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
      { headers: { authorization: apiKey } }
    );
    result = pollingRes.data;
  }

  if (result.status === 'error') {
    throw new Error('음성 인식에 실패했습니다: ' + result.error);
  }

  // Format with speaker labels
  if (result.utterances && result.utterances.length > 0) {
    return result.utterances
      .map((u: any) => `[화자 ${u.speaker}] ${u.text}`)
      .join('\n\n');
  }

  return result.text || '텍스트를 인식할 수 없습니다.';
}

/**
 * OpenAI GPT를 통한 텍스트 요약
 */
export async function summarizeText(text: string): Promise<string> {
  const apiKey = await getApiKey('openai');
  if (!apiKey) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해 주세요.');
  }

  const res = await axios.post(
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
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return res.data.choices[0].message.content;
}

/**
 * OpenAI GPT를 통한 번역 (한국어 → 영어 / 영어 → 한국어)
 */
export async function translateText(text: string, targetLang: string = 'English'): Promise<string> {
  const apiKey = await getApiKey('openai');
  if (!apiKey) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해 주세요.');
  }

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following text to ${targetLang}. If the source is Korean, translate to English. If it's in English, translate to Korean. Keep the speaker labels if present. Provide only the translation without explanation.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return res.data.choices[0].message.content;
}
