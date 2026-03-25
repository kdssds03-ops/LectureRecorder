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
      timeout: 60_000,
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
 * Returns the text directly after a short poll.
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

    // Step 3: Fast poll (max 10s)
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const pollRes = await axios.get(`https://api.assemblyai.com/v2/transcript/${jobId}`, {
        headers: { authorization: config.assemblyAiKey },
      });
      
      if (pollRes.data.status === 'completed') {
        res.json({ text: pollRes.data.text });
        return;
      } else if (pollRes.data.status === 'error') {
        throw new Error(pollRes.data.error);
      }
    }

    res.status(202).json({ error: 'Transcription timed out, but still processing.' });
  } catch (err: any) {
    console.error('[transcribe/quick] Error:', err.message);
    res.status(500).json({ error: '실시간 음성 인식에 실패했습니다.' });
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
