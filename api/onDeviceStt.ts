/**
 * onDeviceStt.ts — on-device speech-to-text via whisper.rn (whisper.cpp).
 *
 * STATUS: SCAFFOLD (dependency NOT installed for the 1.0 release).
 *
 * The `whisper.rn` package was removed from package.json before the iOS 1.0
 * launch (on-device STT is deferred). This file is kept intact as the seam so
 * on-device STT can be re-introduced later without rewiring the UI. To re-enable:
 *   1) `npm install whisper.rn` (it is a native module — needs an EAS *dev build*,
 *      NOT Expo Go),
 *   2) provide a GGML model on the device (set EXPO_PUBLIC_WHISPER_MODEL_URL to
 *      download, or bundle one and adjust ensureModelPath),
 *   3) set EXPO_PUBLIC_ONDEVICE_STT=1 so getSttProvider() selects this provider,
 *   4) device testing/tuning for accuracy, speed, battery, and audio format.
 *
 * IMPORTANT: whisper.cpp expects 16 kHz mono WAV. The app records m4a, so a
 * format conversion step is likely required before this will produce good text.
 * That conversion is the main remaining work and must be verified on a device.
 *
 * Because the module isn't installed, the dynamic import below will throw at
 * runtime; getSttProvider() only reaches this path when EXPO_PUBLIC_ONDEVICE_STT
 * is explicitly set, and it falls back to the cloud provider on failure.
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
      // whisper.rn (it is not installed in the 1.0 build); Metro would resolve it
      // at runtime only if the package is re-added. Throws a clear error otherwise.
      const moduleName = 'whisper.rn';
      let whisper: any;
      try {
        whisper = await import(moduleName);
      } catch {
        throw new Error(
          'whisper.rn이 설치되어 있지 않습니다. 온디바이스 STT를 사용하려면 `npm install whisper.rn` 후 개발 빌드가 필요합니다.'
        );
      }
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
