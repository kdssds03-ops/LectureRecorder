import { ChatMessage, chatWithLecture, transcribeAudio, transcribeWithSpeakers, translateText } from '@/api/aiService';
import { ensurePlayerSetup } from '@/api/playerSetup';
import TrackPlayer, { Event, State, usePlaybackState, useProgress, useTrackPlayerEvents } from 'react-native-track-player';
import Snackbar from '@/components/Snackbar';
import { Colors } from '@/constants/Colors';
import { Radius, Shadows, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRecordingStore } from '@/store/useRecordingStore';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type TabType = 'transcript' | 'summary' | 'translation' | 'quiz';

// Deterministic color per speaker so each voice keeps a consistent color.
const SPEAKER_PALETTE = ['#3A5A40', '#BC6C25', '#6A4C93', '#1D3557', '#A23E48', '#2A6F97', '#7B5E2A', '#43654A'];
function speakerColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SPEAKER_PALETTE[h % SPEAKER_PALETTE.length];
}

interface StructuredSummary {
  lectureType?: string;
  overview: string;
  keyPoints: string[];
  details: { heading: string; content: string }[];
  keywords: string[];
  studyTips: string;
}

function parseStructuredSummary(raw: string): StructuredSummary | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.overview) {
      return parsed as StructuredSummary;
    }
    return null;
  } catch {
    return null;
  }
}

function classifyApiError(error: any): 'network' | 'auth' | 'server' | 'unknown' {
  if (!error.response) return 'network';
  const status: number = error.response.status;
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'server';
  return 'unknown';
}

const API_ERROR_MESSAGES: Record<ReturnType<typeof classifyApiError>, string> = {
  network: '네트워크 연결을 확인하고 다시 시도해 주세요.',
  auth: '앱 키 또는 백엔드 주소가 올바르지 않습니다.',
  server: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  unknown: '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
};

