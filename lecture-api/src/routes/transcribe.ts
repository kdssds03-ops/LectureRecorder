import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { config } from '../config';
import { enforce, linkJob, countJobOnce, addSeconds } from '../usage';

const router = Router();

/**
 * Concatenate multiple audio chunk files into a single .m4a using ffmpeg.
 * Re-encodes to AAC for container-safe concatenation across chunk boundaries.
 */
function concatToM4a(inputPaths: string[], outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg binary not available'));
      return;
    }
    const listPath = `${outPath}.txt`;
    const listContent = inputPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(listPath, listContent);
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'aac', '-b:a', '128k', outPath];
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      fs.unlink(listPath, () => {});
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function deviceIdOf(req: Request): string {
  const h = req.headers['x-device-id'];
  return (Array.isArray(h) ? h[0] : h) || req.ip || '';
}
type RecognitionLanguage = 'auto' | 'ko' | 'en' | 'zh';
const RECOGNITION_LANGUAGE_VALUES: ReadonlyArray<RecognitionLanguage> = ['auto', 'ko', 'en', 'zh'];

// ── Disk-based storage ────────────────────────────────────────────────────────
// CRITICAL: Do NOT use memoryStorage() on Railway — the entire file would be
// buffered into the process heap. On a 512 MB container, a single large upload
// can OOM-kill the process, causing Railway to return 503 for all subsequent
// requests until the container restarts.
//
// With diskStorage, multer streams the incoming multipart body directly to a
// temp file on disk. We then stream that file to AssemblyAI with createReadStream,
// keeping peak RAM at the HTTP chunk size instead of the full file size.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, _file, cb) =>
      cb(null, `lecture-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`),
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB ceiling
    fieldSize: 1024 * 1024,       // 1 MB for non-file fields
  },
});

// ── Multer error handling middleware ───────────────────────────────────────────
// Wraps multer's single-file upload so that multer-specific errors (payload too
// large, unexpected field, etc.) return clean JSON instead of falling through to
// Express's generic error handler.
function uploadSingle(fieldName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const mw = upload.single(fieldName);
    mw(req, res, (err: any) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        console.warn(`[transcribe] multer error: code=${err.code} field=${err.field} message=${err.message}`);
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error: '파일이 너무 큽니다. 500 MB 이하의 오디오 파일을 사용해 주세요.',
            phase: 'upload_validation',
            code: 'LIMIT_FILE_SIZE',
          });
          return;
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          res.status(400).json({
            error: '잘못된 필드 이름입니다. "audio" 필드에 파일을 첨부해 주세요.',
            phase: 'upload_validation',
            code: 'LIMIT_UNEXPECTED_FILE',
          });
          return;
        }
        res.status(400).json({
          error: `업로드 오류: ${err.message}`,
          phase: 'upload_validation',
          code: err.code,
        });
        return;
      }

      // Non-multer error (e.g. invalid multipart boundary)
      console.error('[transcribe] multipart parse error:', err.message ?? err);
      res.status(400).json({
        error: '잘못된 multipart 요청입니다.',
        phase: 'upload_validation',
        detail: err.message ?? String(err),
      });
    });
  };
}

/** Multipart wrapper for multiple files under one field, with clean JSON errors. */
function uploadArray(fieldName: string, maxCount: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const mw = upload.array(fieldName, maxCount);
    mw(req, res, (err: any) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        res.status(status).json({ error: `업로드 오류: ${err.message}`, code: err.code, phase: 'upload_validation' });
        return;
      }
      res.status(400).json({ error: '잘못된 multipart 요청입니다.', detail: err.message ?? String(err) });
    });
  };
}

/** Safely delete a temp file. Logs a warning on unexpected failure, never throws. */
function cleanupTempFile(filePath: string | undefined): void {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.warn(`[transcribe] cleanup: could not delete ${filePath} — ${err.message}`);
    } else if (!err) {
      console.log(`[transcribe] cleanup: deleted temp file ${filePath}`);
    }
  });
}

/**
 * Calculates a reasonable upload timeout based on file size.
 * - Base: 60 s (enough for small files / slow cold-start).
 * - Linear: +60 s per 50 MB (≈ 833 KB/s worst-case upload speed).
 * - Cap: 10 minutes — Railway's own proxy timeout may be shorter,
 *   but we let Express be generous and allow Railway to enforce its limit.
 */
