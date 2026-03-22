import { Router, Request, Response } from 'express';
import multer from 'multer';
import axios from 'axios';
import { config } from '../config';

const router = Router();

// Store upload in memory — audio is streamed through to AssemblyAI and not persisted on this server
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max
});

/**
 * POST /api/transcribe
 * Receives audio from the app, uploads it to AssemblyAI, returns a jobId.
 *
 * Body: multipart/form-data with field "audio" (the audio file)
 * Response: { jobId: string }
 */
router.post('/', upload.single('audio'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file provided. Use field name "audio".' });
    return;
  }

  // speaker_labels=true enables diarization but adds latency even on short clips.
  // Default is off; pass ?diarize=true in the request to enable it.
  const diarize = req.query.diarize === 'true';

  const t0 = Date.now();
  const ms = () => `${Date.now() - t0}ms`;

  try {
    // Step 1: Upload the audio buffer to AssemblyAI
    console.log(`[transcribe] uploading ${req.file.size} bytes to AssemblyAI`);
    const uploadRes = await axios.post('https://api.assemblyai.com/v2/upload', req.file.buffer, {
      headers: {
        authorization: config.assemblyAiKey,
        'Content-Type': 'application/octet-stream',
      },
      timeout: 60_000, // 60s upload timeout
    });

    const audioUrl: string = uploadRes.data.upload_url;
    console.log(`[transcribe] upload done ${ms()}`);

    // Step 2: Submit transcription job.
    // speech_model (singular) is the correct AssemblyAI v2 field.
    // speaker_labels is opt-in: diarization adds noticeable latency on short clips.
    const jobBody: Record<string, unknown> = {
      audio_url: audioUrl,
      speech_models: ['universal-2'],
      language_detection: true,
      speaker_labels: diarize,
    };

    console.log(`[transcribe] submitting job — diarize=${diarize}`);
    const transcriptRes = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      jobBody,
      {
        headers: { authorization: config.assemblyAiKey },
        timeout: 15_000,
      }
    );

    const jobId: string = transcriptRes.data.id;
    console.log(`[transcribe] job submitted ${ms()} — jobId ${jobId}`);
    res.json({ jobId });
  } catch (err: any) {
    // Surface the provider's error body so it's visible in client logs
    const providerError = err.response?.data;
    console.error('[transcribe] Error:', providerError ?? err.message);
    const message = providerError?.error ?? providerError?.message ?? '오디오 업로드 또는 음성 인식 요청에 실패했습니다.';
    res.status(500).json({ error: message, detail: providerError });
  }
});

/**
 * GET /api/transcribe/:jobId
 * Polls AssemblyAI for the transcription result.
 * The mobile app calls this repeatedly until status is "completed" or "error".
 *
 * Response:
 *   { status: "processing" }
 *   { status: "completed", transcript: string }
 *   { status: "error", error: string }
 */
router.get('/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    const pollingRes = await axios.get(
      `https://api.assemblyai.com/v2/transcript/${jobId}`,
      {
        headers: { authorization: config.assemblyAiKey },
        timeout: 15_000,
      }
    );

    const data = pollingRes.data;

    if (data.status === 'completed') {
      // Format with speaker labels if utterances are available
      let transcript: string;
      if (data.utterances && data.utterances.length > 0) {
        transcript = data.utterances
          .map((u: { speaker: string; text: string }) => `[화자 ${u.speaker}] ${u.text}`)
          .join('\n\n');
      } else {
        transcript = data.text ?? '텍스트를 인식할 수 없습니다.';
      }
      res.json({ status: 'completed', transcript });
    } else if (data.status === 'error') {
      res.json({ status: 'error', error: data.error ?? '알 수 없는 오류' });
    } else {
      // Still processing (queued / processing)
      res.json({ status: 'processing' });
    }
  } catch (err: any) {
    console.error('[transcribe/:jobId] Error:', err.response?.data ?? err.message);
    res.status(500).json({ error: '음성 인식 결과 조회에 실패했습니다.' });
  }
});

export default router;
