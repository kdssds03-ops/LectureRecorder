import { Router, Request, Response } from 'express';
import multer from 'multer';
import axios from 'axios';
import { config } from '../config';

const router = Router();

// Store upload in memory — audio is streamed through to AssemblyAI and not persisted on this server
// Increased limits for large audio files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 500 * 1024 * 1024, // 500MB max
    fieldSize: 500 * 1024 * 1024 
  },
});

/**
 * POST /api/transcribe
 * Receives audio from the app, uploads it to AssemblyAI, returns a jobId.
 *
 * Body: multipart/form-data with field "audio" (the audio file)
 * Query: diarize=true (optional)
 * Response: { jobId: string }
 */
router.post('/', upload.single('audio'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file provided. Use field name "audio".' });
    return;
  }

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
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300_000, // 5 minutes for large uploads
    });

    const audioUrl: string = uploadRes.data.upload_url;
    console.log(`[transcribe] upload done ${ms()}`);

    // Step 2: Submit transcription job
    const jobBody: Record<string, unknown> = {
      audio_url: audioUrl,
      speech_model: 'best', // Use 'best' for higher accuracy on final transcript
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
    const providerError = err.response?.data;
    console.error('[transcribe] Error:', providerError ?? err.message);
    res.status(500).json({ error: '음성 인식 요청에 실패했습니다.', detail: providerError });
  }
});

/**
 * POST /api/transcribe/quick
 * Quick transcription for real-time updates (30s chunks).
 * Returns the text directly after polling. Timeout extended to 45s.
 */
router.post('/quick', upload.single('audio'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file provided.' });
    return;
  }

  try {
    // Step 1: Upload
    const uploadRes = await axios.post('https://api.assemblyai.com/v2/upload', req.file.buffer, {
      headers: {
        authorization: config.assemblyAiKey,
        'Content-Type': 'application/octet-stream',
      },
      timeout: 30_000,
    });
    const audioUrl = uploadRes.data.upload_url;

    // Step 2: Submit with 'nano' model for speed
    const transcriptRes = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: audioUrl,
        speech_model: 'nano', // Use 'nano' for near-instant results on short clips
        language_code: 'ko', // Hardcode Korean for speed
      },
      {
        headers: { authorization: config.assemblyAiKey },
        timeout: 10_000,
      }
    );
    const jobId = transcriptRes.data.id;

    // Step 3: Fast poll — extended to 45 attempts (45s) for reliability
    for (let i = 0; i < 45; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const pollRes = await axios.get(`https://api.assemblyai.com/v2/transcript/${jobId}`, {
        headers: { authorization: config.assemblyAiKey },
        timeout: 10_000,
      });
      
      if (pollRes.data.status === 'completed') {
        res.json({ text: pollRes.data.text ?? '' });
        return;
      } else if (pollRes.data.status === 'error') {
        console.error('[transcribe/quick] AssemblyAI error:', pollRes.data.error);
        // Return empty text instead of error to avoid breaking real-time flow
        res.json({ text: '' });
        return;
      }
    }

    // Timed out — return empty text gracefully
    console.warn('[transcribe/quick] Polling timed out after 45s, returning empty text');
    res.json({ text: '' });
  } catch (err: any) {
    console.error('[transcribe/quick] Error:', err.message);
    // Return empty text on error to avoid breaking real-time transcription flow
    res.status(200).json({ text: '' });
  }
});

/**
 * GET /api/transcribe/:jobId
 * Polls AssemblyAI for the transcription result.
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
      res.json({ status: 'error', error: data.error ?? '알 수 없는 오류' });
    } else {
      res.json({ status: 'processing' });
    }
  } catch (err: any) {
    console.error('[transcribe/:jobId] Error:', err.response?.data ?? err.message);
    res.status(500).json({ error: '음성 인식 결과 조회에 실패했습니다.' });
  }
});

export default router;
