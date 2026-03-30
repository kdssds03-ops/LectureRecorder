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
import { LectureType } from '@/store/useRecordingStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosResponse } from 'axios';

// ── Config helpers ────────────────────────────────────────────────────────────

const BACKEND_URL_KEY = 'backend_url';
const APP_SECRET_KEY = 'app_secret';
const DEVELOPER_MODE_KEY = 'developer_mode';

// EXPO_PUBLIC_BACKEND_URL is safe to embed (not a secret — it's just a URL).
// APP_SECRET is intentionally NOT sourced from an EXPO_PUBLIC_* var.

function normalizeBaseUrl(url: string): string {
  if (!url) return '';
  return url.trim().replace(/\/+$/, '');
}

const DEFAULT_BACKEND_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_BACKEND_URL || '');

export async function getRawBackendOverride(): Promise<string> {
  const url = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return url?.trim() || '';
}

export async function clearBackendOverride(): Promise<void> {
  await AsyncStorage.removeItem(BACKEND_URL_KEY);
}

export async function getDeveloperMode(): Promise<boolean> {
  const val = await AsyncStorage.getItem(DEVELOPER_MODE_KEY);
  return val === 'true';
}

export async function setDeveloperMode(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(DEVELOPER_MODE_KEY, enabled ? 'true' : 'false');
}

export async function getBackendUrl(): Promise<string> {
  console.log(`[Diagnostic] raw env EXPO_PUBLIC_BACKEND_URL: ${process.env.EXPO_PUBLIC_BACKEND_URL}`);
  const isDevMode = await getDeveloperMode();

  if (__DEV__ && isDevMode) {
    const rawOverride = await getRawBackendOverride();
    console.log(`[Diagnostic] raw asyncStorage override: '${rawOverride}'`);
    const normalizedOverride = normalizeBaseUrl(rawOverride);

    // Only use if it's a valid http or https URL
    if (normalizedOverride && (normalizedOverride.startsWith('http://') || normalizedOverride.startsWith('https://'))) {
      console.log(`[Diagnostic] getBackendUrl: resolved baseUrl (override) -> ${normalizedOverride}`);
      return normalizedOverride;
    } else if (rawOverride) {
      console.log(`[Diagnostic] getBackendUrl: ignored invalid override -> ${rawOverride}`);
    }
  }

  console.log(`[Diagnostic] getBackendUrl: resolved baseUrl (default) -> ${DEFAULT_BACKEND_URL}`);
  return DEFAULT_BACKEND_URL;
}

export async function setBackendUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(BACKEND_URL_KEY, normalizeBaseUrl(url));
}

/**
 * Temporary helper for debugging: safely resets the backend configuration
 * to ensure the app uses the environment default.
 */
export async function resetBackendConfigForDebug(): Promise<void> {
  await clearBackendOverride();
  await setDeveloperMode(false);
  console.log('[Diagnostic] Backend config reset: override cleared and developer mode disabled.');
}

