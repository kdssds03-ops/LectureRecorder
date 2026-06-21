/**
 * sttProvider.ts — speech-to-text provider seam.
 *
 * All transcription should go through getSttProvider() so the underlying engine
 * can be swapped without touching UI code. Today this returns the cloud provider
 * (AssemblyAI via our backend). To move to on-device STT later (see
 * ON_DEVICE_STT_PLAN.md), implement an on-device provider and return it here.
 */
import { quickTranscribe, transcribeAudio } from '@/api/aiService';
import { RecognitionLanguage } from '@/store/useSettingsStore';

export interface TranscribeOptions {
  language?: RecognitionLanguage;
  diarize?: boolean;
}

export interface SttProvider {
  id: string;
  /** True if transcription runs locally (no network, no server-side metering). */
  isOnDevice: boolean;
  /** Full-file transcription (post-recording or imported audio). */
  transcribeFile: (uri: string, opts?: TranscribeOptions) => Promise<string>;
  /** Short real-time chunk transcription during recording. */
  transcribeChunk: (uri: string, opts?: TranscribeOptions) => Promise<string>;
}

export const cloudSttProvider: SttProvider = {
  id: 'assemblyai-cloud',
  isOnDevice: false,
  transcribeFile: (uri, opts) =>
    transcribeAudio(uri, opts?.language ?? 'auto', opts?.diarize ?? false),
  transcribeChunk: (uri, opts) => quickTranscribe(uri, opts?.language ?? 'auto'),
};

/**
 * Returns the active STT provider. Swap point for on-device migration.
 * (Could later read a feature flag / device capability check.)
 */
export function getSttProvider(): SttProvider {
  // On-device is opt-in via env flag. Lazy require keeps the native module out of
  // the bundle (and out of Expo Go) unless explicitly enabled.
  if (process.env.EXPO_PUBLIC_ONDEVICE_STT === '1') {
    try {
      const { onDeviceSttProvider } = require('@/api/onDeviceStt') as typeof import('@/api/onDeviceStt');
      return onDeviceSttProvider;
    } catch (e) {
      console.warn('[stt] on-device provider unavailable, falling back to cloud:', e);
    }
  }
  return cloudSttProvider;
}
