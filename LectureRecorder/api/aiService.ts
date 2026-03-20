/**
 * aiService.ts
 *
 * All AI calls go through OUR backend only.
 * No third-party API keys are stored here or on the device.
 *
 * Config stored in AsyncStorage:
 *   backend_url  — e.g. http://localhost:3000  or  https://your-app.up.railway.app
 *   app_secret   — matches APP_SECRET env var on the backend
 */
import axios, { AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Config helpers ────────────────────────────────────────────────────────────

const BACKEND_URL_KEY = 'backend_url';
const APP_SECRET_KEY = 'app_secret';
const DEFAULT_BACKEND_URL = 'http://localhost:3000';

export async function getBackendUrl(): Promise<string> {
  const url = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return url?.trim() || DEFAULT_BACKEND_URL;
}

export async function setBackendUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(BACKEND_URL_KEY, url.trim());
}

export async function getAppSecret(): Promise<string> {
  const secret = await AsyncStorage.getItem(APP_SECRET_KEY);
  return secret?.trim() ?? '';
}

export async function setAppSecret(secret: string): Promise<void> {
  await AsyncStorage.setItem(APP_SECRET_KEY, secret.trim());
}

async function buildHeaders(): Promise<Record<string, string>> {
  return { 'x-app-key': await getAppSecret() };
}

// ── Status checking ───────────────────────────────────────────────────────────
// React Native's XMLHttpRequest does not reliably populate error.response for
// multipart requests on 4xx responses. Using validateStatus:()=>true + manual
// status assertion ensures error.response is always set correctly.

function assertStatus(res: AxiosResponse): void {
  if (res.status >= 200 && res.status < 300) return;
  const err: any = new Error(`HTTP ${res.status}`);
  err.response = { status: res.status, data: res.data }; // always populated
  throw err;
}

// Never throw on any HTTP status — we check manually via assertStatus.
const ACCEPT_ALL = { validateStatus: () => true } as const;

// ── Polling config ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 120; // 6-minute maximum wait

// ── Exported API functions ────────────────────────────────────────────────────
// These keep the exact same signatures as before so detail/[id].tsx is unchanged.

/**
 * Upload audio to backend → backend uploads to AssemblyAI → poll until done.
 * Returns formatted transcript (with [화자 A] labels if available).
 */
export async function transcribeAudio(audioUri: string): Promise<string> {
  const baseUrl = await getBackendUrl();
  const secret = await getAppSecret();

  if (!secret) {
    throw new Error('앱 시크릿 키가 설정되지 않았습니다. 설정 탭에서 입력해 주세요.');
  }

  // Step 1: Upload audio as multipart/form-data to our backend
  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'audio.m4a',
  } as unknown as Blob);

  const uploadRes = await axios.post(
    `${baseUrl}/api/transcribe`,
    formData,
    {
      headers: {
        'x-app-key': secret,
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120_000,
      ...ACCEPT_ALL,
    }
  );
  assertStatus(uploadRes); // throws with populated error.response on 4xx/5xx

  const jobId: string = uploadRes.data?.jobId;
  if (!jobId) throw new Error('음성 인식 작업 ID를 받지 못했습니다.');

  // Step 2: Poll our backend (not AssemblyAI directly)
  const headers = await buildHeaders();
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const pollRes = await axios.get(
      `${baseUrl}/api/transcribe/${jobId}`,
      { headers, timeout: 15_000, ...ACCEPT_ALL }
    );
    assertStatus(pollRes);

    const { status, transcript, error } = pollRes.data as {
      status: 'processing' | 'completed' | 'error';
      transcript?: string;
      error?: string;
    };

    if (status === 'completed' && transcript) return transcript;
    if (status === 'error') throw new Error('음성 인식 실패: ' + (error ?? '알 수 없는 오류'));
    // status === 'processing' → loop
  }

  throw new Error('음성 인식 시간이 초과되었습니다. 더 짧은 녹음을 시도해 주세요.');
}

/**
 * Send transcript text to backend → backend calls OpenAI → return summary.
 */
export async function summarizeText(text: string): Promise<string> {
  const baseUrl = await getBackendUrl();
  const headers = await buildHeaders();

  if (!headers['x-app-key']) {
    throw new Error('앱 시크릿 키가 설정되지 않았습니다. 설정 탭에서 입력해 주세요.');
  }

  const res = await axios.post(
    `${baseUrl}/api/summarize`,
    { text },
    { headers, timeout: 90_000, ...ACCEPT_ALL }
  );
  assertStatus(res);

  return (res.data as { summary: string }).summary;
}

/**
 * Send transcript text to backend → backend calls OpenAI → return translation.
 */
export async function translateText(
  text: string,
  targetLang: string = 'English'
): Promise<string> {
  const baseUrl = await getBackendUrl();
  const headers = await buildHeaders();

  if (!headers['x-app-key']) {
    throw new Error('앱 시크릿 키가 설정되지 않았습니다. 설정 탭에서 입력해 주세요.');
  }

  const res = await axios.post(
    `${baseUrl}/api/translate`,
    { text, targetLang },
    { headers, timeout: 90_000, ...ACCEPT_ALL }
  );
  assertStatus(res);

  return (res.data as { translation: string }).translation;
}
