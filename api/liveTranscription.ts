/**
 * Real-time (streaming) transcription with speaker diarization via AssemblyAI
 * Universal Streaming v3. The app captures mic PCM frames (base64) and streams
 * them over a WebSocket; the server returns partial + final "Turn" messages with
 * per-word speaker labels and timestamps.
 *
 * NOTE: This powers the EXPERIMENTAL live screen. The production recorder is
 * unchanged. Requires the `react-native-live-audio-stream` native module and a
 * development build (not Expo Go).
 */
import { getStreamToken } from './aiService';

const STREAM_BASE_URL = 'wss://streaming.assemblyai.com/v3/ws';

export interface LiveSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

interface LiveCallbacks {
  onOpen?: () => void;
  onPartial?: (text: string) => void;
  onSegment?: (seg: LiveSegment) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}

// ── base64 <-> bytes ──────────────────────────────────────────────────────────
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = (() => {
  const t: Record<string, number> = {};
  for (let i = 0; i < B64_CHARS.length; i++) t[B64_CHARS[i]] = i;
  return t;
})();

export function base64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const byteLen = Math.floor((len * 3) / 4) - pad;
  const bytes = new Uint8Array(byteLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = B64_LOOKUP[clean[i]] ?? 0;
    const e2 = B64_LOOKUP[clean[i + 1]] ?? 0;
    const e3 = B64_LOOKUP[clean[i + 2]] ?? 0;
    const e4 = B64_LOOKUP[clean[i + 3]] ?? 0;
    if (p < byteLen) bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < byteLen) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < byteLen) bytes[p++] = ((e3 & 3) << 6) | e4;
  }
  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;
    out += B64_CHARS[b1 >> 2];
    out += B64_CHARS[((b1 & 3) << 4) | (b2 >> 4)];
    out += i + 1 < len ? B64_CHARS[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    out += i + 2 < len ? B64_CHARS[b3 & 63] : '=';
  }
  return out;
}

/** Wrap raw PCM16 mono data in a WAV container and return base64 (for saving). */
export function pcmChunksToWavBase64(chunks: Uint8Array[], sampleRate: number): string {
  let dataLen = 0;
  for (const c of chunks) dataLen += c.length;
  const buffer = new Uint8Array(44 + dataLen);
  const view = new DataView(buffer.buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  const byteRate = sampleRate * 2; // mono, 16-bit
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);   // PCM
  view.setUint16(22, 1, true);   // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true);   // block align
  view.setUint16(34, 16, true);  // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);
  let off = 44;
  for (const c of chunks) { buffer.set(c, off); off += c.length; }
  return uint8ArrayToBase64(buffer);
}

// ── Live transcriber ──────────────────────────────────────────────────────────
export class LiveTranscriber {
  private ws: WebSocket | null = null;
  private cb: LiveCallbacks;

  constructor(cb: LiveCallbacks) {
    this.cb = cb;
  }

  async connect(sampleRate = 16000): Promise<void> {
    const token = await getStreamToken();
    const params = new URLSearchParams({
      token,
      sample_rate: String(sampleRate),
      encoding: 'pcm_s16le',
      speech_model: 'u3-rt-pro',
      speaker_labels: 'true',
      format_turns: 'true',
    });
    const ws = new WebSocket(`${STREAM_BASE_URL}?${params.toString()}`);
    // @ts-ignore — RN WebSocket supports binaryType
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => this.cb.onOpen?.();
    ws.onmessage = (e: any) => this.handleMessage(e.data);
    ws.onerror = () => this.cb.onError?.('실시간 전사 연결 오류가 발생했습니다.');
    ws.onclose = () => this.cb.onClose?.();
  }

  private handleMessage(data: any): void {
    if (typeof data !== 'string') return; // control/info messages arrive as JSON text
    let msg: any;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.type !== 'Turn') return;

    const words: any[] = Array.isArray(msg.words) ? msg.words : [];
    const text: string = msg.transcript ?? '';

    if (!msg.end_of_turn) {
      this.cb.onPartial?.(text);
      return;
    }

    const startMs = words.length ? Math.round(words[0].start ?? 0) : 0;
    const endMs = words.length ? Math.round(words[words.length - 1].end ?? startMs) : startMs;

    // Determine the dominant speaker label among the turn's words, if available.
    let speaker: string | undefined;
    const counts: Record<string, number> = {};
    for (const w of words) {
      if (w && w.speaker != null) {
        const k = String(w.speaker);
        counts[k] = (counts[k] ?? 0) + 1;
      }
    }
    const keys = Object.keys(counts);
    if (keys.length) speaker = keys.sort((a, b) => counts[b] - counts[a])[0];

    if (text.trim()) {
      this.cb.onSegment?.({ startMs, endMs, text: text.trim(), speaker });
    }
    this.cb.onPartial?.('');
  }

  sendBase64Pcm(b64: string): void {
    if (!this.ws || this.ws.readyState !== 1) return;
    try {
      const bytes = base64ToUint8Array(b64);
      this.ws.send(bytes.buffer);
    } catch {
      // drop frame on encode error — non-fatal
    }
  }

  async close(): Promise<void> {
    try {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({ type: 'Terminate' }));
      }
    } catch {
      // ignore
    }
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }
}