function uploadTimeoutMs(fileSizeBytes: number): number {
  const BASE_MS  = 60_000;
  const PER_50MB = 60_000;
  const MAX_MS   = 600_000; // 10 min
  const extra = Math.ceil(fileSizeBytes / (50 * 1024 * 1024)) * PER_50MB;
  return Math.min(BASE_MS + extra, MAX_MS);
}

function normalizeRecognitionLanguage(input: unknown): RecognitionLanguage {
  if (typeof input !== 'string') return 'auto';
  const normalized = input.trim().toLowerCase();
  if (!normalized) return 'auto';
  return RECOGNITION_LANGUAGE_VALUES.includes(normalized as RecognitionLanguage)
    ? (normalized as RecognitionLanguage)
    : 'auto';
}

function resolveRecognitionLanguage(req: Request): RecognitionLanguage {
  const queryLanguage = Array.isArray(req.query.language)
    ? req.query.language[0]
    : req.query.language;
  const bodyLanguage = (req.body as { language?: unknown } | undefined)?.language;
  // Query param takes precedence; fall back to multipart field.
  return normalizeRecognitionLanguage(queryLanguage ?? bodyLanguage);
}

/**
 * POST /api/transcribe
 * Receives audio from the app, streams it to AssemblyAI, returns a jobId.
 *
 * Body: multipart/form-data with field "audio"
 * Query: diarize=true (optional)
 * Response: { jobId: string }
 */
router.post('/', uploadSingle('audio'), async (req: Request, res: Response) => {
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  console.log(`[transcribe] POST / — incoming upload request`);

  if (!req.file) {
    console.warn(`[transcribe] POST / — rejected: no audio file in request body`);
    res.status(400).json({
      error: 'No audio file provided. Use field name "audio".',
      phase: 'upload_validation',
    });
    return;
  }

  const { originalname, mimetype, size, path: tmpPath } = req.file;
  const deviceId = deviceIdOf(req);
  const gate = await enforce(deviceId);
  if (!gate.allowed) {
    cleanupTempFile(tmpPath);
    res.status(402).json({ error: '이번 달 무료 사용량을 모두 사용했습니다. 프리미엄으로 업그레이드해 주세요.', reason: gate.reason });
    return;
  }
  const recognitionLanguage = resolveRecognitionLanguage(req);
  const useLanguageDetection = recognitionLanguage === 'auto';
  console.log(
    `[transcribe] file received — name=${originalname}, mime=${mimetype}, ` +
    `size=${size} bytes (${(size / 1024 / 1024).toFixed(2)} MB), tmpPath=${tmpPath}`
  );

  // Verify the temp file actually exists and has content
  try {
    const stat = fs.statSync(tmpPath);
    console.log(`[transcribe] temp file verified — disk size=${stat.size} bytes`);
  } catch (statErr: any) {
    console.error(`[transcribe] temp file stat FAILED — ${statErr.message}`);
    res.status(500).json({
      error: '서버에 파일 저장에 실패했습니다.',
      phase: 'temp_file_verification',
    });
    return;
  }

  const diarize = req.query.diarize === 'true';
  const timeout = uploadTimeoutMs(size);

  // Step 1: Stream temp file → AssemblyAI upload endpoint
  console.log(
    `[transcribe] AssemblyAI upload starting — diarize=${diarize}, ` +
    `timeout=${(timeout / 1000).toFixed(0)}s, elapsed=${elapsed()}`
  );

  let audioUrl: string;
  try {
    const fileStream = fs.createReadStream(tmpPath);
    const uploadRes = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      fileStream,
      {
        headers: {
          authorization: config.assemblyAiKey,
          'Content-Type': 'application/octet-stream',
          'Transfer-Encoding': 'chunked',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout,
      }
    );
    audioUrl = uploadRes.data.upload_url;
    console.log(`[transcribe] AssemblyAI upload SUCCESS — elapsed=${elapsed()}, upload_url=${audioUrl}`);
  } catch (uploadErr: any) {
    const status = uploadErr.response?.status;
    const detail = uploadErr.response?.data ?? uploadErr.message;
    const code   = uploadErr.code ?? '';
    console.error(
      `[transcribe] AssemblyAI upload FAILED — elapsed=${elapsed()}, ` +
      `HTTP ${status ?? 'n/a'}, code=${code}:`,
      typeof detail === 'object' ? JSON.stringify(detail) : detail
    );
    cleanupTempFile(tmpPath);

    // Distinguish timeout from other failures
    if (code === 'ECONNABORTED' || (uploadErr.message ?? '').toLowerCase().includes('timeout')) {
      res.status(504).json({
        error: 'AssemblyAI 업로드 시간이 초과되었습니다. 파일이 매우 클 수 있습니다.',
        phase: 'assemblyai_upload',
        code: 'UPLOAD_TIMEOUT',
      });
      return;
    }
    res.status(502).json({
      error: 'AssemblyAI 업로드에 실패했습니다.',
      phase: 'assemblyai_upload',
      httpStatus: status,
      detail: typeof detail === 'object' ? JSON.stringify(detail) : String(detail),
    });
    return;
  }

  // Temp file is no longer needed — AssemblyAI has it now.
  cleanupTempFile(tmpPath);

  // Step 2: Submit transcription job
  console.log(`[transcribe] submitting transcription job — elapsed=${elapsed()}`);

  let jobId: string;
  try {
    const jobBody: Record<string, unknown> = {
      audio_url: audioUrl,
      // `speech_model` (singular string) was deprecated and now causes HTTP 400/500.
      // The current API shape uses `speech_models` (plural) as a string array.
      speech_models: ['universal-3-pro', 'universal-2'],
      speaker_labels: diarize,
      ...(useLanguageDetection
        ? { language_detection: true }
        : { language_detection: false, language_code: recognitionLanguage }),
    };
    const transcriptRes = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      jobBody,
      {
        headers: { authorization: config.assemblyAiKey },
        timeout: 15_000,
      }
    );
    jobId = transcriptRes.data.id;
    console.log(`[transcribe] job created SUCCESS — elapsed=${elapsed()}, jobId=${jobId}`);
  } catch (jobErr: any) {
    const status = jobErr.response?.status;
    const detail = jobErr.response?.data ?? jobErr.message;
    const detailStr = typeof detail === 'object' ? JSON.stringify(detail) : String(detail);
    console.error(
      `[transcribe] AssemblyAI job create FAILED — elapsed=${elapsed()}, HTTP ${status ?? 'n/a'}: ${detailStr}`
    );
    res.status(502).json({
      error: '음성 인식 작업 생성에 실패했습니다.',
      phase: 'assemblyai_job_create',
      httpStatus: status,
      detail: detailStr,
    });
    return;
  }

  console.log(`[transcribe] POST / complete — elapsed=${elapsed()}, jobId=${jobId}`);
  await linkJob(jobId, deviceId);
  res.json({ jobId });
});

