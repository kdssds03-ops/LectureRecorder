import React, { useState, useEffect, useRef } from 'react';
import {
  AppState,
  AppStateStatus,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Linking,
  Animated,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { useRecordingStore, RecordingMeta, LectureType, LECTURE_TYPE_LABELS, LECTURE_TYPE_ICONS } from '@/store/useRecordingStore';
import { quickTranscribe, summarizeText, transcribeWithSpeakers, translateText } from '@/api/aiService';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Colors } from '@/constants/Colors';
import { Spacing, Radius, Typography, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Ordered list for the lecture type picker
const LECTURE_TYPE_LIST: LectureType[] = [
  'general',
  'math',
  'science',
  'coding',
  'humanities',
  'language',
  'history',
  'economics',
  'law',
  'medicine',
  'art',
  'other',
];

// ── Audio file persistence helpers ────────────────────────────────────────────

/**
 * Copies a temp/cache audio URI to a stable permanent path in documentDirectory.
 * Returns the new permanent URI, or the original URI if the copy fails.
 */
async function persistAudioFile(tempUri: string, suffix: string): Promise<string> {
  try {
    const dest = `${FileSystem.documentDirectory}recording_${suffix}.m4a`;
    await FileSystem.copyAsync({ from: tempUri, to: dest });
    console.log(`[persistAudio] copied ${tempUri} → ${dest}`);
    return dest;
  } catch (err) {
    console.warn(`[persistAudio] copy failed for ${tempUri}:`, err);
    return tempUri; // fall back to original — better than losing the recording
  }
}

/**
 * Validates that a file exists at the given URI and has a non-zero size.
 * Returns { ok: boolean, size: number }.
 */
async function validateAudioFile(uri: string): Promise<{ ok: boolean; size: number }> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const size = (info as any).size ?? 0;
    if (!info.exists || size === 0) {
      console.error(`[validateAudio] INVALID: exists=${info.exists} size=${size} uri=${uri}`);
      return { ok: false, size };
    }
    console.log(`[validateAudio] OK: size=${size} bytes | uri=${uri}`);
    return { ok: true, size };
  } catch (err) {
    console.error(`[validateAudio] getInfoAsync failed for ${uri}:`, err);
    return { ok: false, size: 0 };
  }
}

interface TranscriptChunk {
  index: number;          // 0-based chunk index
  startMs: number;        // start time within recording (ms, real elapsed)
  endMs: number;          // end time within recording (ms, real elapsed)
  text: string;
  isPending: boolean;     // true while being transcribed
}

function buildCleanTranscript(chunks: TranscriptChunk[]): string {
  const textsToMerge = chunks
    .filter(c => !c.isPending && c.text && c.text !== '[인식 실패]')
    .map(c => c.text);
  
  if (textsToMerge.length === 0) return '';
  
  let fullTranscript = textsToMerge[0];
  for (let i = 1; i < textsToMerge.length; i++) {
    const currentStr = textsToMerge[i];
    let overlapFound = false;
    const maxOverlap = Math.min(50, fullTranscript.length, currentStr.length);
    for (let o = maxOverlap; o > 0; o--) {
      if (fullTranscript.endsWith(currentStr.substring(0, o))) {
        fullTranscript += currentStr.substring(o);
        overlapFound = true;
        break;
      }
    }
    if (!overlapFound) {
      fullTranscript += '\n\n' + currentStr;
    }
  }
  return fullTranscript;
}

interface QueuedChunk {
  chunkId: string;
  chunkIndex: number;
  uri: string;
  startMs: number;
  endMs: number;
  createdAt: number;
}