export default function DetailScreen() {
  const {
    id,
    name: paramName,
    duration: paramDuration,
    createdAt: paramCreatedAt,
  } = useLocalSearchParams<{
    id: string;
    name?: string;
    duration?: string;
    createdAt?: string;
  }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const recording = useRecordingStore((state) => state.recordings.find((r) => r.id === id));
  const updateRecording = useRecordingStore((state) => state.updateRecording);
  const fetchSummary = useRecordingStore((state) => state.fetchSummary);
  const fetchQuiz = useRecordingStore((state) => state.fetchQuiz);
  const fetchChapters = useRecordingStore((state) => state.fetchChapters);
  const toggleFavorite = useRecordingStore((state) => state.toggleFavorite);
  const setTags = useRecordingStore((state) => state.setTags);

  // Free-tier gate: returns true if the action may proceed, else opens paywall.
  const ensureMinutes = useCallback((): boolean => {
    if (useSubscriptionStore.getState().canTranscribe()) return true;
    router.push('/paywall' as Href);
    return false;
  }, [router]);
  const recognitionLanguage = useSettingsStore((state) => state.recognitionLanguage);
  const translationLanguage = useSettingsStore((state) => state.translationLanguage);
  const diarizationEnabled = useSettingsStore((state) => state.diarizationEnabled);
  const summaryLanguage = useSettingsStore((state) => state.summaryLanguage);

  const displayName = recording?.name || paramName || '강의 기록';
  const displayDuration = recording?.duration || (paramDuration ? Number(paramDuration) : 0);

  const [activeTab, setActiveTab] = useState<TabType>('transcript');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  const [quizSelected, setQuizSelected] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const [chatVisible, setChatVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleDraft, setEditTitleDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');

  // ── Track Player (lock-screen / Control Center playback) ──────────────────
  // Chunks are loaded as a player queue (one track per chunk) so the FULL lecture
  // plays back-to-back with media controls on the lock screen & notification.
  // We map between per-track time and absolute lecture time via chunkDurations
  // so seeking, segments, chapters and bookmarks all work across chunks.
  const progress = useProgress(250);
  const playbackState = usePlaybackState();
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<1.0 | 1.2 | 1.5 | 2.0>(1.0);
  const [trackWidth, setTrackWidth] = useState(0);
  const loadedIdRef = useRef<string | null>(null);

  const SPEED_STEPS: Array<1.0 | 1.2 | 1.5 | 2.0> = [1.0, 1.2, 1.5, 2.0];

  const chunkUris = useMemo(() => {
    if (recording?.chunkUris && recording.chunkUris.length > 0) return recording.chunkUris;
    return recording?.uri ? [recording.uri] : [];
  }, [recording?.chunkUris, recording?.uri]);

  // Per-chunk durations are only trusted when aligned 1:1 with chunkUris.
  const chunkDurations = useMemo(() => {
    if (
      recording?.chunkDurations &&
      chunkUris.length > 0 &&
      recording.chunkDurations.length === chunkUris.length
    ) {
      return recording.chunkDurations;
    }
    return null;
  }, [recording?.chunkDurations, chunkUris.length]);

  const cumulativeOffsets = useMemo(() => {
    const offs: number[] = [];
    let acc = 0;
    for (let i = 0; i < chunkUris.length; i++) {
      offs.push(acc);
      acc += chunkDurations ? chunkDurations[i] : 0;
    }
    return offs;
  }, [chunkUris.length, chunkDurations]);

  const totalDuration = useMemo(() => {
    if (chunkDurations) return chunkDurations.reduce((a, b) => a + b, 0);
    return recording?.duration || (progress.duration ? progress.duration * 1000 : 0);
  }, [chunkDurations, recording?.duration, progress.duration]);

  // True only when THIS recording is the one currently loaded in the global player.
  const playerHasThis = loadedIdRef.current === recording?.id;
  const isPlaying = playerHasThis && playbackState.state === State.Playing;
  const globalPosition = playerHasThis
    ? (cumulativeOffsets[currentChunkIndex] || 0) + progress.position * 1000
    : 0;

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], (event) => {
    if (event.type === Event.PlaybackActiveTrackChanged && typeof event.index === 'number') {
      setCurrentChunkIndex(event.index);
    }
  });

  const loadIntoPlayer = useCallback(async () => {
    if (!recording || chunkUris.length === 0) return;
    await ensurePlayerSetup();
    const tracks = chunkUris.map((url, i) => ({
      id: `${recording.id}-${i}`,
      url,
      title: recording.name || '강의 기록',
      artist: '노깡',
      ...(chunkDurations ? { duration: chunkDurations[i] / 1000 } : {}),
    }));
    await TrackPlayer.reset();
    await TrackPlayer.add(tracks);
    await TrackPlayer.setRate(playbackRate);
    loadedIdRef.current = recording.id;
    setCurrentChunkIndex(0);
  }, [recording?.id, recording?.name, chunkUris, chunkDurations, playbackRate]);

  const togglePlayback = async () => {
    if (chunkUris.length === 0) return;
    try {
      if (loadedIdRef.current !== recording?.id) {
        await loadIntoPlayer();
        await TrackPlayer.play();
        return;
      }
      const state = (await TrackPlayer.getPlaybackState()).state;
      if (state === State.Playing) await TrackPlayer.pause();
      else await TrackPlayer.play();
    } catch {
      Alert.alert('재생 오류', '오디오를 재생할 수 없습니다.');
    }
  };

  /** Seek to an absolute position (ms) across the whole lecture. */
  const seekToGlobal = async (globalMs: number) => {
    if (chunkUris.length === 0) return;
    const clamped = totalDuration ? Math.max(0, Math.min(globalMs, totalDuration - 1)) : Math.max(0, globalMs);
    let target = 0;
    if (chunkDurations) {
      for (let i = 0; i < chunkUris.length; i++) {
        const start = cumulativeOffsets[i];
        const end = start + chunkDurations[i];
        if (clamped >= start && clamped < end) { target = i; break; }
        if (i === chunkUris.length - 1) target = i;
      }
    }
    const offsetSec = Math.max(0, clamped - (cumulativeOffsets[target] || 0)) / 1000;
    try {
      if (loadedIdRef.current !== recording?.id) await loadIntoPlayer();
      if (chunkUris.length > 1) await TrackPlayer.skip(target);
      await TrackPlayer.seekTo(offsetSec);
      await TrackPlayer.play();
    } catch {
      Alert.alert('재생 오류', '해당 위치로 이동할 수 없습니다.');
    }
  };

  const cycleSpeed = async () => {
    const nextIdx = (SPEED_STEPS.indexOf(playbackRate) + 1) % SPEED_STEPS.length;
    const nextRate = SPEED_STEPS[nextIdx];
    setPlaybackRate(nextRate);
    try {
      await TrackPlayer.setRate(nextRate);
    } catch {
      // ignore — rate will apply on next load
    }
  };

  const handleTranscribe = useCallback(async () => {
    if (!recording) return;
    if (!ensureMinutes()) return;
    setIsProcessing(true);
    setProcessingStatus('오디오 분석 중...');
    try {
      const result = await transcribeAudio(recording.uri, recognitionLanguage, diarizationEnabled);
      updateRecording(recording.id, { transcript: result });
      useSubscriptionStore.getState().consumeSeconds((recording.duration ?? 0) / 1000);
      const { generateTitleFromText } = useRecordingStore.getState();
      generateTitleFromText(recording.id, result);
    } catch (error: any) {
      Alert.alert('음성 인식 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [recording, recognitionLanguage, diarizationEnabled, updateRecording, ensureMinutes]);

  const handleSummarize = useCallback(async () => {
    if (!recording || !recording.transcript) {
      Alert.alert('알림', '먼저 음성을 텍스트로 변환해 주세요.');
      return;
    }
    setIsProcessing(true);
    setProcessingStatus('AI 요약 생성 중...');
    try {
      await fetchSummary(recording.id);
    } catch (error: any) {
      Alert.alert('요약 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [recording, fetchSummary]);

  const handleTranslate = useCallback(async () => {
    if (!recording || !recording.transcript) {
      Alert.alert('알림', '먼저 음성을 텍스트로 변환해 주세요.');
      return;
    }
    setIsProcessing(true);
    setProcessingStatus('번역 중...');
    try {
      const result = await translateText(recording.transcript, translationLanguage);
      updateRecording(recording.id, { translation: result });
    } catch (error: any) {
      Alert.alert('번역 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [recording, translationLanguage, updateRecording]);

  const handleQuiz = useCallback(async () => {
    if (!recording || !recording.transcript) {
      Alert.alert('알림', '먼저 음성을 텍스트로 변환해 주세요.');
      return;
    }
    setIsProcessing(true);
    setProcessingStatus('AI 퀴즈 생성 중...');
    try {
      await fetchQuiz(recording.id);
      setQuizSelected({});
      setQuizSubmitted(false);
    } catch (error: any) {
      Alert.alert('퀴즈 생성 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [recording, fetchQuiz]);

  const handleGenerateChapters = useCallback(async () => {
    if (!recording) return;
    setIsProcessing(true);
    setProcessingStatus('AI 챕터 생성 중...');
    try {
      await fetchChapters(recording.id);
    } catch (error: any) {
      if (error?.message === 'NO_SEGMENTS') {
        Alert.alert('챕터 생성 불가', '실시간 전사로 만든 녹음에서만 자동 챕터를 생성할 수 있어요.');
      } else {
        Alert.alert('챕터 생성 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
      }
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [recording, fetchChapters]);

  // Diarization pass: merges all chunks server-side and re-transcribes the whole
  // lecture in one shot with consistent speaker labels + timestamps. Works for
  // both live recordings (chunked) and imported single files.
  const hasAudio = !!recording && (((recording.chunkUris?.length ?? 0) > 0) || !!recording.uri);

  const handleReTranscribeSpeakers = useCallback(async () => {
    if (!recording) return;
    if (!ensureMinutes()) return;
    const uris = recording.chunkUris && recording.chunkUris.length > 0
      ? recording.chunkUris
      : recording.uri ? [recording.uri] : [];
    if (uris.length === 0) {
      Alert.alert('알림', '오디오 파일을 찾을 수 없습니다.');
      return;
    }
    setIsEditingTitle(false);
    setIsProcessing(true);
    setProcessingStatus('화자 구분 분석 중...');
    try {
      const { transcript, segments } = await transcribeWithSpeakers(uris, recognitionLanguage);
      if (transcript && transcript.trim()) {
        // Keep segments (now carrying speaker + timestamps) so the transcript is
        // both speaker-labeled AND seekable.
        updateRecording(recording.id, { transcript, segments });
        useSubscriptionStore.getState().consumeSeconds((recording.duration ?? 0) / 1000);
      } else {
        Alert.alert('알림', '인식된 음성이 없습니다.');
      }
    } catch (error: any) {
      Alert.alert('화자 구분 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [recording, recognitionLanguage, updateRecording, ensureMinutes]);

  const confirmReTranscribeSpeakers = () => {
    Alert.alert(
      '화자 구분 분석',
      '전체 오디오를 다시 분석해 화자별로 구분합니다. 길이에 따라 시간이 걸리며 사용량이 소모됩니다. 진행할까요?',
      [
        { text: '취소', style: 'cancel' },
        { text: '시작', onPress: handleReTranscribeSpeakers },
      ]
    );
  };

  const openNoteSettings = () => {
    setEditTitleDraft(recording?.name || displayName);
    setTagDraft('');
    setIsEditingTitle(true);
  };
  const addTag = () => {
    const t = tagDraft.trim();
    if (!t || !recording) return;
    setTags(recording.id, [...(recording.tags || []), t]);
    setTagDraft('');
  };
  const removeTag = (tag: string) => {
    if (!recording) return;
    setTags(recording.id, (recording.tags || []).filter((x) => x !== tag));
  };

  const handleSendChat = async () => {
    const q = chatInput.trim();
    if (!q || chatLoading || !recording?.transcript) return;
    const next: ChatMessage[] = [...chatMessages, { role: 'user', content: q }];
    setChatMessages(next);
    setChatInput('');
    setChatLoading(true);
    try {
      const reply = await chatWithLecture(recording.transcript, next, summaryLanguage);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      const msg = API_ERROR_MESSAGES[classifyApiError(e)] || '답변을 가져오지 못했습니다.';
      setChatMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ ' + msg }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Build a shareable Markdown document from everything we have for this recording.
  const buildExportMarkdown = (): string => {
    if (!recording) return '';
    const parts: string[] = [`# ${displayName}`];
    const dateStr = new Date(recording.createdAt || Date.now()).toLocaleString('ko-KR');
    parts.push(`_${dateStr}_`);

    if (recording.transcript) {
      parts.push(`\n## 음성인식\n\n${recording.transcript}`);
    }

    if (recording.summary) {
      const sd = typeof recording.summary === 'object'
        ? recording.summary
        : parseStructuredSummary(String(recording.summary));
      if (sd) {
        const sec: string[] = ['\n## 요약'];
        if (sd.overview) sec.push(`\n### 개요\n${sd.overview}`);
        if (sd.keyPoints?.length) sec.push(`\n### 핵심 포인트\n${sd.keyPoints.map((x: string) => `- ${x}`).join('\n')}`);
        if (sd.details?.length) sec.push(`\n### 상세 내용\n${sd.details.map((d: { heading: string; content: string }) => `**${d.heading}**\n${d.content}`).join('\n\n')}`);
        if (sd.keywords?.length) sec.push(`\n### 키워드\n${sd.keywords.map((k: string) => `#${k}`).join(' ')}`);
        if (sd.studyTips) sec.push(`\n### 학습 팁\n${sd.studyTips}`);
        parts.push(sec.join('\n'));
      } else {
        parts.push(`\n## 요약\n\n${String(recording.summary)}`);
      }
    }

    if (recording.translation) {
      parts.push(`\n## 번역\n\n${recording.translation}`);
    }

    if (recording.quiz?.length) {
      const q = recording.quiz.map((item, i) => {
        const opts = item.options.map((o, j) => `${j === item.answerIndex ? '✅' : '▫️'} ${o}`).join('\n');
        return `**Q${i + 1}. ${item.question}**\n${opts}\n해설: ${item.explanation}`;
      }).join('\n\n');
      parts.push(`\n## 퀴즈\n\n${q}`);
    }

    return parts.join('\n');
  };

  const escapeHtml = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const buildExportHtml = (): string => {
    const md = buildExportMarkdown();
    // Lightweight markdown-ish → HTML (headings + line breaks) for PDF rendering.
    const body = md.split('\n').map((line) => {
      if (line.startsWith('### ')) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      if (line.startsWith('## ')) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line.startsWith('# ')) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      if (line.trim() === '') return '<br/>';
      return `<p>${escapeHtml(line)}</p>`;
    }).join('\n');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>
        body { font-family: -apple-system, 'Helvetica Neue', sans-serif; padding: 32px; color: #1c1c1e; line-height: 1.6; }
        h1 { font-size: 24px; } h2 { font-size: 19px; margin-top: 24px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
        h3 { font-size: 16px; color: #555; } p { margin: 4px 0; font-size: 14px; }
      </style></head><body>${body}</body></html>`;
  };

  const handleShare = () => {
    if (!recording?.transcript) {
      setSnackbarMessage('내보낼 내용이 없습니다.');
      setSnackbarVisible(true);
      return;
    }
    Alert.alert('내보내기', '어떤 형식으로 내보낼까요?', [
      {
        text: '텍스트로 공유',
        onPress: async () => {
          try {
            await Share.share({ message: buildExportMarkdown() });
          } catch {
            setSnackbarMessage('공유에 실패했습니다.');
            setSnackbarVisible(true);
          }
        },
      },
      {
        text: 'PDF로 내보내기',
        onPress: async () => {
          try {
            const { uri } = await Print.printToFileAsync({ html: buildExportHtml() });
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: displayName });
            } else {
              setSnackbarMessage('이 기기에서는 공유를 사용할 수 없습니다.');
              setSnackbarVisible(true);
            }
          } catch {
            setSnackbarMessage('PDF 내보내기에 실패했습니다.');
            setSnackbarVisible(true);
          }
        },
      },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const handleCopy = async () => {
    if (!recording) return;
    let textToCopy = '';

    if (activeTab === 'transcript' && recording.transcript) {
      textToCopy = recording.transcript;
    } else if (activeTab === 'summary' && recording.summary) {
      const summaryData = typeof recording.summary === 'object' ? recording.summary : parseStructuredSummary(String(recording.summary));
      
      if (summaryData) {
        // Format structured summary for copying
        const sections: string[] = [];
        if (summaryData.overview) sections.push(`[개요]\n${summaryData.overview}`);
        if (summaryData.keyPoints?.length) sections.push(`[핵심 포인트]\n${summaryData.keyPoints.map((p: string) => `• ${p}`).join('\n')}`);
        if (summaryData.details?.length) {
          const detailStr = summaryData.details.map((d: { heading: string; content: string }) => `${d.heading}: ${d.content}`).join('\n');
          sections.push(`[상세 내용]\n${detailStr}`);
        }
        if (summaryData.keywords?.length) sections.push(`[키워드]\n${summaryData.keywords.join(', ')}`);
        if (summaryData.studyTips) sections.push(`[학습 팁]\n${summaryData.studyTips}`);
        
        textToCopy = sections.join('\n\n');
      } else {
        textToCopy = String(recording.summary);
      }
    } else if (activeTab === 'translation' && recording.translation) {
      textToCopy = recording.translation;
    } else if (activeTab === 'translation' && !recording.translation) {
      setSnackbarMessage('복사할 번역 내용이 없습니다.');
      setSnackbarVisible(true);
      return;
    }

    if (textToCopy && textToCopy.trim()) {
      try {
        await Clipboard.setStringAsync(textToCopy);
        setSnackbarMessage('클립보드에 복사되었습니다.');
        setSnackbarVisible(true);
      } catch (err) {
        setSnackbarMessage('복사에 실패했습니다.');
        setSnackbarVisible(true);
      }
    } else {
      setSnackbarMessage('복사할 내용이 없습니다.');
      setSnackbarVisible(true);
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const progressWidth = totalDuration > 0 ? (globalPosition / totalDuration) * 100 : 0;

  const handleSeekPress = (locationX: number) => {
    if (trackWidth <= 0 || totalDuration <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
    seekToGlobal(ratio * totalDuration);
  };

  // Index of the transcript segment currently playing (for live highlight).
  const activeSegmentIndex = useMemo(() => {
    const segs = recording?.segments;
    if (!segs || segs.length === 0 || !isPlaying) return -1;
    for (let i = 0; i < segs.length; i++) {
      if (globalPosition >= segs[i].startMs && globalPosition < segs[i].endMs) return i;
    }
    return -1;
  }, [recording?.segments, globalPosition, isPlaying]);

  const renderTranscript = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    const timestampRegex = /^(\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}|\d{2}:\d{2}\s*-\s*\d{2}:\d{2})$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (timestampRegex.test(line)) {
        elements.push(
          <View
            key={`ts-${i}`}
            style={[styles.timestampPill, { backgroundColor: theme.unselectedChip }]}
          >
            <Text style={[styles.timestampText, { color: theme.textSecondary }]}>{line}</Text>
          </View>
        );
        continue;
      }
      const speakerMatch = line.match(/^\[화자\s+(.+?)\]\s*(.*)$/);
      if (speakerMatch) {
        const sc = speakerColor(speakerMatch[1]);
        elements.push(
          <View key={`sp-${i}`} style={[styles.speakerRow, { borderLeftColor: sc }]}>
            <View style={[styles.speakerBadge, { backgroundColor: sc + '20' }]}>
              <View style={[styles.speakerDot, { backgroundColor: sc }]} />
              <Text style={[styles.speakerBadgeText, { color: sc }]}>화자 {speakerMatch[1]}</Text>
            </View>
            <Text style={[styles.transcriptBody, { color: theme.text, flex: 1 }]}>{speakerMatch[2]}</Text>
          </View>
        );
      } else {
        elements.push(
          <Text key={`txt-${i}`} style={[styles.transcriptBody, { color: theme.text }]}>
            {line}
          </Text>
        );
      }
    }
    return elements.length > 0 ? elements : <Text style={[styles.transcriptBody, { color: theme.text }]}>{text}</Text>;
  };

  // AI chapter navigation: shows generated chapters (tap to jump) or a generate
  // button. Only available when time-aligned segments exist.
  const renderChapters = () => {
    const chapters = recording?.chapters;
    const hasSegments = !!(recording?.segments && recording.segments.length > 0);

    if (chapters && chapters.length > 0) {
      return (
        <View style={[styles.chaptersCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.chaptersHeaderRow}>
            <View style={styles.chaptersTitleRow}>
              <MaterialIcons name="list" size={16} color={theme.primary} />
              <Text style={[styles.chaptersTitle, { color: theme.text }]}>챕터 {chapters.length}</Text>
            </View>
            <TouchableOpacity onPress={handleGenerateChapters} disabled={isProcessing}>
              <Text style={[styles.chaptersRegen, { color: theme.textSecondary }]}>다시 생성</Text>
            </TouchableOpacity>
          </View>
          {chapters.map((ch, i) => (
            <TouchableOpacity
              key={`ch-${i}`}
              style={styles.chapterRow}
              activeOpacity={0.7}
              onPress={() => seekToGlobal(ch.startMs)}
            >
              <View style={[styles.chapterTimePill, { backgroundColor: theme.unselectedChip }]}>
                <Text style={[styles.chapterTimeText, { color: theme.textSecondary }]}>{formatTime(ch.startMs)}</Text>
              </View>
              <Text style={[styles.chapterTitleText, { color: theme.text }]} numberOfLines={2}>{ch.title}</Text>
              <Feather name="play" size={14} color={theme.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    if (hasSegments) {
      return (
        <TouchableOpacity
          style={[styles.generateChaptersBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={handleGenerateChapters}
          disabled={isProcessing}
          activeOpacity={0.7}
        >
          <MaterialIcons name="auto-awesome" size={16} color={theme.primary} />
          <Text style={[styles.generateChaptersText, { color: theme.primary }]}>AI 챕터 생성</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  // Time-aligned transcript: tap any segment to jump playback there; the segment
  // playing right now is highlighted automatically.
  const renderSegments = () => {
    const segs = recording?.segments || [];
    return (
      <View style={styles.transcriptSection}>
        {segs.map((seg, i) => {
          const active = i === activeSegmentIndex;
          return (
            <TouchableOpacity
              key={`seg-${i}`}
              activeOpacity={0.7}
              onPress={() => seekToGlobal(seg.startMs)}
              style={[
                styles.segmentBlock,
                active && { backgroundColor: theme.primary + '12' },
                seg.speaker ? { borderLeftWidth: 3, borderLeftColor: speakerColor(seg.speaker), paddingLeft: Spacing.sm } : null,
              ]}
            >
              <View style={styles.segHeaderRow}>
                <View style={[styles.segTimePill, { backgroundColor: active ? theme.primary : theme.unselectedChip }]}>
                  <MaterialIcons name="play-arrow" size={11} color={active ? '#FFFFFF' : theme.textSecondary} />
                  <Text style={[styles.segTimeText, { color: active ? '#FFFFFF' : theme.textSecondary }]}>
                    {formatTime(seg.startMs)}
                  </Text>
                </View>
                {seg.speaker && (
                  <View style={[styles.segSpeakerBadge, { backgroundColor: speakerColor(seg.speaker) + '20' }]}>
                    <View style={[styles.speakerDot, { backgroundColor: speakerColor(seg.speaker) }]} />
                    <Text style={[styles.segSpeakerText, { color: speakerColor(seg.speaker) }]}>화자 {seg.speaker}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.transcriptBody, { color: theme.text, marginBottom: 0 }]}>{seg.text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderSummary = () => {
    if (!recording?.summary) return null;
    
    // Attempt to get structured data (either already an object or a JSON string)
    const structuredData = typeof recording.summary === 'object' 
      ? (recording.summary as StructuredSummary)
      : parseStructuredSummary(String(recording.summary));

    if (structuredData) {
      return (
        <View style={styles.summaryContainer}>
          {/* Overview */}
          <Text style={[styles.summarySectionTitle, { color: theme.text }]}>강의 개요</Text>
          <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: Spacing.lg }]}>
            <Text style={[styles.summaryText, { color: theme.text }]}>{structuredData.overview}</Text>
          </View>

          {/* Key Points */}
          {structuredData.keyPoints?.length > 0 && (
            <>
              <Text style={[styles.summarySectionTitle, { color: theme.text }]}>핵심 포인트</Text>
              <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: Spacing.lg }]}>
                {structuredData.keyPoints.map((point, idx) => (
                  <View key={`kp-${idx}`} style={styles.bulletRow}>
                    <Text style={[styles.bullet, { color: theme.primary }]}>•</Text>
                    <Text style={[styles.summaryText, { color: theme.text, flex: 1 }]}>{point}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Details */}
          {structuredData.details?.length > 0 && (
            <>
              <Text style={[styles.summarySectionTitle, { color: theme.text }]}>상세 내용</Text>
              {structuredData.details.map((detail, idx) => (
                <View key={`det-${idx}`} style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: Spacing.md }]}>
                  <Text style={[styles.detailHeading, { color: theme.primary }]}>{detail.heading}</Text>
                  <Text style={[styles.summaryText, { color: theme.text }]}>{detail.content}</Text>
                </View>
              ))}
            </>
          )}

          {/* Keywords */}
          {structuredData.keywords?.length > 0 && (
            <>
              <Text style={[styles.summarySectionTitle, { color: theme.text }]}>주요 키워드</Text>
              <View style={styles.keywordsGrid}>
                {structuredData.keywords.map((keyword, idx) => (
                  <View key={`kw-${idx}`} style={[styles.keywordBadge, { backgroundColor: theme.unselectedChip }]}>
                    <Text style={[styles.keywordText, { color: theme.textSecondary }]}>#{keyword}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Study Tips */}
          {structuredData.studyTips && (
            <View style={[styles.tipsCard, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}>
              <View style={styles.tipsHeader}>
                <MaterialIcons name="lightbulb-outline" size={20} color={theme.primary} />
                <Text style={[styles.tipsTitle, { color: theme.primary }]}>학습 팁</Text>
              </View>
              <Text style={[styles.summaryText, { color: theme.text }]}>{structuredData.studyTips}</Text>
            </View>
          )}
        </View>
      );
    }

    // Fallback for legacy plain text summaries
    return <Text style={[styles.transcriptBody, { color: theme.text }]}>{String(recording.summary)}</Text>;
  };

  const renderTranslation = () => {
    if (!recording?.translation) return null;
    const langMap: Record<string, string> = { en: '영어', ko: '한국어', ja: '일본어', zh: '중국어', es: '스페인어', fr: '프랑스어' };
    const langLabel = langMap[translationLanguage] || '번역';
    return (
      <View style={styles.summaryContainer}>
        <View style={styles.translationHeaderRow}>
          <View style={[styles.langBadge, { backgroundColor: theme.primary + '15' }]}>
            <Feather name="globe" size={14} color={theme.primary} />
            <Text style={[styles.langBadgeText, { color: theme.primary }]}>{langLabel}로 번역</Text>
          </View>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.translationText, { color: theme.text }]}>{recording.translation}</Text>
        </View>
      </View>
    );
  };

  const renderQuiz = () => {
    const quiz = recording?.quiz;
    if (!quiz || quiz.length === 0) return null;

    const answeredCount = Object.keys(quizSelected).length;
    const allAnswered = answeredCount === quiz.length;
    const score = quiz.reduce(
      (acc, q, i) => acc + (quizSelected[i] === q.answerIndex ? 1 : 0),
      0
    );

    return (
      <View style={styles.summaryContainer}>
        {quizSubmitted && (
          <View style={[styles.scoreCard, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '30' }]}>
            <Text style={[styles.scoreText, { color: theme.primary }]}>
              {quiz.length}문제 중 {score}개 정답
            </Text>
          </View>
        )}

        {quiz.map((q, qi) => {
          const selected = quizSelected[qi];
          return (
            <View
              key={`q-${qi}`}
              style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: Spacing.md }]}
            >
              <Text style={[styles.quizQuestion, { color: theme.text }]}>
                {qi + 1}. {q.question}
              </Text>
              {q.options.map((opt, oi) => {
                const isSelected = selected === oi;
                const isCorrect = oi === q.answerIndex;
                let borderColor = theme.border;
                let bg = theme.background;
                if (quizSubmitted) {
                  if (isCorrect) { borderColor = '#34C759'; bg = '#34C75915'; }
                  else if (isSelected) { borderColor = '#FF3B30'; bg = '#FF3B3015'; }
                } else if (isSelected) {
                  borderColor = theme.primary; bg = theme.primary + '15';
                }
                return (
                  <TouchableOpacity
                    key={`o-${qi}-${oi}`}
                    activeOpacity={0.7}
                    disabled={quizSubmitted}
                    onPress={() => setQuizSelected((prev) => ({ ...prev, [qi]: oi }))}
                    style={[styles.quizOption, { borderColor, backgroundColor: bg }]}
                  >
                    <Text style={[styles.quizOptionText, { color: theme.text }]}>{opt}</Text>
                    {quizSubmitted && isCorrect && (
                      <Feather name="check" size={18} color="#34C759" />
                    )}
                    {quizSubmitted && isSelected && !isCorrect && (
                      <Feather name="x" size={18} color="#FF3B30" />
                    )}
                  </TouchableOpacity>
                );
              })}
              {quizSubmitted && !!q.explanation && (
                <Text style={[styles.quizExplanation, { color: theme.textSecondary }]}>
                  💡 {q.explanation}
                </Text>
              )}
            </View>
          );
        })}

        {!quizSubmitted ? (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: allAnswered ? theme.primary : theme.unselectedChip, ...Shadows.soft, alignSelf: 'stretch', marginTop: Spacing.sm }]}
            disabled={!allAnswered}
            onPress={() => setQuizSubmitted(true)}
          >
            <Text style={[styles.actionButtonText, { color: allAnswered ? '#fff' : theme.textSecondary }]}>
              {allAnswered ? '채점하기' : `${answeredCount}/${quiz.length} 풀이 완료`}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
            <TouchableOpacity
              style={[styles.outlineButton, { flex: 1, borderColor: theme.border, backgroundColor: theme.surface, ...Shadows.soft }]}
              onPress={() => { setQuizSelected({}); setQuizSubmitted(false); }}
            >
              <Feather name="rotate-ccw" size={16} color={theme.textSecondary} style={{ marginRight: Spacing.sm }} />
              <Text style={[styles.outlineButtonText, { color: theme.textSecondary }]}>다시 풀기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { flex: 1, backgroundColor: theme.primary, ...Shadows.soft }]}
              onPress={handleQuiz}
            >
              <Text style={[styles.actionButtonText, { color: '#fff' }]}>새 퀴즈</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.circularButton, { backgroundColor: theme.surface, ...Shadows.soft }]}
        >
          <Feather name="chevron-left" size={24} color={theme.text} />
        </TouchableOpacity>

        <View style={[styles.pillTabsContainer, { backgroundColor: theme.unselectedChip }]}>
          {(['transcript', 'summary', 'translation', 'quiz'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.pillTab,
                activeTab === tab &&
                [styles.pillTabActive, { backgroundColor: theme.surface, ...Shadows.soft }],
              ]}
              disabled={isProcessing}
            >
              <Text
                style={[
                  styles.pillTabText,
                  { color: activeTab === tab ? theme.text : theme.textSecondary },
                ]}
              >
                {tab === 'transcript' ? '음성인식' : tab === 'summary' ? '요약' : tab === 'translation' ? '번역' : '퀴즈'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={openNoteSettings}
          style={[styles.circularButton, { backgroundColor: theme.surface, ...Shadows.soft }]}
        >
          {recording?.isFavorite ? (
            <MaterialIcons name="star" size={22} color={theme.accent} />
          ) : (
            <Feather name="more-horizontal" size={24} color={theme.text} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Player section */}
        <View style={styles.playerSection}>
          <View style={styles.playerControlsRow}>
            <TouchableOpacity
              onPress={togglePlayback}
              style={[styles.playCircle, { backgroundColor: theme.text }]}
            >
              <MaterialIcons
                name={isPlaying ? 'pause' : 'play-arrow'}
                size={28}
                color={theme.background}
              />
            </TouchableOpacity>

            <Text style={[styles.timeText, { color: theme.textSecondary, marginLeft: Spacing.sm }]}>
              {formatTime(globalPosition)}
            </Text>

            <Pressable
              style={styles.sliderTrack}
              hitSlop={{ top: 14, bottom: 14 }}
              onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
              onPress={(e) => handleSeekPress(e.nativeEvent.locationX)}
            >
              <View
                style={[
                  styles.sliderFill,
                  { width: `${progressWidth}%`, backgroundColor: theme.primary },
                ]}
              />
              <View
                style={[
                  styles.sliderKnob,
                  { left: `${progressWidth}%`, backgroundColor: theme.surface, ...Shadows.soft },
                ]}
              />
            </Pressable>

            <Text style={[styles.timeText, { color: theme.textSecondary, marginRight: Spacing.sm }]}>
              {formatTime(totalDuration || displayDuration)}
            </Text>

            <TouchableOpacity
              onPress={cycleSpeed}
              style={[styles.speedPill, { backgroundColor: theme.unselectedChip }]}
            >
              <Text style={[styles.speedText, { color: theme.textSecondary }]}>{playbackRate}x</Text>
            </TouchableOpacity>
          </View>

          {/* Bookmarks captured during recording */}
          {recording?.highlights && recording.highlights.length > 0 && (
            <View style={styles.bookmarkStrip}>
              <View style={styles.bookmarkLabelRow}>
                <MaterialIcons name="bookmark" size={14} color={theme.accent} />
                <Text style={[styles.bookmarkLabel, { color: theme.textSecondary }]}>
                  북마크 {recording.highlights.length}
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs }}>
                {recording.highlights.map((ms, i) => (
                  <TouchableOpacity
                    key={`hl-${i}`}
                    style={[styles.bookmarkChip, { backgroundColor: theme.accent + '20', borderColor: theme.accent + '40' }]}
                    onPress={() => seekToGlobal(ms)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="play-arrow" size={13} color={theme.accent} />
                    <Text style={[styles.bookmarkChipText, { color: theme.text }]}>{formatTime(ms)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Content area */}
        <View style={styles.contentArea}>
          {isProcessing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.processingText, { color: theme.textSecondary }]}>
                {processingStatus}
              </Text>
            </View>
          ) : activeTab === 'transcript' ? (
            (recording?.segments && recording.segments.length > 0) ? (
              <View>
                {renderChapters()}
                {renderSegments()}
              </View>
            ) : recording?.transcript ? (
              <View style={styles.transcriptSection}>{renderTranscript(recording.transcript)}</View>
            ) : (
              <View style={styles.emptyContentContainer}>
                <Text style={[styles.emptyContentText, { color: theme.textSecondary }]}>
                  아직 변환된 텍스트가 없어요
                </Text>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primary, ...Shadows.soft }]} onPress={handleTranscribe}>
                  <Text style={styles.actionButtonText}>음성 인식 시작</Text>
                </TouchableOpacity>
              </View>
            )
          ) : activeTab === 'summary' ? (
            recording?.summary ? (
              renderSummary()
            ) : (
              <View style={styles.emptyContentContainer}>
                <Text style={[styles.emptyContentText, { color: theme.textSecondary }]}>
                  텍스트 변환 후 요약을 생성해보세요
                </Text>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primary, ...Shadows.soft }]} onPress={handleSummarize}>
                  <Text style={styles.actionButtonText}>요약 노트 만들기</Text>
                </TouchableOpacity>
              </View>
            )
          ) : activeTab === 'translation' ? (
            recording?.translation ? (
              renderTranslation()
            ) : (
              <View style={styles.emptyContentContainer}>
                <Text style={[styles.emptyContentText, { color: theme.textSecondary }]}>
                  텍스트 변환 후 번역을 시작해보세요
                </Text>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primary, ...Shadows.soft }]} onPress={handleTranslate}>
                  <Text style={styles.actionButtonText}>번역하기</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            recording?.quiz && recording.quiz.length > 0 ? (
              renderQuiz()
            ) : (
              <View style={styles.emptyContentContainer}>
                <Text style={[styles.emptyContentText, { color: theme.textSecondary }]}>
                  강의 내용으로 퀴즈를 만들어 복습해보세요
                </Text>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primary, ...Shadows.soft }]} onPress={handleQuiz}>
                  <Text style={styles.actionButtonText}>퀴즈 만들기</Text>
                </TouchableOpacity>
              </View>
            )
          )}
        </View>
      </ScrollView>

      {/* Bottom Action Area (Copy & Re-summarize) */}
      {recording?.transcript && (
        <View style={styles.bottomActionArea}>
          <TouchableOpacity
            style={[styles.outlineButton, { flex: 1, borderColor: theme.primary, backgroundColor: theme.primary, ...Shadows.soft }]}
            onPress={() => setChatVisible(true)}
            activeOpacity={0.7}
          >
            <Feather name="message-circle" size={18} color="#fff" style={{ marginRight: Spacing.sm }} />
            <Text style={[styles.outlineButtonText, { color: '#fff' }]}>질문</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.outlineButton, { flex: 1, borderColor: theme.border, backgroundColor: theme.surface, ...Shadows.soft }]}
            onPress={handleCopy}
            activeOpacity={0.7}
          >
            <Feather name="copy" size={18} color={theme.textSecondary} style={{ marginRight: Spacing.sm }} />
            <Text style={[styles.outlineButtonText, { color: theme.textSecondary }]}>복사</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.outlineButton, { flex: 1, borderColor: theme.border, backgroundColor: theme.surface, ...Shadows.soft }]}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Feather name="share" size={18} color={theme.textSecondary} style={{ marginRight: Spacing.sm }} />
            <Text style={[styles.outlineButtonText, { color: theme.textSecondary }]}>내보내기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Note settings modal: title, favorite, tags, speaker re-transcription */}
      <Modal visible={isEditingTitle} transparent animationType="fade" onRequestClose={() => setIsEditingTitle(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.surface, ...Shadows.medium }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>노트 설정</Text>

            <TextInput
              style={[
                styles.modalInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, marginBottom: Spacing.md },
              ]}
              value={editTitleDraft}
              onChangeText={setEditTitleDraft}
              placeholder="노트 제목"
              placeholderTextColor={theme.textTertiary}
            />

            {/* Favorite */}
            <TouchableOpacity
              style={styles.noteModalRow}
              activeOpacity={0.7}
              onPress={() => recording && toggleFavorite(recording.id)}
            >
              <Text style={[styles.noteModalLabel, { color: theme.text }]}>즐겨찾기</Text>
              <MaterialIcons
                name={recording?.isFavorite ? 'star' : 'star-border'}
                size={24}
                color={recording?.isFavorite ? theme.accent : theme.textTertiary}
              />
            </TouchableOpacity>

            {/* Tags */}
            <Text style={[styles.noteModalLabel, { color: theme.text, marginTop: Spacing.sm, marginBottom: Spacing.xs }]}>태그</Text>
            {recording?.tags && recording.tags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm }}>
                {recording.tags.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.tagChip, { backgroundColor: theme.primary + '12', borderColor: theme.primary + '30' }]}
                    onPress={() => removeTag(tag)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tagChipText, { color: theme.primary }]}>#{tag}</Text>
                    <Feather name="x" size={12} color={theme.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0, color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                value={tagDraft}
                onChangeText={setTagDraft}
                placeholder="태그 추가"
                placeholderTextColor={theme.textTertiary}
                onSubmitEditing={addTag}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.modalButton, { width: 56, flex: 0, backgroundColor: theme.primary, borderColor: theme.primary }]}
                onPress={addTag}
              >
                <Feather name="plus" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Speaker diarization pass (works for live recordings and imports) */}
            {hasAudio && (
              <TouchableOpacity
                style={[styles.reTranscribeBtn, { borderColor: theme.border }]}
                onPress={confirmReTranscribeSpeakers}
                activeOpacity={0.7}
              >
                <Feather name="users" size={16} color={theme.textSecondary} />
                <Text style={{ color: theme.textSecondary, ...Typography.bodyMedium, fontWeight: '600' }}>
                  화자 구분 분석
                </Text>
              </TouchableOpacity>
            )}

            <View style={[styles.modalButtons, { marginTop: Spacing.lg }]}>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: theme.border }]}
                onPress={() => setIsEditingTitle(false)}
              >
                <Text style={{ color: theme.textSecondary, ...Typography.bodyMedium }}>닫기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.text }]}
                onPress={() => {
                  if (editTitleDraft.trim()) updateRecording(id as string, { name: editTitleDraft.trim(), titleSource: 'user' });
                  setIsEditingTitle(false);
                }}
              >
                <Text style={{ color: theme.background, ...Typography.bodyMedium, fontWeight: '700' }}>
                  저장
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={chatVisible} animationType="slide" transparent onRequestClose={() => setChatVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.chatOverlay}
        >
          <View style={[styles.chatSheet, { backgroundColor: theme.background }]}>
            <View style={[styles.chatHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.chatTitle, { color: theme.text }]}>강의에게 질문</Text>
              <TouchableOpacity onPress={() => setChatVisible(false)}>
                <Feather name="x" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.chatList} contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
              {chatMessages.length === 0 && (
                <Text style={[styles.chatHint, { color: theme.textSecondary }]}>
                  이 강의 내용에 대해 무엇이든 물어보세요.{'\n'}예) "핵심만 3줄로 정리해줘", "이 부분 쉽게 설명해줘"
                </Text>
              )}
              {chatMessages.map((m, i) => (
                <View
                  key={`chat-${i}`}
                  style={[
                    styles.bubble,
                    m.role === 'user'
                      ? { alignSelf: 'flex-end', backgroundColor: theme.primary }
                      : { alignSelf: 'flex-start', backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 },
                  ]}
                >
                  <Text style={[styles.bubbleText, { color: m.role === 'user' ? '#fff' : theme.text }]}>{m.content}</Text>
                </View>
              ))}
              {chatLoading && <ActivityIndicator color={theme.primary} style={{ alignSelf: 'flex-start' }} />}
            </ScrollView>
            <View style={[styles.chatInputRow, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
              <TextInput
                style={[styles.chatInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="질문 입력..."
                placeholderTextColor={theme.textTertiary}
                multiline
              />
              <TouchableOpacity
                onPress={handleSendChat}
                disabled={chatLoading || !chatInput.trim()}
                style={[styles.chatSend, { backgroundColor: theme.primary, opacity: chatLoading || !chatInput.trim() ? 0.5 : 1 }]}
              >
                <Feather name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Snackbar
        visible={snackbarVisible}
        message={snackbarMessage}
        onDismiss={() => setSnackbarVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenPadding, paddingTop: Spacing.xl, paddingBottom: Spacing.md,
  },
  circularButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillTabsContainer: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 4,
  },
  pillTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  pillTabActive: {
    borderRadius: Radius.pill,
  },
  pillTabText: {
    ...Typography.bodyMedium,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 100
  },
  playerSection: {
    paddingVertical: Spacing.lg,
  },
  playerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderTrack: {
    flex: 1, height: 6, backgroundColor: '#E5E5EA', borderRadius: 3,
    marginHorizontal: Spacing.sm, flexDirection: 'row', alignItems: 'center',
  },
  sliderFill: {
    height: '100%',
    borderRadius: 3,
  },
  sliderKnob: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
  },
  timeText: {
    ...Typography.caption,
  },
  speedPill: {
    marginLeft: Spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    minWidth: 40,
    alignItems: 'center',
  },
  speedText: {
    ...Typography.caption,
    fontWeight: '700',
  },
  bookmarkStrip: {
    marginTop: Spacing.md,
  },
  bookmarkLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.xs,
  },
  bookmarkLabel: {
    ...Typography.caption,
    fontWeight: '700',
  },
  bookmarkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  bookmarkChipText: {
    ...Typography.caption,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  segmentBlock: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  segTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    marginBottom: Spacing.xs,
  },
  segTimeText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  segHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
    flexWrap: 'wrap',
  },
  segSpeakerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  segSpeakerText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chaptersCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  chaptersHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  chaptersTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chaptersTitle: {
    ...Typography.bodyMedium,
    fontWeight: '700',
  },
  chaptersRegen: {
    ...Typography.caption,
    fontWeight: '600',
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 8,
  },
  chapterTimePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  chapterTimeText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chapterTitleText: {
    flex: 1,
    ...Typography.bodyMedium,
    fontWeight: '500',
  },
  generateChaptersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingVertical: 12,
    marginBottom: Spacing.lg,
  },
  generateChaptersText: {
    ...Typography.bodyMedium,
    fontWeight: '700',
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  tagChipText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  noteModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  noteModalLabel: {
    ...Typography.bodyMedium,
    fontWeight: '600',
  },
  reTranscribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    marginTop: Spacing.sm,
  },
  contentArea: {
    marginTop: Spacing.md,
  },
  transcriptSection: {
    flex: 1,
  },
  timestampPill: {
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: Radius.pill, marginBottom: Spacing.sm, marginTop: Spacing.md,
  },
  timestampText: {
    ...Typography.caption,
  },
  transcriptBody: {
    ...Typography.bodyMedium,
    lineHeight: 26,
    marginBottom: Spacing.md,
    letterSpacing: -0.2,
  },
  summaryContainer: {
    marginTop: Spacing.md,
  },
  summarySectionTitle: {
    ...Typography.bodyLarge,
    marginBottom: Spacing.sm,
  },
  summaryCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderStyle: 'solid',
  },
  summaryText: {
    ...Typography.bodyMedium,
    lineHeight: 24,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  bullet: {
    width: 20,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  detailHeading: {
    ...Typography.bodyMedium,
    fontWeight: '700',
    marginBottom: 4,
  },
  keywordsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  keywordBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  keywordText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  tipsCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  tipsTitle: {
    ...Typography.bodyMedium,
    fontWeight: '700',
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60
  },
  processingText: {
    marginTop: 16,
    ...Typography.bodyMedium,
  },
  emptyContentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60
  },
  emptyContentText: {
    marginTop: 16,
    ...Typography.bodyMedium,
    textAlign: 'center',
    marginBottom: 24
  },
  actionButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: Radius.pill
  },
  actionButtonText: {
    color: '#FFFFFF',
    ...Typography.bodyMedium,
    fontWeight: '700'
  },
  bottomActionArea: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: Spacing.screenPadding,
    right: Spacing.screenPadding,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  quizQuestion: {
    ...Typography.bodyMedium,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  quizOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginTop: Spacing.xs,
  },
  quizOptionText: {
    ...Typography.bodyMedium,
    flex: 1,
    marginRight: Spacing.sm,
  },
  quizExplanation: {
    ...Typography.caption,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  scoreCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  scoreText: {
    ...Typography.bodyLarge,
    fontWeight: '700',
  },
  chatOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  chatSheet: {
    height: '80%',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    overflow: 'hidden',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  chatTitle: {
    ...Typography.titleMedium,
    fontWeight: '700',
  },
  chatList: {
    flex: 1,
  },
  chatHint: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: Spacing.xl,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  bubbleText: {
    ...Typography.bodyMedium,
    lineHeight: 21,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
  },
  chatInput: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    ...Typography.bodyMedium,
  },
  chatSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speakerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    paddingLeft: Spacing.sm,
  },
  speakerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 2,
  },
  speakerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  speakerBadgeText: {
    ...Typography.caption,
    fontWeight: '700',
  },
  translationHeaderRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  langBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  langBadgeText: {
    ...Typography.caption,
    fontWeight: '700',
  },
  translationText: {
    ...Typography.bodyLarge,
    fontWeight: '500',
    lineHeight: 27,
  },
  outlineButtonText: {
    ...Typography.bodyMedium,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.screenPadding
  },
  modalContent: {
    width: '100%',
    borderRadius: Radius.xl,
    padding: Spacing.xl
  },
  modalTitle: {
    ...Typography.titleMedium,
    marginBottom: Spacing.lg,
    textAlign: 'center'
  },
  modalInput: {
    height: 52,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    ...Typography.bodyMedium,
    marginBottom: Spacing.xl
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md
  },
  modalButton: {
    flex: 1,
    height: 52,
    borderRadius: Radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1
  },
});