/**
 * POST /api/transcribe/quick
 * Quick transcription for real-time updates (30s chunks).
 * Returns the text directly after polling.
 *
 * Polling: 90 attempts × 1 s = 90 s max. This covers worst-case queue delays
 * on AssemblyAI for short chunks.
 */
router.post('/quick', uploadSingle('audio'), async (req: Request, res: Response) => {
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  console.log(`[transcribe/quick] POST /quick — incoming`);

  if (!req.file) {
    console.warn(`[transcribe/quick] rejected: no audio file`);
    res.status(400).json({
      error: 'No audio file provided.',
      phase: 'upload_validation',
    });
    return;
  }

  const { originalname, mimetype, size, path: tmpPath } = req.file;
  const deviceId = deviceIdOf(req);
  const gate = await enforce(deviceId);
  if (!gate.allowed) {
    cleanupTempFile(tmpPath);
    res.status(402).json({ error: '이번 달 무료 사용량을 모두 사용했습니다.', reason: gate.reason });
    return;
  }
  const recognitionLanguage = resolveRecognitionLanguage(req);
  const useLanguageDetection = recognitionLanguage === 'auto';
  console.log(
    `[transcribe/quick] file — name=${originalname}, mime=${mimetype}, ` +
    `size=${size} bytes (${(size / 1024 / 1024).toFixed(2)} MB), tmpPath=${tmpPath}`
  );

  try {
    // Upload via stream
    console.log(`[transcribe/quick] uploading to AssemblyAI...`);
    const fileStream = fs.createReadStream(tmpPath);
    const uploadRes = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      fileStream,
      {
        headers: {
          authorization: config.assemblyAiKey,
          'Content-Type': 'application/octet-stream',
          'Transfer-Encoding': 'chunked',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60_000, // 60 s — generous for a ≤30 s chunk
      }
    );
    const audioUrl = uploadRes.data.upload_url;
    console.log(`[transcribe/quick] upload done — elapsed=${elapsed()}, upload_url=${audioUrl}`);
    cleanupTempFile(tmpPath);

    // Submit with fast model
    console.log(`[transcribe/quick] creating transcription job...`);
    const transcriptRes = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: audioUrl,
        speech_models: ['universal-2'],
        ...(useLanguageDetection
          ? { language_detection: true }
          : { language_detection: false, language_code: recognitionLanguage }),
      },
      {
        headers: { authorization: config.assemblyAiKey },
        timeout: 15_000,
      }
    );
    const jobId = transcriptRes.data.id;
    console.log(`[transcribe/quick] job created — elapsed=${elapsed()}, jobId=${jobId}`);

    // Poll — 90 attempts × 1 s = 90 s max (up from 45 s)
    const QUICK_POLL_MAX = 90;
    for (let i = 0; i < QUICK_POLL_MAX; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const pollRes = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${jobId}`,
          { headers: { authorization: config.assemblyAiKey }, timeout: 10_000 }
        );
        if (pollRes.data.status === 'completed') {
          console.log(`[transcribe/quick] completed on poll #${i + 1} — total ${elapsed()}`);
          await addSeconds(deviceId, pollRes.data.audio_duration ?? 0);
          res.json({ text: pollRes.data.text ?? '' });
          return;
        }
        if (pollRes.data.status === 'error') {
          console.error(`[transcribe/quick] AssemblyAI error on poll #${i + 1}: ${pollRes.data.error}`);
          res.json({ text: '' });
          return;
        }
      } catch (pollErr: any) {
        // Transient poll failure — log and retry rather than aborting
        console.warn(
          `[transcribe/quick] poll #${i + 1} transient error: ` +
          `${pollErr.response?.status ?? pollErr.code ?? pollErr.message} — retrying`
        );
        continue;
      }
    }

    console.warn(`[transcribe/quick] polling timed out after ${QUICK_POLL_MAX}s (${elapsed()}) — returning empty text`);
    res.json({ text: '' });
  } catch (err: any) {
    const status = err.response?.status;
    const detail = err.response?.data ?? err.message;
    const detailStr = typeof detail === 'object' ? JSON.stringify(detail) : String(detail);
    console.error(`[transcribe/quick] unhandled error — elapsed=${elapsed()}, HTTP ${status ?? 'n/a'}: ${detailStr}`);
    cleanupTempFile(tmpPath);
    // Return empty text with 200 so real-time flow degrades gracefully
    res.status(200).json({ text: '' });
  }
});