export async function getAppSecret(): Promise<string> {
  const secret = await AsyncStorage.getItem(APP_SECRET_KEY);
  const trimmed = secret?.trim();
  // If no secret is set in AsyncStorage, use the default provided by the user
  return trimmed || 'nokkang-secret-key';
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

// Initial wait before the first poll: short because AssemblyAI queues fast and
// short recordings (10–30s) are often done within 3–5s of job submission.
const POLL_INITIAL_DELAY_MS = 1_000;
// Subsequent interval between polls after the first attempt.
const POLL_INTERVAL_MS = 2_000;
// 1500 attempts × 2 s = 50 min max — covers 60-min lecture recordings
// (AssemblyAI typically uses ~15% of audio duration for transcription).
const POLL_MAX_ATTEMPTS = 1_500;

// ── Error classification ──────────────────────────────────────────────────────

/**
 * Maps low-level axios/fetch errors into human-readable, actionable messages.
 * Call this any time a network operation fails instead of bubbling raw `err`.
 */
function classifyNetworkError(err: any, context: string): Error {
  // Already a classified error from assertStatus — preserve it.
  if (err?.response?.status) {
    const status: number = err.response.status;
    const body = JSON.stringify(err.response.data ?? {});
    console.error(`[${context}] HTTP ${status} response body: ${body}`);
    if (status === 413) return new Error(`[${context}] 파일이 너무 큽니다 (413 Payload Too Large).`);
    if (status === 401 || status === 403) return new Error(`[${context}] 인증 실패 (${status}). 앱 시크릿 키를 확인해 주세요.`);
    if (status === 404) return new Error(`[${context}] 엔드포인트를 찾을 수 없습니다 (404).`);
    if (status === 422) return new Error(`[${context}] 잘못된 요청 형식 (422): ${body}`);
    if (status >= 500) return new Error(`[${context}] 서버 오류 (${status}). 잠시 후 다시 시도해 주세요.`);
    return new Error(`[${context}] 요청 실패 (HTTP ${status}): ${body}`);
  }

  const msg: string = err?.message ?? String(err);
  const code: string = err?.code ?? '';
  console.error(`[${context}] 네트워크 오류: code=${code} message=${msg}`);

  if (code === 'ECONNABORTED' || msg.toLowerCase().includes('timeout')) {
    return new Error(`[${context}] 요청 시간이 초과되었습니다. 네트워크 상태를 확인해 주세요.`);
  }
  if (code === 'ERR_NETWORK' || msg === 'Network Error') {
    return new Error(`[${context}] 네트워크에 연결할 수 없습니다. 인터넷 연결을 확인하거나 백엔드 서버 상태를 확인해 주세요.`);
  }
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
    return new Error(`[${context}] 백엔드 서버에 연결할 수 없습니다 (${code}). URL을 확인해 주세요.`);
  }
  return new Error(`[${context}] ${msg}`);
}

/**
 * Validates the resolved backend URL before use.
 * Throws a clear error (not a confusing "Network Error") if the URL is empty or malformed.
 */
function assertBackendUrl(url: string, context: string): void {
  if (!url) {
    console.error(`[${context}] Backend URL is empty! Check EXPO_PUBLIC_BACKEND_URL in .env`);
    throw new Error(`[${context}] 백엔드 URL이 설정되지 않았습니다. .env 파일의 EXPO_PUBLIC_BACKEND_URL을 확인해 주세요.`);
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    console.error(`[${context}] Backend URL is invalid: '${url}'`);
    throw new Error(`[${context}] 백엔드 URL이 올바르지 않습니다: '${url}'`);
  }
  console.log(`[${context}] Backend URL validated: ${url}`);
}

// ── Exported API functions ────────────────────────────────────────────────────
// These keep the exact same signatures as before so detail/[id].tsx is unchanged.

/**
 * Upload audio to backend → backend uploads to AssemblyAI → poll until done.
 * Returns formatted transcript (with [화자 A] labels if available).
 *
 * Timing logs (console only, never shown to users) help identify bottlenecks:
 *   [transcribe] upload started
 *   [transcribe] upload done  Xs  → jobId received
 *   [transcribe] poll #N  Xs elapsed
 *   [transcribe] done  total Xs
 */
