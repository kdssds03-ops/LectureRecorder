/**
 * onDeviceStt.ts — on-device speech-to-text via whisper.rn (whisper.cpp).
 *
 * STATUS: SCAFFOLD. This compiles, but on-device STT requires:
 *   1) an EAS *development build* (whisper.rn is a native module — NOT Expo Go),
 *   2) a GGML model on the device (set EXPO_PUBLIC_WHISPER_MODEL_URL to download,
 *      or bundle one and adjust ensureModelPath),
 *   3) device testing/tuning for accuracy, speed, battery, and audio format.
 *
 * IMPORTANT: whisper.cpp expects 16 kHz mono WAV. The app records m4a, so a
 * format conversion step is likely required before this will produce good text.
 * That conversion is the main remaining work and must be verified on a device.
 */
import * as FileSystem from 'expo-file-system/legacy';
import type { RecognitionLanguage } from '@/store/useSettingsStore';
import type { SttProvider, TranscribeOptions } from '@/api/sttProvider';

const MODEL_URL = process.env.EXPO_PUBLIC_WHISPER_MODEL_URL ?? '';
const MODEL_FILENAME = 'ggml-whisper-model.bin';

let contextPromise: Promise<any> | null = null;

async function ensureModelPath(): Promise<string> {
  const dir = FileSystem.documentDirectory ?? '';
  const path = `${dir}${MODEL_FILENAME}`;
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) return path;
  if (!MODEL_URL) {
    throw new Error('온디바이스 모델 파일이 없습니다. EXPO_PUBLIC_WHISPER_MODEL_URL을 설정하거나 모델을 번들하세요.');
  }
  const res = await FileSystem.downloadAsync(MODEL_URL, path);
  return res.uri;
}

async function getContext(): Promise<any> {
  if (!contextPromise) {
    contextPromise = (async () => {
      // Lazy import so the native module is only loaded when on-device is enabled.
      // Use a variable specifier so the type checker doesn't statically resolve
      // whisper.rn's exports map (it has no root entry); Metro resolves it at runtime.
      const moduleName = 'whisper.rn';
      const whisper: any = await import(moduleName);
      const filePath = await ensureModelPath();
      return whisper.initWhisper({ filePath, useGpu: true, useCoreMLIos: true });
    })();
  }
  return contextPromise;
}

function whisperLang(l?: RecognitionLanguage): string | undefined {
  if (!l || l === 'auto') return undefined; // let whisper auto-detect
  return l;
}

async function transcribeLocal(uri: string, opts?: TranscribeOptions): Promise<string> {
  const ctx = await getContext();
  // TODO(device): convert m4a → 16kHz mono WAV before transcription for good results.
  const { promise } = ctx.transcribe(uri, { language: whisperLang(opts?.language) });
  const res = await promise;
  return (res?.result ?? '').trim();
}

export const onDeviceSttProvider: SttProvider = {
  id: 'whisper-on-device',
  isOnDevice: true,
  transcribeFile: (uri, opts) => transcribeLocal(uri, opts),
  // Real-time chunking on-device should use whisper.rn realtime APIs; this
  // file-based path is a functional placeholder until tuned on a device.
  transcribeChunk: (uri, opts) => transcribeLocal(uri, opts),
};