/**
 * POST /api/transcribe/diarize
 * Accepts the recording's chunk files (field "audio", possibly many), merges them
 * into one continuous file with ffmpeg, then runs a single AssemblyAI transcription
 * with speaker_labels so speaker numbering stays consistent across the whole lecture.
 * Returns { jobId }; poll GET /:jobId for the diarized transcript + utterances.
 */
router.post('/diarize', uploadArray('audio', 400), async (req: Request, res: Response) => {
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    res.status(400).json({ error: 'No audio files provided. Use field name "audio".', phase: 'upload_validation' });
    return;
  }

  const deviceId = deviceIdOf(req);
  const gate = await enforce(deviceId);
  if (!gate.allowed) {
    files.forEach((f) => cleanupTempFile(f.path));
    res.status(402).json({ error: '이번 달 무료 사용량을 모두 사용했습니다. 프리미엄으로 업그레이드해 주세요.', reason: gate.reason });
    return;
  }

  const recognitionLanguage = resolveRecognitionLanguage(req);
  const useLanguageDetection = recognitionLanguage === 'auto';
  console.log(`[transcribe/diarize] ${files.length} chunk(s) received`);

  // Step 1: merge chunks (single file passes through untouched).
  let mergedPath = files[0].path;
  let createdMerged = false;
  if (files.length > 1) {
    mergedPath = path.join(os.tmpdir(), `merged-${Date.now()}.m4a`);
    createdMerged = true;
    try {
      await concatToM4a(files.map((f) => f.path), mergedPath);
      console.log(`[transcribe/diarize] merged ${files.length} chunks — elapsed=${elapsed()}`);
    } catch (mergeErr: any) {
      files.forEach((f) => cleanupTempFile(f.path));
      cleanupTempFile(mergedPath);
      console.error(`[transcribe/diarize] merge failed: ${mergeErr.message}`);
      res.status(500).json({ error: '오디오 병합에 실패했습니다.', phase: 'merge', detail: String(mergeErr.message).slice(0, 300) });
      return;
    }
  }

  // Step 2: upload merged file to AssemblyAI.
  let audioUrl: string;
  try {
    const fileStream = fs.createReadStream(mergedPath);
    const uploadRes = await axios.post('https://api.assemblyai.com/v2/upload', fileStream, {
      headers: { authorization: config.assemblyAiKey, 'Content-Type': 'application/octet-stream', 'Transfer-Encoding': 'chunked' },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 600_000,
    });
    audioUrl = uploadRes.data.upload_url;
  } catch (uploadErr: any) {
    files.forEach((f) => cleanupTempFile(f.path));
    if (createdMerged) cleanupTempFile(mergedPath);
    console.error(`[transcribe/diarize] upload failed: ${uploadErr.message}`);
    res.status(502).json({ error: 'AssemblyAI 업로드에 실패했습니다.', phase: 'assemblyai_upload' });
    return;
  }

  files.forEach((f) => cleanupTempFile(f.path));
  if (createdMerged) cleanupTempFile(mergedPath);

  // Step 3: create diarized transcription job.
  let jobId: string;
  try {
    const jobBody: Record<string, unknown> = {
      audio_url: audioUrl,
      speech_models: ['universal-3-pro', 'universal-2'],
      speaker_labels: true,
      ...(useLanguageDetection
        ? { language_detection: true }
        : { language_detection: false, language_code: recognitionLanguage }),
    };
    const transcriptRes = await axios.post('https://api.assemblyai.com/v2/transcript', jobBody, {
      headers: { authorization: config.assemblyAiKey },
      timeout: 15_000,
    });
    jobId = transcriptRes.data.id;
  } catch (jobErr: any) {
    console.error(`[transcribe/diarize] job create failed: ${jobErr.response?.data ?? jobErr.message}`);
    res.status(502).json({ error: '음성 인식 작업 생성에 실패했습니다.', phase: 'assemblyai_job_create' });
    return;
  }

  await linkJob(jobId, deviceId);
  console.log(`[transcribe/diarize] job created ${jobId} — elapsed=${elapsed()}`);
  res.json({ jobId });
});