export async function transcribeAudio(audioUri: string): Promise<string> {
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  console.log(`[transcribeAudio] ▶ started at ${new Date().toISOString()}`);
  console.log(`[transcribeAudio] EXPO_PUBLIC_BACKEND_URL (raw env): ${process.env.EXPO_PUBLIC_BACKEND_URL}`);

  const baseUrl = await getBackendUrl();
  assertBackendUrl(baseUrl, 'transcribeAudio'); // throws clear error if blank/malformed

  const uploadUrl = `${baseUrl}/api/transcribe/`;
  console.log(`[transcribeAudio] POST endpoint: ${uploadUrl}`);
  console.log(`[transcribeAudio] local file URI: ${audioUri}`);

  const secret = await getAppSecret();
  if (!secret) {
    throw new Error('앱 시크릿 키가 설정되지 않았습니다. 설정 탭에서 입력해 주세요.');
  }

  // ── Step 1: Upload audio as multipart/form-data ──────────────────────────────
  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'audio.m4a',
  } as unknown as Blob);

  console.log(`[transcribeAudio] upload start | uri=${audioUri} | ${new Date().toISOString()}`);
  let uploadRes;
  try {
    uploadRes = await axios.post(
      uploadUrl,
      formData,
      {
        headers: {
          'x-app-key': secret,
          'Content-Type': 'multipart/form-data',
        },
        // 5 min upload timeout — large files on slow connections need headroom
        timeout: 300_000,
        ...ACCEPT_ALL,
      }
    );
    assertStatus(uploadRes);
  } catch (err: any) {
    const classified = classifyNetworkError(err, 'transcribeAudio/upload');
    console.error(`[transcribeAudio] upload FAILED at ${elapsed()}: ${classified.message}`);
    throw classified;
  }

  const jobId: string = uploadRes.data?.jobId;
  if (!jobId) throw new Error('[transcribeAudio] 음성 인식 작업 ID를 받지 못했습니다. 서버 응답: ' + JSON.stringify(uploadRes.data));
  console.log(`[transcribeAudio] upload done at ${elapsed()} → jobId: ${jobId}`);

  // ── Step 2: Poll until done ──────────────────────────────────────────────────
  // Poll at 2 s intervals for up to 50 min (1 500 attempts).
  // This is sufficient for an AssemblyAI transcription of a 60-min lecture
  // (AssemblyAI targets ~15 % of audio duration).
  const headers = await buildHeaders();
  let delay = POLL_INITIAL_DELAY_MS;

  console.log(`[transcribeAudio] polling start | max ${POLL_MAX_ATTEMPTS} attempts × ${POLL_INTERVAL_MS}ms`);

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    delay = POLL_INTERVAL_MS;

    // Log every 30 attempts (~1 min) to keep logs readable for long recordings
    if (attempt % 30 === 0) {
      console.log(`[transcribeAudio] poll #${attempt + 1} | ${elapsed()}`);
    }

    let pollRes;
    try {
      pollRes = await axios.get(
        `${baseUrl}/api/transcribe/${jobId}`,
        { headers, timeout: 20_000, ...ACCEPT_ALL }
      );
      assertStatus(pollRes);
    } catch (err: any) {
      const classified = classifyNetworkError(err, `transcribeAudio/poll#${attempt + 1}`);
      // Transient poll errors: warn and retry rather than aborting the whole job
      console.warn(`[transcribeAudio] poll #${attempt + 1} transient error: ${classified.message} — retrying`);
      continue;
    }

    const { status, transcript, error } = pollRes.data as {
      status: 'processing' | 'completed' | 'error';
      transcript?: string;
      error?: string;
    };

    if (status === 'completed' && transcript) {
      console.log(`[transcribeAudio] ✅ completed — total ${elapsed()}`);
      return transcript;
    }
    if (status === 'error') {
      console.error(`[transcribeAudio] job error after ${elapsed()}: ${error}`);
      throw new Error('음성 인식 실패: ' + (error ?? '알 수 없는 오류'));
    }
    // status === 'processing' → continue
  }

  console.error(`[transcribeAudio] polling timeout after ${elapsed()} (${POLL_MAX_ATTEMPTS} attempts)`);
  throw new Error(`음성 인식 시간이 초과되었습니다 (${elapsed()}). 녹음이 너무 길거나 서버가 응답하지 않습니다.`);
}

/**
 * Quick transcription for real-time updates (30s chunks).
 * Returns the text directly.
 * Polling timeout extended to 45s for reliability.
 */
export async function quickTranscribe(audioUri: string): Promise<string> {
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  const baseUrl = await getBackendUrl();
  try {
    assertBackendUrl(baseUrl, 'quickTranscribe');
  } catch (urlErr: any) {
    console.error(`[quickTranscribe] invalid backend URL, skipping chunk: ${urlErr.message}`);
    return '';
  }

  const secret = await getAppSecret();
  if (!secret) {
    console.error('[quickTranscribe] no app secret — skipping chunk');
    return '';
  }

  console.log(`[quickTranscribe] ▶ uri=${audioUri} | endpoint=${baseUrl}/api/transcribe/quick`);

  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'quick_audio.m4a',
  } as unknown as Blob);

  try {
    const res = await axios.post(
      `${baseUrl}/api/transcribe/quick`,
      formData,
      {
        headers: {
          'x-app-key': secret,
          'Content-Type': 'multipart/form-data',
        },
        // 90 s — chunk transcriptions go through AssemblyAI; allow extra headroom
        timeout: 90_000,
        ...ACCEPT_ALL,
      }
    );
    assertStatus(res);
    const text = res.data.text ?? '';
    console.log(`[quickTranscribe] ✅ done in ${elapsed()} | chars=${text.length}`);
    return text;
  } catch (err: any) {
    const classified = classifyNetworkError(err, 'quickTranscribe');
    // Warn (not error) — chunk failures are non-fatal and will be retried by the queue.
    console.warn(`[quickTranscribe] failed after ${elapsed()}: ${classified.message}`);
    if (err?.response?.data) {
      console.warn(`[quickTranscribe] server response body: ${JSON.stringify(err.response.data)}`);
    }
    return ''; // Non-fatal: real-time chunk failures degrade gracefully
  }
}