export default function RecordScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { addRecording, updateRecording, removeRecording } = useRecordingStore();
  const { recognitionLanguage, summaryLanguage, translationLanguage } = useSettingsStore();

  // ── Lecture type selection ────────────────────────────────────────────────
  const [selectedLectureType, setSelectedLectureType] = useState<LectureType>('general');
  const [isTypePickerVisible, setIsTypePickerVisible] = useState(false);

  // ── Recording state ───────────────────────────────────────────────────────
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const activeRecordingIdRef = useRef<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  // Guard: set to true during stopRecording to prevent cycleChunk from starting a new recording
  const isStoppingRef = useRef(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);

  // ── Highlights / bookmarks (captured live during recording) ───────────────
  const highlightsRef = useRef<number[]>([]);
  const [highlightCount, setHighlightCount] = useState(0);

  // Real start time (ms) of the chunk currently being recorded — gives accurate
  // segment timestamps that stay correct even across pause/resume.
  const chunkStartMsRef = useRef(0);
  // Per-chunk audio durations (ms), aligned 1:1 with chunkUrisRef.
  const chunkDurationsRef = useRef<number[]>([]);

  // ── Transcript state ──────────────────────────────────────────────────────
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const transcriptChunksRef = useRef<TranscriptChunk[]>([]);
  const chunkUrisRef = useRef<string[]>([]);
  const chunkQueueRef = useRef<QueuedChunk[]>([]);
  const processedOrQueuedChunksRef = useRef<Set<number>>(new Set());
  const isProcessorRunningRef = useRef(false);
  const isAIProcessingRef = useRef(false);
  const chunkCounterRef = useRef(0);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAIUpdating, setIsAIUpdating] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);

  const isRolloverInProgressRef = useRef(false);
  const rolloverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRolloverTimer = () => {
    if (rolloverTimeoutRef.current) {
      clearTimeout(rolloverTimeoutRef.current);
      rolloverTimeoutRef.current = null;
    }
  };

  const scheduleNextRollover = () => {
    clearRolloverTimer();
    rolloverTimeoutRef.current = setTimeout(() => {
      cycleChunk();
    }, 30000);
  };

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  // ── Duration timer & pulsing animation ───────────────────────────────────
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setDuration((prev) => {
          const next = prev + 1000;
          durationRef.current = next;
          return next;
        });
      }, 1000);

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // ── Global Audio Session Cleanup on Unmount ───────────────────────────────
  useEffect(() => {
    return () => {
      console.log('[RecordScreen] Unmounting, performing emergency cleanup...');
      clearRolloverTimer();
      if (isRecordingRef.current) {
        console.log('[RecordScreen] Stopping active recording during unmount');
        recordingRef.current?.stopAndUnloadAsync().catch(err =>
          console.warn('[RecordScreen] Unmount stop failed:', err)
        );
      }
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(err => console.warn('[RecordScreen] Unmount mode reset failed:', err));
    };
  }, []);

  // ── AppState listener: detect interruptions and background transitions ────
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (!isRecordingRef.current) return;

      if (nextState === 'background' || nextState === 'inactive') {
        // iOS: if UIBackgroundModes audio is correctly set, recording continues.
        // Log this so we can verify on-device. If recording stops here, it means
        // UIBackgroundModes is still not applied (requires a native rebuild).
        console.log(`[AppState] ⚠️ App moved to background/inactive while recording — state: ${nextState}`);
        console.log('[AppState] Recording should continue if UIBackgroundModes:audio is active in the native build.');
      } else if (nextState === 'active') {
        console.log('[AppState] ✅ App returned to active — verifying recording object is still alive...');
        const rec = recordingRef.current;
        if (rec) {
          // getStatusAsync() is the lightest way to probe whether the native recorder is still active
          rec.getStatusAsync()
            .then((status) => {
              console.log(`[AppState] Recording status after resume: isRecording=${status.isRecording} durationMs=${status.durationMillis}`);
              if (!status.isRecording) {
                console.error('[AppState] ❌ Recording object is NOT active after app resume — session may have been interrupted!');
              }
            })
            .catch((err) => {
              console.error('[AppState] getStatusAsync failed after resume:', err);
            });
        } else {
          console.error('[AppState] ❌ recordingRef is null after app resume — recording was lost!');
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  // ── Transcription queue processor ────────────────────────────────────────
  const processTranscriptionQueue = async () => {
    if (isProcessorRunningRef.current) return;
    isProcessorRunningRef.current = true;

    try {
      while (chunkQueueRef.current.length > 0) {
        setIsTranscribing(true);
        // Shift safely at the start so a sync throw doesn't stall the loop
        const item = chunkQueueRef.current.shift()!;
        const { uri: uriToProcess, chunkIndex, startMs, endMs } = item;

        try {
          // Mark chunk as pending in UI immediately
          const pendingChunk: TranscriptChunk = {
            index: chunkIndex,
            startMs,
            endMs,
            text: '',
            isPending: true,
          };
          transcriptChunksRef.current = upsertChunk(transcriptChunksRef.current, pendingChunk);
          setTranscriptChunks([...transcriptChunksRef.current]);

          let success = false;
          let text = '';
          let retries = 0;

          while (!success && retries < 3) {
            try {
              text = await quickTranscribe(uriToProcess, recognitionLanguage);
              success = true;
            } catch (err) {
              retries++;
              console.warn(`[Transcription] chunk failed, retry ${retries}/3`, err);
              if (retries < 3) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
          }

          if (success && text && text.trim()) {
            const completedChunk: TranscriptChunk = {
              index: chunkIndex,
              startMs,
              endMs,
              text: text.trim(),
              isPending: false,
            };
            transcriptChunksRef.current = upsertChunk(transcriptChunksRef.current, completedChunk);
            setTranscriptChunks([...transcriptChunksRef.current]);

            if (activeRecordingIdRef.current) {
              const fullTranscript = buildCleanTranscript(transcriptChunksRef.current);
              updateRecording(activeRecordingIdRef.current, { transcript: fullTranscript });
            }
          } else if (!success) {
            // Remove pending chunk on permanent failure
            const failedChunk: TranscriptChunk = {
              index: chunkIndex,
              startMs,
              endMs,
              text: '[인식 실패]',
              isPending: false,
            };
            transcriptChunksRef.current = upsertChunk(transcriptChunksRef.current, failedChunk);
            setTranscriptChunks([...transcriptChunksRef.current]);
            console.warn('[Transcription] chunk failed permanently');
          } else {
            // Empty text — remove pending placeholder
            transcriptChunksRef.current = transcriptChunksRef.current.filter(
              c => c.index !== chunkIndex
            );
            setTranscriptChunks([...transcriptChunksRef.current]);
          }
        } catch (fatalErr) {
          console.error(`[Transcription] Fatal error processing chunk #${chunkIndex}:`, fatalErr);
        }
      }
    } finally {
      setIsTranscribing(false);
      isProcessorRunningRef.current = false;
    }
  };

  /** Upsert a chunk by index (replace if exists, append if new) */
  function upsertChunk(chunks: TranscriptChunk[], newChunk: TranscriptChunk): TranscriptChunk[] {
    const idx = chunks.findIndex(c => c.index === newChunk.index);
    if (idx >= 0) {
      const updated = [...chunks];
      updated[idx] = newChunk;
      return updated;
    }
    return [...chunks, newChunk].sort((a, b) => a.index - b.index);
  }

  // ── Final AI post-processing ──────────────────────────────────────────────
  const generateFinalAIContent = async () => {
    if (isAIProcessingRef.current) return;

    const recordingId = activeRecordingIdRef.current;
    if (!recordingId) return;

    const fullTranscript = buildCleanTranscript(transcriptChunksRef.current);
    if (!fullTranscript.trim()) return;

    console.log(`[Final AI Update] starting for transcript length: ${fullTranscript.length}`);
    isAIProcessingRef.current = true;
    setIsAIUpdating(true);

    try {
      const customInstruction = useSettingsStore.getState().summaryTemplates?.[selectedLectureType] || '';
      const [sumRes, transRes] = await Promise.all([
        summarizeText(fullTranscript, selectedLectureType, summaryLanguage, customInstruction),
        translateText(fullTranscript, translationLanguage)
      ]);

      const updates: any = {
        summary: sumRes.summary,
        translation: transRes,
      };

      if (sumRes.suggestedName) {
        updates.name = sumRes.suggestedName;
        updates.titleSource = 'ai';
      }

      updateRecording(recordingId, updates);
      console.log(`[Final AI Update] success`);
    } catch (err) {
      console.warn(`[Final AI Update] failed gracefully, transcript preserved:`, err);
    } finally {
      isAIProcessingRef.current = false;
      setIsAIUpdating(false);
    }
  };

  // ── 30-second chunk cycling ───────────────────────────────────────────────
  const cycleChunk = async () => {
    // Do not cycle if we are in the stop or pre-stop flow
    if (!isRecordingRef.current || isStoppingRef.current || isRolloverInProgressRef.current) return;
    isRolloverInProgressRef.current = true;
    clearRolloverTimer();

    const currentRec = recordingRef.current;
    if (!currentRec) {
      isRolloverInProgressRef.current = false;
      return;
    }

    const chunkIndex = chunkCounterRef.current;
    const startMs = chunkStartMsRef.current;
    const endMs = durationRef.current;
    chunkCounterRef.current += 1;
    chunkStartMsRef.current = endMs; // next chunk starts where this one ended

    console.log(`[cycleChunk] ▶ starting rollover for chunk #${chunkIndex} | elapsed ${Math.round(durationRef.current / 1000)}s`);

    try {
      await currentRec.stopAndUnloadAsync();
      const rawUri = currentRec.getURI();
      console.log(`[cycleChunk] chunk #${chunkIndex} stopped | raw URI: ${rawUri}`);

      let stableUri: string | null = null;
      if (rawUri) {
        // Copy to stable path before queuing to avoid OS cleaning the cache
        stableUri = await persistAudioFile(rawUri, `chunk_${Date.now()}_${chunkIndex}`);
        const validation = await validateAudioFile(stableUri);
        if (!validation.ok) {
          console.warn(`[cycleChunk] chunk #${chunkIndex} invalid after persist, skipping transcription`);
          stableUri = null;
        } else {
          chunkUrisRef.current.push(stableUri);
          chunkDurationsRef.current.push(Math.max(0, endMs - startMs));
          console.log(`[cycleChunk] ✅ chunk #${chunkIndex} persisted | size=${validation.size} bytes`);
        }
      }

      // Re-check: stop may have been called while we were persisting the file
      if (isRecordingRef.current && !isStoppingRef.current) {
        // Re-assert audio session in case it was disrupted during the persist window
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          interruptionModeIOS: 1, // DoNotMix
          shouldDuckAndroid: true,
          interruptionModeAndroid: 1,
          playThroughEarpieceAndroid: false,
        });
        const { recording: newRec } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = newRec;
        setRecording(newRec);
        console.log(`[cycleChunk] ✅ new recording started for chunk #${chunkCounterRef.current}`);
        scheduleNextRollover();
      } else {
        console.log(`[cycleChunk] stop detected after persist — not starting new recording for chunk #${chunkCounterRef.current}`);
      }

      if (stableUri) {
        if (!processedOrQueuedChunksRef.current.has(chunkIndex)) {
            processedOrQueuedChunksRef.current.add(chunkIndex);
            console.log(`[cycleChunk] queuing chunk #${chunkIndex} for transcription | URI: ${stableUri}`);
            chunkQueueRef.current.push({
                chunkId: `chunk_${Date.now()}_${chunkIndex}`,
                uri: stableUri,
                chunkIndex,
                startMs,
                endMs,
                createdAt: Date.now()
            });
            processTranscriptionQueue();
        }
      }
    } catch (err) {
      console.warn(`[cycleChunk] ❌ Failed to cycle chunk #${chunkIndex}:`, err);
    } finally {
      isRolloverInProgressRef.current = false;
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // ── Start recording ───────────────────────────────────────────────────────
  const startRecording = async () => {
    if (isStartingRecording || isRecording) return;

    // Free-tier minute gate: block new recordings once the monthly quota is used up.
    if (!useSubscriptionStore.getState().canTranscribe()) {
      router.push('/paywall' as any);
      return;
    }

    setIsStartingRecording(true);
    console.log('[Recording] Attempting to start recording...');

    try {
      console.log('[Recording] Requesting permissions...');
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        console.warn('[Recording] Permission denied');
        Alert.alert(
          '마이크 권한 필요',
          '강의를 녹음하려면 마이크 접근 권한이 필요합니다.',
          [
            { text: '취소', style: 'cancel' },
            { text: '설정 열기', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      console.log('[Recording] Cleaning up existing audio mode...');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      console.log('[Recording] Configuring audio session for recording...');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: 1, // DoNotMix
        shouldDuckAndroid: true,
        interruptionModeAndroid: 1, // DoNotMix
        playThroughEarpieceAndroid: false,
      });

      // Crucial: wait for iOS audio session to activate
      console.log('[Recording] Waiting for session activation...');
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('[Recording] Creating new recording instance...');
      const { recording: newRec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      const recordingId = Date.now().toString();
      activeRecordingIdRef.current = recordingId;
      chunkCounterRef.current = 0;
      chunkStartMsRef.current = 0;
      chunkDurationsRef.current = [];
      highlightsRef.current = [];
      setHighlightCount(0);
      isPausedRef.current = false;
      setIsPaused(false);

      console.log('[Recording] Initializing session in store with ID:', recordingId);
      const initialRecording: RecordingMeta = {
        id: recordingId,
        name: `강의 기록 ${new Date().toLocaleDateString()}`,
        titleSource: 'default',
        uri: newRec.getURI() || '',
        duration: 0,
        createdAt: Date.now(),
        folderId: null,
        lectureType: selectedLectureType,
        transcript: '',
      };
      addRecording(initialRecording);

      recordingRef.current = newRec;
      setRecording(newRec);
      setIsRecording(true);
      isRecordingRef.current = true;
      setDuration(0);
      durationRef.current = 0;
      setTranscriptChunks([]);
      transcriptChunksRef.current = [];
      processedOrQueuedChunksRef.current.clear();
      console.log('[Recording] Startup complete');
      scheduleNextRollover();
    } catch (err) {
      console.warn('[Recording] Startup failed:', err);
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch (_) {}
      Alert.alert('녹음 시작 실패', '녹음을 시작할 수 없습니다. 마이크가 다른 앱에서 사용 중인지 확인해 주세요.');
    } finally {
      setIsStartingRecording(false);
    }
  };

  // ── Stop recording ────────────────────────────────────────────────────────
  const stopRecording = async () => {
    if (!isRecording) return;

    // Set both flags atomically so cycleChunk will not start a new recording object
    isRecordingRef.current = false;
    isStoppingRef.current = true;
    setIsRecording(false);
    isPausedRef.current = false;
    setIsPaused(false);
    clearRolloverTimer();
    // Capture the final chunk's real time bounds before any awaits mutate refs.
    const finalStartMs = chunkStartMsRef.current;
    const finalEndMs = durationRef.current;
    console.log(`[stopRecording] ▶ triggered | session duration: ${Math.round(durationRef.current / 1000)}s | chunks accumulated: ${chunkCounterRef.current}`);

    const currentRec = recordingRef.current;
    if (!currentRec) {
      console.warn('[stopRecording] No active recording ref found during stop');
      return;
    }

    try {
      console.log('[stopRecording] ■ stopping and unloading recording...');
      await currentRec.stopAndUnloadAsync();
      console.log('[stopRecording] stopAndUnloadAsync done');

      console.log('[stopRecording] resetting audio mode...');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const rawUri = currentRec.getURI();
      console.log(`[stopRecording] original URI from getURI(): ${rawUri}`);

      let stableUri: string | null = null;
      if (rawUri) {
        // Copy to a stable permanent location before doing anything else.
        // The OS can clean cache/ at any time; documentDirectory is safe.
        stableUri = await persistAudioFile(rawUri, `final_${Date.now()}`);
        console.log(`[stopRecording] persisted URI: ${stableUri}`);

        // Validate the persisted file before transcription
        const validation = await validateAudioFile(stableUri);
        console.log(`[stopRecording] file validation: ok=${validation.ok} size=${validation.size}`);

        if (!validation.ok) {
          console.error('[stopRecording] persisted file is invalid (0 bytes or missing) — aborting transcription');
          stableUri = null;
        } else {
          chunkUrisRef.current.push(stableUri);
          chunkDurationsRef.current.push(Math.max(0, finalEndMs - finalStartMs));
        }
      } else {
        console.warn('[stopRecording] getURI() returned null/empty');
      }

      // Transcribe final piece
      if (stableUri) {
        const chunkIndex = chunkCounterRef.current;
        chunkCounterRef.current += 1;
        console.log(`[stopRecording] ▶ triggering transcription for final chunk #${chunkIndex} | URI: ${stableUri}`);
        if (!processedOrQueuedChunksRef.current.has(chunkIndex)) {
            processedOrQueuedChunksRef.current.add(chunkIndex);
            chunkQueueRef.current.push({
                chunkId: `chunk_${Date.now()}_${chunkIndex}`,
                uri: stableUri,
                chunkIndex,
                startMs: finalStartMs,
                endMs: finalEndMs,
                createdAt: Date.now()
            });
            processTranscriptionQueue();
        }
      } else {
        console.warn('[stopRecording] no valid final URI — skipping transcription of final chunk');
      }

      setIsTranscribing(true);
      console.log('[stopRecording] waiting for transcription queue to drain...');
      while (chunkQueueRef.current.length > 0 || isProcessorRunningRef.current) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      setIsTranscribing(false);
      console.log('[stopRecording] transcription queue drained');

      const fullString = buildCleanTranscript(transcriptChunksRef.current);
      const rootUri = chunkUrisRef.current[0] || stableUri || '';
      console.log(`[stopRecording] final transcript length: ${fullString.length} chars | rootUri: ${rootUri}`);

      // Time-aligned segments enable tap-to-seek + active-segment highlighting in the detail view.
      const segments = transcriptChunksRef.current
        .filter((c) => !c.isPending && c.text && c.text !== '[인식 실패]')
        .map((c) => ({ startMs: c.startMs, endMs: c.endMs, text: c.text }))
        .sort((a, b) => a.startMs - b.startMs);

      if (activeRecordingIdRef.current) {
        updateRecording(activeRecordingIdRef.current, {
          uri: rootUri,
          chunkUris: [...chunkUrisRef.current],
          chunkDurations: [...chunkDurationsRef.current],
          duration: durationRef.current,
          transcript: fullString,
          segments,
          highlights: [...highlightsRef.current].sort((a, b) => a - b),
          source: 'recording',
        });

        // Meter speech-to-text usage by the recorded duration.
        useSubscriptionStore.getState().consumeSeconds(durationRef.current / 1000);

        console.log('[stopRecording] running final AI pass...');
        await generateFinalAIContent();

        // Optional automatic speaker diarization: when enabled, run a background
        // full-file diarized pass (non-blocking) and replace transcript/segments
        // with speaker-labeled, time-aligned results when it finishes.
        if (useSettingsStore.getState().diarizationEnabled && chunkUrisRef.current.length > 0) {
          const diarId = activeRecordingIdRef.current;
          const diarUris = [...chunkUrisRef.current];
          const diarLang = recognitionLanguage;
          transcribeWithSpeakers(diarUris, diarLang)
            .then(({ transcript, segments: diarSegs }) => {
              if (diarId && transcript && transcript.trim()) {
                updateRecording(diarId, { transcript, segments: diarSegs });
                console.log('[autoDiarize] applied speaker-labeled transcript');
              }
            })
            .catch((e) => console.warn('[autoDiarize] failed (non-fatal):', e));
        }

        console.log(`[stopRecording] ✅ recording saved | id=${activeRecordingIdRef.current} | chunks=${chunkUrisRef.current.length} | transcript=${fullString.length} chars`);
        activeRecordingIdRef.current = null;
        isStoppingRef.current = false;
        router.replace(`/(tabs)`);
      }
    } catch (err) {
      console.error('[stopRecording] ❌ failed:', err);
      isStoppingRef.current = false;
    }
  };

  // ── Pause / Resume ────────────────────────────────────────────────────────
  const pauseRecording = async () => {
    if (!isRecordingRef.current || isPausedRef.current || isRolloverInProgressRef.current) return;
    try {
      clearRolloverTimer();
      await recordingRef.current?.pauseAsync();
      isPausedRef.current = true;
      setIsPaused(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      console.log('[pauseRecording] paused');
    } catch (err) {
      console.warn('[pauseRecording] failed:', err);
    }
  };

  const resumeRecording = async () => {
    if (!isRecordingRef.current || !isPausedRef.current) return;
    try {
      await recordingRef.current?.startAsync();
      isPausedRef.current = false;
      setIsPaused(false);
      scheduleNextRollover();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      console.log('[resumeRecording] resumed');
    } catch (err) {
      console.warn('[resumeRecording] failed:', err);
    }
  };

  // ── Highlight / bookmark the current moment ───────────────────────────────
  const addHighlight = () => {
    if (!isRecordingRef.current) return;
    const at = durationRef.current;
    // Avoid duplicate marks within 1s
    if (highlightsRef.current.some((h) => Math.abs(h - at) < 1000)) return;
    highlightsRef.current = [...highlightsRef.current, at];
    setHighlightCount(highlightsRef.current.length);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    console.log(`[addHighlight] marked at ${Math.round(at / 1000)}s (total ${highlightsRef.current.length})`);
  };

  // ── Cancel recording ──────────────────────────────────────────────────────
  const handleClose = () => {
    if (isRecording) {
      Alert.alert(
        '녹음 중단',
        '현재 녹음 중인 내용을 취소할까요?',
        [
          { text: '계속 녹음', style: 'cancel' },
          {
            text: '취소하기',
            style: 'destructive',
            onPress: async () => {
              isRecordingRef.current = false;
              setIsRecording(false);
              isPausedRef.current = false;
              setIsPaused(false);
              clearRolloverTimer();
              processedOrQueuedChunksRef.current.clear();
              const idToDelete = activeRecordingIdRef.current;
              activeRecordingIdRef.current = null;

              try {
                if (idToDelete) {
                  await removeRecording(idToDelete);
                }
                await recordingRef.current?.stopAndUnloadAsync();
                await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
              } catch (_) {}
              recordingRef.current = null;
              setRecording(null);
              router.back();
            },
          },
        ]
      );
    } else {
      router.back();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleClose}
          style={[styles.circularButton, { backgroundColor: theme.surface, ...Shadows.soft }]}
        >
          <Feather name="x" size={24} color={theme.text} />
        </TouchableOpacity>

        {/* Lecture type badge — tappable only before recording starts */}
        <TouchableOpacity
          onPress={() => !isRecording && setIsTypePickerVisible(true)}
          style={[
            styles.lectureTypeBadge,
            { backgroundColor: theme.surface, borderColor: theme.border, ...Shadows.soft },
          ]}
          activeOpacity={isRecording ? 1 : 0.7}
        >
          <Text style={styles.lectureTypeIcon}>{LECTURE_TYPE_ICONS[selectedLectureType]}</Text>
          <Text style={[styles.lectureTypeLabel, { color: theme.text }]}>
            {LECTURE_TYPE_LABELS[selectedLectureType]}
          </Text>
          {!isRecording && (
            <Feather name="chevron-down" size={14} color={theme.textSecondary} style={{ marginLeft: 2 }} />
          )}
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Timer + status */}
        <View style={styles.timeStatusContainer}>
          <Text style={[styles.timer, { color: theme.text }]}>
            {formatTime(duration)}
          </Text>
          {isRecording && (
            <Animated.View
              style={[
                styles.statusPill,
                {
                  backgroundColor: isPaused ? theme.unselectedChip : theme.accent,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <MaterialIcons
                name={isPaused ? 'pause' : 'mic'}
                size={18}
                color={isPaused ? theme.textSecondary : theme.primary}
              />
            </Animated.View>
          )}
        </View>

        {/* Transcript card with 30s chunks */}
        <View
          style={[
            styles.transcriptCard,
            { backgroundColor: theme.surface, borderColor: theme.border, ...Shadows.medium },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>실시간 전사</Text>
            {transcriptChunks.length > 0 && (
              <Text style={[styles.chunkCount, { color: theme.textTertiary }]}>
                {transcriptChunks.filter(c => !c.isPending).length} 구간
              </Text>
            )}
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.transcriptScroll}
            contentContainerStyle={styles.transcriptContentContainer}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {transcriptChunks.length === 0 ? (
              <View>
                <Text style={[styles.emptyTranscript, { color: theme.textTertiary }]}>
                  {isRecording ? (isPaused ? '일시정지됨' : '듣고 있습니다...') : '강의 녹음을 시작해주세요.'}
                </Text>
                {!isRecording && (
                  <Text style={[styles.emptyTranscript, { color: theme.textTertiary, fontSize: 11, marginTop: 8, paddingHorizontal: 16, lineHeight: 16 }]}>
                    타인의 음성을 녹음할 때는 사전에 동의를 받는 등 관련 법령을 준수해 주세요.
                  </Text>
                )}
              </View>
            ) : (
              transcriptChunks.map((chunk) => (
                <View key={chunk.index} style={styles.chunkItem}>
                  {/* Timestamp pill */}
                  <View
                    style={[styles.timestampPill, { backgroundColor: theme.unselectedChip ?? theme.border }]}
                  >
                    <MaterialIcons name="access-time" size={11} color={theme.textSecondary} />
                    <Text style={[styles.timestampText, { color: theme.textSecondary }]}>
                      {formatTime(chunk.startMs)} – {formatTime(chunk.endMs)}
                    </Text>
                  </View>

                  {/* Chunk text or pending indicator */}
                  {chunk.isPending ? (
                    <View style={styles.pendingRow}>
                      <ActivityIndicator size="small" color={theme.textTertiary} />
                      <Text style={[styles.pendingText, { color: theme.textTertiary }]}>
                        인식 중...
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.transcriptText, { color: theme.text }]}>
                      {chunk.text}
                    </Text>
                  )}
                </View>
              ))
            )}
          </ScrollView>

          {/* Status indicators */}
          <View style={styles.statusRow}>
            {isTranscribing && (
              <View style={styles.processingRow}>
                <ActivityIndicator size="small" color={theme.textTertiary} />
                <Text style={[styles.processingText, { color: theme.textTertiary }]}>처리 중...</Text>
              </View>
            )}
            {isAIUpdating && (
              <View style={styles.processingRow}>
                <ActivityIndicator size="small" color={theme.textTertiary} />
                <Text style={[styles.processingText, { color: theme.textTertiary }]}>AI 분석 중...</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {!isRecording ? (
          <TouchableOpacity
            style={[styles.mainButton, { backgroundColor: theme.primary, ...Shadows.floating }]}
            onPress={startRecording}
            activeOpacity={0.8}
            disabled={isStartingRecording}
          >
            {isStartingRecording ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <MaterialIcons name="mic" size={36} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.recordingControlsRow}>
            {/* Highlight / bookmark current moment */}
            <View style={styles.sideControl}>
              <TouchableOpacity
                style={[styles.sideButton, { backgroundColor: theme.surface, borderColor: theme.border, ...Shadows.soft }]}
                onPress={addHighlight}
                activeOpacity={0.7}
              >
                <MaterialIcons name="bookmark-add" size={26} color={theme.accent} />
                {highlightCount > 0 && (
                  <View style={[styles.highlightBadge, { backgroundColor: theme.accent }]}>
                    <Text style={styles.highlightBadgeText}>{highlightCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={[styles.sideLabel, { color: theme.textSecondary }]}>북마크</Text>
            </View>

            {/* Stop */}
            <TouchableOpacity
              style={[
                styles.mainButton,
                styles.stopButton,
                { backgroundColor: theme.surface, borderColor: theme.border, ...Shadows.floating },
              ]}
              onPress={stopRecording}
              activeOpacity={0.8}
            >
              <View style={[styles.stopSquare, { backgroundColor: theme.error }]} />
            </TouchableOpacity>

            {/* Pause / Resume */}
            <View style={styles.sideControl}>
              <TouchableOpacity
                style={[styles.sideButton, { backgroundColor: theme.surface, borderColor: theme.border, ...Shadows.soft }]}
                onPress={isPaused ? resumeRecording : pauseRecording}
                activeOpacity={0.7}
              >
                <MaterialIcons name={isPaused ? 'play-arrow' : 'pause'} size={28} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.sideLabel, { color: theme.textSecondary }]}>
                {isPaused ? '재개' : '일시정지'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Lecture type picker modal */}
      <Modal
        visible={isTypePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsTypePickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsTypePickerVisible(false)}
        >
          <View
            style={[styles.pickerSheet, { backgroundColor: theme.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={[styles.pickerHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.pickerTitle, { color: theme.text }]}>강의 종류 선택</Text>
            <Text style={[styles.pickerSubtitle, { color: theme.textSecondary }]}>
              선택한 종류에 맞게 AI 요약이 최적화됩니다
            </Text>

            <FlatList
              data={LECTURE_TYPE_LIST}
              keyExtractor={(item) => item}
              numColumns={2}
              columnWrapperStyle={styles.pickerGrid}
              renderItem={({ item }) => {
                const isSelected = item === selectedLectureType;
                return (
                  <TouchableOpacity
                    style={[
                      styles.typeCard,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.background,
                        borderColor: isSelected ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => {
                      setSelectedLectureType(item);
                      setIsTypePickerVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.typeCardIcon}>{LECTURE_TYPE_ICONS[item]}</Text>
                    <Text
                      style={[
                        styles.typeCardLabel,
                        { color: isSelected ? '#FFFFFF' : theme.text },
                      ]}
                      numberOfLines={2}
                    >
                      {LECTURE_TYPE_LABELS[item]}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  circularButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lectureTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
    gap: 4,
  },
  lectureTypeIcon: {
    fontSize: 16,
  },
  lectureTypeLabel: {
    ...Typography.bodySmall,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  timeStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  timer: {
    ...Typography.titleLarge,
    fontSize: 48,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transcriptCard: {
    flex: 1,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing.md,
    borderWidth: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  cardTitle: {
    ...Typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chunkCount: {
    ...Typography.caption,
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptContentContainer: {
    paddingBottom: Spacing.md,
  },
  chunkItem: {
    marginBottom: Spacing.lg,
  },
  timestampPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    marginBottom: Spacing.xs,
    gap: 3,
  },
  timestampText: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  pendingText: {
    ...Typography.bodySmall,
    fontStyle: 'italic',
  },
  transcriptText: {
    ...Typography.bodyLarge,
    lineHeight: 28,
  },
  emptyTranscript: {
    ...Typography.bodyLarge,
    marginTop: Spacing.xxl,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  processingText: {
    ...Typography.caption,
  },
  controls: {
    alignItems: 'center',
    paddingBottom: 60,
  },
  mainButton: {
    width: 80,
    height: 80,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    borderWidth: 1,
  },
  stopSquare: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  recordingControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  sideControl: {
    alignItems: 'center',
    gap: Spacing.xs,
    width: 64,
  },
  sideButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideLabel: {
    ...Typography.caption,
    fontWeight: '600',
  },
  highlightBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  highlightBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 40,
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  pickerTitle: {
    ...Typography.titleMedium,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  pickerSubtitle: {
    ...Typography.bodySmall,
    marginBottom: Spacing.lg,
  },
  pickerGrid: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  typeCard: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 80,
    justifyContent: 'center',
  },
  typeCardIcon: {
    fontSize: 24,
  },
  typeCardLabel: {
    ...Typography.bodySmall,
    fontWeight: '600',
    textAlign: 'center',
  },
});
