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
import * as FileSystem from 'expo-file-system/legacy';
import { useRecordingStore, RecordingMeta, LectureType, LECTURE_TYPE_LABELS, LECTURE_TYPE_ICONS } from '@/store/useRecordingStore';
import { quickTranscribe, summarizeText, translateText } from '@/api/aiService';
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
  startSec: number;       // start time in seconds
  endSec: number;         // end time in seconds (approx)
  text: string;
  isPending: boolean;     // true while being transcribed
}

interface QueuedChunk {
  chunkId: string;
  chunkIndex: number;
  uri: string;
  startSec: number;
  createdAt: number;
}

export default function RecordScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { addRecording, updateRecording, removeRecording } = useRecordingStore();
  const { translationLanguage } = useSettingsStore();

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
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);

  // ── Transcript state ──────────────────────────────────────────────────────
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const transcriptChunksRef = useRef<TranscriptChunk[]>([]);
  const chunkUrisRef = useRef<string[]>([]);
  const chunkQueueRef = useRef<QueuedChunk[]>([]);
  const processedOrQueuedChunksRef = useRef<Set<number>>(new Set());
  const isProcessorRunningRef = useRef(false);
  const isAIProcessingRef = useRef(false);
  const lastAITranscriptLengthRef = useRef(0);
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
    if (isRecording) {
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
  }, [isRecording]);

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
        const { uri: uriToProcess, chunkIndex, startSec } = item;

        try {
          // Mark chunk as pending in UI immediately
          const endSec = startSec + 30;
          const pendingChunk: TranscriptChunk = {
            index: chunkIndex,
            startSec,
            endSec,
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
              text = await quickTranscribe(uriToProcess);
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
              startSec,
              endSec,
              text: text.trim(),
              isPending: false,
            };
            transcriptChunksRef.current = upsertChunk(transcriptChunksRef.current, completedChunk);
            setTranscriptChunks([...transcriptChunksRef.current]);

            if (activeRecordingIdRef.current) {
              const fullTranscript = transcriptChunksRef.current
                .filter(c => !c.isPending && c.text)
                .map(c => c.text)
                .join('\n\n');
              updateRecording(activeRecordingIdRef.current, { transcript: fullTranscript });
              triggerAIUpdate();
            }
          } else if (!success) {
            // Remove pending chunk on permanent failure
            const failedChunk: TranscriptChunk = {
              index: chunkIndex,
              startSec,
              endSec,
              text: '[인식 실패]',
              isPending: false,
            };
            transcriptChunksRef.current = upsertChunk(transcriptChunksRef.current, failedChunk);
            setTranscriptChunks([...transcriptChunksRef.current]);
            console.error('[Transcription] chunk failed permanently');
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

  // ── AI update (throttled) ─────────────────────────────────────────────────
  const triggerAIUpdate = async (force = false) => {
    const currentTranscript = transcriptChunksRef.current
      .filter(c => !c.isPending && c.text && c.text !== '[인식 실패]')
      .map(c => c.text)
      .join('\n\n');
    const currentLength = currentTranscript.trim().length;

    if (!force && (isAIProcessingRef.current || currentLength - lastAITranscriptLengthRef.current < 500)) {
      return;
    }

    const recordingId = activeRecordingIdRef.current;
    if (!recordingId || !currentTranscript.trim()) return;

    console.log(`[AI Update] starting for transcript length: ${currentLength}`);
    isAIProcessingRef.current = true;
    setIsAIUpdating(true);

    try {
      const [sumRes, transRes] = await Promise.all([
        summarizeText(currentTranscript, selectedLectureType),
        translateText(currentTranscript, translationLanguage)
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
      lastAITranscriptLengthRef.current = currentLength;
      console.log(`[AI Update] success`);
    } catch (err) {
      console.warn(`[AI Update] failed:`, err);
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
    const startSec = chunkIndex * 30;
    chunkCounterRef.current += 1;

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
                startSec,
                createdAt: Date.now()
            });
            processTranscriptionQueue();
        }
      }
    } catch (err) {
      console.error(`[cycleChunk] ❌ Failed to cycle chunk #${chunkIndex}:`, err);
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

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ── Start recording ───────────────────────────────────────────────────────
  const startRecording = async () => {
    if (isStartingRecording || isRecording) return;

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
      console.error('[Recording] Startup failed:', err);
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
    clearRolloverTimer();
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
        }
      } else {
        console.warn('[stopRecording] getURI() returned null/empty');
      }

      // Transcribe final piece
      if (stableUri) {
        const chunkIndex = chunkCounterRef.current;
        const startSec = chunkIndex * 30;
        chunkCounterRef.current += 1;
        console.log(`[stopRecording] ▶ triggering transcription for final chunk #${chunkIndex} | URI: ${stableUri}`);
        if (!processedOrQueuedChunksRef.current.has(chunkIndex)) {
            processedOrQueuedChunksRef.current.add(chunkIndex);
            chunkQueueRef.current.push({ 
                chunkId: `chunk_${Date.now()}_${chunkIndex}`,
                uri: stableUri, 
                chunkIndex, 
                startSec,
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

      console.log('[stopRecording] running final AI pass...');
      await triggerAIUpdate(true);

      const fullString = transcriptChunksRef.current
        .filter(c => !c.isPending && c.text && c.text !== '[인식 실패]')
        .map(c => c.text)
        .join('\n\n');
      const rootUri = chunkUrisRef.current[0] || stableUri || '';
      console.log(`[stopRecording] final transcript length: ${fullString.length} chars | rootUri: ${rootUri}`);

      if (activeRecordingIdRef.current) {
        updateRecording(activeRecordingIdRef.current, {
          uri: rootUri,
          chunkUris: [...chunkUrisRef.current],
          duration: durationRef.current,
          transcript: fullString,
        });
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
                { backgroundColor: theme.accent, transform: [{ scale: pulseAnim }] },
              ]}
            >
              <MaterialIcons name="mic" size={18} color={theme.primary} />
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
              <Text style={[styles.emptyTranscript, { color: theme.textTertiary }]}>
                {isRecording ? '듣고 있습니다...' : '강의 녹음을 시작해주세요.'}
              </Text>
            ) : (
              transcriptChunks.map((chunk) => (
                <View key={chunk.index} style={styles.chunkItem}>
                  {/* Timestamp pill */}
                  <View
                    style={[styles.timestampPill, { backgroundColor: theme.unselectedChip ?? theme.border }]}
                  >
                    <MaterialIcons name="access-time" size={11} color={theme.textSecondary} />
                    <Text style={[styles.timestampText, { color: theme.textSecondary }]}>
                      {formatSeconds(chunk.startSec)} – {formatSeconds(chunk.endSec)}
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