/**
 * Send transcript text to backend → backend calls OpenAI → return summary + suggested title.
 * Returns { summary, suggestedName } where suggestedName is a concise title (≤20 chars).
 * lectureType is passed to the backend to generate category-specific summaries.
 */
export async function summarizeText(
  text: string,
  lectureType: LectureType = 'general',
  language: string = 'ko'
): Promise<{ summary: string; suggestedName: string }> {
  const baseUrl = await getBackendUrl();
  const headers = await buildHeaders();

  if (!headers['x-app-key']) {
    throw new Error('앱 시크릿 키가 설정되지 않았습니다. 설정 탭에서 입력해 주세요.');
  }

  const res = await axios.post(
    `${baseUrl}/api/summarize`,
    { text, lectureType, language },
    // Chunked path for long lectures can take several minutes on the backend;
    // 5 min gives enough headroom even for 60-min recordings.
    { headers, timeout: 300_000, ...ACCEPT_ALL }
  );
  assertStatus(res);

  const data = res.data as { summary: string; suggestedName?: string };
  return {
    summary: data.summary,
    suggestedName: data.suggestedName ?? '',
  };
}

/**
 * Send transcript text to backend → backend calls OpenAI → return translation.
 */
export async function translateText(
  text: string,
  targetLang: string = 'en'
): Promise<string> {
  // Map language codes to full language names for OpenAI
  const langMap: Record<string, string> = {
    'en': 'English',
    'ko': 'Korean',
    'ja': 'Japanese',
    'zh': 'Chinese',
    'es': 'Spanish',
    'fr': 'French',
  };
  const fullLangName = langMap[targetLang] || 'English';
  const baseUrl = await getBackendUrl();
  const headers = await buildHeaders();

  if (!headers['x-app-key']) {
    throw new Error('앱 시크릿 키가 설정되지 않았습니다. 설정 탭에서 입력해 주세요.');
  }

  const res = await axios.post(
    `${baseUrl}/api/translate`,
    { text, targetLang: fullLangName },
    { headers, timeout: 90_000, ...ACCEPT_ALL }
  );
  assertStatus(res);

  return (res.data as { translation: string }).translation;
}

/**
 * Send text to backend → backend calls OpenAI → return short title string.
 */
export async function generateRecordingTitle(text: string): Promise<string> {
  console.log('[Diagnostic] generateRecordingTitle: resolving backend URL');
  const baseUrl = await getBackendUrl();
  const headers = await buildHeaders();

  if (!headers['x-app-key']) {
    console.log('[Diagnostic] generateRecordingTitle failed: No app secret');
    throw new Error('앱 시크릿 키가 설정되지 않았습니다. 설정 탭에서 입력해 주세요.');
  }

  const endpoint = `${baseUrl}/api/title`;
  console.log(`[Diagnostic] generateRecordingTitle: POST ${endpoint}`);

  const res = await axios.post(
    endpoint,
    { text },
    { headers, timeout: 30_000, ...ACCEPT_ALL }
  );

  console.log(`[Diagnostic] generateRecordingTitle: HTTP ${res.status}`);
  if (res.status !== 200) {
    console.log(`[Diagnostic] generateRecordingTitle error response: ${JSON.stringify(res.data)}`);
  }

  assertStatus(res);

  const finalTitle = (res.data as { title: string }).title;
  console.log(`[Diagnostic] generateRecordingTitle success: '${finalTitle}'`);
  return finalTitle;
}