/**
 * GET /api/transcribe/:jobId
 * Polls AssemblyAI for the transcription result.
 */
router.get('/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  console.log(`[transcribe] GET /:jobId — polling jobId=${jobId}`);

  try {
    const pollingRes = await axios.get(
      `https://api.assemblyai.com/v2/transcript/${jobId}`,
      {
        headers: { authorization: config.assemblyAiKey },
        timeout: 15_000,
      }
    );
    const data = pollingRes.data;
    console.log(`[transcribe] poll result — jobId=${jobId}, status=${data.status}`);

    if (data.status === 'completed') {
      let transcript: string;
      let utterances: { speaker: string; text: string; start: number; end: number }[] | undefined;
      if (data.utterances && data.utterances.length > 0) {
        transcript = data.utterances
          .map((u: { speaker: string; text: string }) => `[화자 ${u.speaker}] ${u.text}`)
          .join('\n\n');
        // Include timestamps so the app can build seekable, speaker-labeled segments.
        utterances = data.utterances.map((u: { speaker: string; text: string; start: number; end: number }) => ({
          speaker: u.speaker,
          text: u.text,
          start: u.start,
          end: u.end,
        }));
      } else {
        transcript = data.text ?? '인식된 텍스트가 없습니다.';
      }
      await countJobOnce(jobId, data.audio_duration ?? 0);
      res.json({ status: 'completed', transcript, utterances });
    } else if (data.status === 'error') {
      console.error(`[transcribe] AssemblyAI error for jobId=${jobId}:`, data.error);
      res.json({ status: 'error', error: data.error ?? '알 수 없는 오류' });
    } else {
      res.json({ status: 'processing' });
    }
  } catch (err: any) {
    const status = err.response?.status;
    const detail = err.response?.data ?? err.message;
    console.error(`[transcribe] GET /:jobId error — jobId=${jobId}, HTTP ${status ?? 'n/a'}:`, detail);
    res.status(500).json({
      error: '음성 인식 결과 조회에 실패했습니다.',
      phase: 'poll',
      detail: typeof detail === 'object' ? JSON.stringify(detail) : String(detail),
    });
  }
});

export default router;
