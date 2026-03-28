import { Router, Request, Response } from 'express';
import multer from 'multer';
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import { config } from '../config';

const router = Router();

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
 * POST /api/transcribe
 * Receives audio from the app, streams it to AssemblyAI, returns a jobId.
 *
 * Body: multipart/form-data with field "audio"
 * Query: diarize=true (optional)
 * Response: { jobId: string }
 */
router.post('/', upload.single('audio'), async (req: Request, res: Response) => {
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  console.log(`[transcribe] POST / — incoming upload request`);

  if (!req.file) {
    console.warn(`[transcribe] POST / — rejected: no audio file in request body`);
    res.status(400).json({ error: 'No audio file provided. Use field name "audio".' });
    return;
  }

  const { originalname, mimetype, size, path: tmpPath } = req.file;
  console.log(
    `[transcribe] file received — name=${originalname}, mime=${mimetype}, ` +
    `size=${size} bytes (${(size / 1024 / 1024).toFixed(2)} MB), tmpPath=${tmpPath}`
  );

  const diarize = req.query.diarize === 'true';

  // Step 1: Stream temp file → AssemblyAI upload endpoint
  console.log(`[transcribe] AssemblyAI upload starting — diarize=${diarize}, elapsed=${elapsed()}`);

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
        timeout: 120_000, // 2 min — generous for large files; Railway proxy has its own 30s limit
      }
    );
    audioUrl = uploadRes.data.upload_url;
    console.log(`[transcribe] AssemblyAI upload SUCCESS — elapsed=${elapsed()}, upload_url=${audioUrl}`);
  } catch (uploadErr: any) {
    const status = uploadErr.response?.status;
    const detail = uploadErr.response?.data ?? uploadErr.message;
    console.error(
      `[transcribe] AssemblyAI upload FAILED — elapsed=${elapsed()}, HTTP ${status ?? 'n/a'}:`,
      detail
    );
    cleanupTempFile(tmpPath);
    res.status(502).json({
      error: 'AssemblyAI 업로드에 실패했습니다.',
      phase: 'assemblyai_upload',
      httpStatus: status,
      detail: typeof detail === 'object' ? JSON.stringify(detail) : String(detail),
    });
    return;
  }

  // Step 2: Submit transcription job
  console.log(`[transcribe] submitting transcription job — elapsed=${elapsed()}`);

  let jobId: string;
  try {
    const jobBody: Record<string, unknown> = {
      audio_url: audioUrl,
      speech_model: 'best',
      language_detection: true,
      speaker_labels: diarize,
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
    console.error(
      `[transcribe] AssemblyAI job create FAILED — elapsed=${elapsed()}, HTTP ${status ?? 'n/a'}:`,
      detail
    );
    cleanupTempFile(tmpPath);
    res.status(502).json({
      error: '음성 인식 작업 생성에 실패했습니다.',
      phase: 'assemblyai_job_create',
      httpStatus: status,
      detail: typeof detail === 'object' ? JSON.stringify(detail) : String(detail),
    });
    return;
  }

  cleanupTempFile(tmpPath);
  res.json({ jobId });
});

/**
 * POST /api/transcribe/quick
 * Quick transcription for real-time updates (30s chunks).
 * Returns the text directly after polling. Timeout extended to 45s.
 */
router.post('/quick', upload.single('audio'), async (req: Request, res: Response) => {
  console.log(`[transcribe/quick] POST /quick — incoming`);

  if (!req.file) {
    console.warn(`[transcribe/quick] rejected: no audio file`);
    res.status(400).json({ error: 'No audio file provided.' });
    return;
  }

  const { originalname, mimetype, size, path: tmpPath } = req.file;
  console.log(
    `[transcribe/quick] file — name=${originalname}, mime=${mimetype}, ` +
    `size=${size} bytes, tmpPath=${tmpPath}`
  );

  try {
    // Upload via stream
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
        timeout: 30_000,
      }
    );
    const audioUrl = uploadRes.data.upload_url;
    console.log(`[transcribe/quick] AssemblyAI upload done — upload_url=${audioUrl}`);
    cleanupTempFile(tmpPath);

    // Submit with nano model for speed
    const transcriptRes = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: audioUrl,
        speech_model: 'nano',
        language_code: 'ko',
      },
      {
        headers: { authorization: config.assemblyAiKey },
        timeout: 10_000,
      }
    );
    const jobId = transcriptRes.data.id;
    console.log(`[transcribe/quick] job created — jobId=${jobId}`);

    // Fast poll — 45 attempts × 1s = 45s max
    for (let i = 0; i < 45; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const pollRes = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${jobId}`,
        { headers: { authorization: config.assemblyAiKey }, timeout: 10_000 }
      );
      if (pollRes.data.status === 'completed') {
        console.log(`[transcribe/quick] completed on poll #${i + 1}`);
        res.json({ text: pollRes.data.text ?? '' });
        return;
      } else if (pollRes.data.status === 'error') {
        console.error('[transcribe/quick] AssemblyAI error:', pollRes.data.error);
        res.json({ text: '' });
        return;
      }
    }

    console.warn('[transcribe/quick] polling timed out after 45s — returning empty text');
    res.json({ text: '' });
  } catch (err: any) {
    const detail = err.response?.data ?? err.message;
    console.error('[transcribe/quick] unhandled error:', detail);
    cleanupTempFile(req.file?.path);
    // Silent fail — real-time flow must not crash on a single chunk failure
    res.status(200).json({ text: '' });
  }
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
      if (data.utterances && data.utterances.length > 0) {
        transcript = data.utterances
          .map((u: { speaker: string; text: string }) => `[화자 ${u.speaker}] ${u.text}`)
          .join('\n\n');
      } else {
        transcript = data.text ?? '인식된 텍스트가 없습니다.';
      }
      res.json({ status: 'completed', transcript });
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
      detail: typeof detail === 'object' ? JSON.stringify(detail) : String(detail),
    });
  }
});

export default router;
