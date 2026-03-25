import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Alert, Linking, Animated, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useRecordingStore, RecordingMeta } from '@/store/useRecordingStore';
import { quickTranscribe, summarizeText, translateText } from '@/api/aiService';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Colors } from '@/constants/Colors';
import { Spacing, Radius, Typography, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RecordScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { addRecording, updateRecording, removeRecording } = useRecordingStore();
  const { translationLanguage } = useSettingsStore();

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const activeRecordingIdRef = useRef<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const [realtimeTranscript, setRealtimeTranscript] = useState<string[]>([]);
  const transcriptRef = useRef<string[]>([]);
  const chunkUrisRef = useRef<string[]>([]);
  const chunkQueueRef = useRef<string[]>([]);
  const isProcessorRunningRef = useRef(false);
  const isAIProcessingRef = useRef(false);
  const lastAITranscriptLengthRef = useRef(0);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAIUpdating, setIsAIUpdating] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  // Duration timer & pulsing animation
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => {
        setDuration((prev) => prev + 1000);
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

  const processTranscriptionQueue = async () => {
    if (isProcessorRunningRef.current) return;
    isProcessorRunningRef.current = true;

    try {
      while (chunkQueueRef.current.length > 0) {
        setIsTranscribing(true);
        const uriToProcess = chunkQueueRef.current[0];

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

        if (success) {
          if (text && text.trim()) {
            transcriptRef.current.push(text);
            setRealtimeTranscript([...transcriptRef.current]);
            
            if (activeRecordingIdRef.current) {
              updateRecording(activeRecordingIdRef.current, { 
                transcript: transcriptRef.current.join('\n\n') 
              });
              triggerAIUpdate(); // Trigger background AI pass (throttled)
            }
          }
        } else {
          console.error('[Transcription] chunk failed permanently');
        }

        chunkQueueRef.current.shift();
      }
    } finally {
      setIsTranscribing(false);
      isProcessorRunningRef.current = false;
    }
  };

  const triggerAIUpdate = async (force = false) => {
    const currentTranscript = transcriptRef.current.join('\n\n');
    const currentLength = currentTranscript.trim().length;
    
    // Throttling: Skip if already processing or total growth < 500 chars (approx 1.5-2 mins)
    // unless force is true (for the final pass).
    if (!force && (isAIProcessingRef.current || currentLength - lastAITranscriptLengthRef.current < 500)) {
      return;
    }

    const recordingId = activeRecordingIdRef.current;
    if (!recordingId || !currentTranscript.trim()) return;

    console.log(`[AI Update] starting for transcript length: ${currentLength}`);
    isAIProcessingRef.current = true;
    setIsAIUpdating(true);
    
    try {
      // Parallel execution for speed
      const [sumRes, transRes] = await Promise.all([
        summarizeText(currentTranscript),
        translateText(currentTranscript, translationLanguage)
      ]);

      const updates: any = {
        summary: sumRes.summary,
        translation: transRes
      };

      // Only update name if it hasn't been manually edited (though during recording it's almost always default)
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

  const cycleChunk = async () => {
    if (!isRecordingRef.current) return;
    const currentRec = recordingRef.current;
    if (!currentRec) return;

    try {
      await currentRec.stopAndUnloadAsync();
      const oldUri = currentRec.getURI();
      if (oldUri) chunkUrisRef.current.push(oldUri);

      if (isRecordingRef.current) {
        const { recording: newRec } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = newRec;
        setRecording(newRec);
      }

      if (oldUri) {
        chunkQueueRef.current.push(oldUri);
        processTranscriptionQueue();
      }
    } catch (err) {
      console.error('Failed to cycle chunk', err);
    }
  };

  useEffect(() => {
    let transInterval: ReturnType<typeof setInterval>;
    if (isRecording) {
      transInterval = setInterval(() => {
        cycleChunk();
      }, 30000);
    }
    return () => clearInterval(transInterval);
  }, [isRecording]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      chunkUrisRef.current = [];
      chunkQueueRef.current = [];
      isProcessorRunningRef.current = false;
      transcriptRef.current = [];
      setRealtimeTranscript([]);
      
      const { recording: newRec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      const recordingId = Date.now().toString();
      activeRecordingIdRef.current = recordingId;

      // Create initial session record in store
      const initialRecording: RecordingMeta = {
        id: recordingId,
        name: `강의 기록 ${new Date().toLocaleDateString()}`,
        titleSource: 'default',
        uri: newRec.getURI() || '',
        duration: 0,
        createdAt: Date.now(),
        folderId: null,
        transcript: ''
      };
      addRecording(initialRecording);

      recordingRef.current = newRec;
      setRecording(newRec);
      setIsRecording(true);
      isRecordingRef.current = true;
      setDuration(0);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('녹음 시작 실패', '녹음을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const stopRecording = async () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    
    const currentRec = recordingRef.current;
    if (!currentRec) return;
    
    try {
      await currentRec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      
      const finalUri = currentRec.getURI();
      if (finalUri) chunkUrisRef.current.push(finalUri);

      // Transcribe final piece by pushing to queue and waiting until drained
      if (finalUri) {
        chunkQueueRef.current.push(finalUri);
        processTranscriptionQueue();
      }

      setIsTranscribing(true); // Ensure UI shows processing while we wait
      while (chunkQueueRef.current.length > 0 || isProcessorRunningRef.current) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      setIsTranscribing(false);

      // Final AI pass: ensure summary and translation are current before exiting
      await triggerAIUpdate(true);

      const fullString = transcriptRef.current.join('\n\n');
      const rootUri = chunkUrisRef.current[0] || finalUri || '';

      if (activeRecordingIdRef.current) {
        updateRecording(activeRecordingIdRef.current, {
          uri: rootUri,
          chunkUris: [...chunkUrisRef.current],
          duration,
          transcript: fullString
        });
        activeRecordingIdRef.current = null;
        router.replace(`/(tabs)`);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  };

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleClose}
          style={[styles.circularButton, { backgroundColor: theme.surface, ...Shadows.soft }]}
        >
          <Feather name="x" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.timeStatusContainer}>
          <Text style={[styles.timer, { color: theme.text }]}>
            {formatTime(duration)}
          </Text>
          {isRecording && (
            <Animated.View style={[styles.statusPill, { backgroundColor: theme.accent, transform: [{ scale: pulseAnim }] }]}>
              <MaterialIcons name="mic" size={18} color={theme.primary} />
            </Animated.View>
          )}
        </View>

        <View style={[styles.transcriptCard, { backgroundColor: theme.surface, borderColor: theme.border, ...Shadows.medium }]}>
          <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>Real-time Transcription</Text>
          <ScrollView 
            ref={scrollViewRef}
            style={styles.transcriptScroll}
            contentContainerStyle={styles.transcriptContentContainer}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {realtimeTranscript.length === 0 ? (
              <Text style={[styles.emptyTranscript, { color: theme.textTertiary }]}>
                {isRecording ? '듣고 있습니다...' : '강의 녹음을 시작해주세요.'}
              </Text>
            ) : (
              realtimeTranscript.map((text, index) => (
                <Text key={index} style={[styles.transcriptText, { color: theme.text }]}>
                  {text}
                </Text>
              ))
            )}
          </ScrollView>
          {isTranscribing && (
            <View style={styles.processingRow}>
              <ActivityIndicator size="small" color={theme.textTertiary} />
              <Text style={[styles.processingText, { color: theme.textTertiary }]}>Processing...</Text>
            </View>
          )}
          {isAIUpdating && (
            <View style={styles.processingRow}>
              <ActivityIndicator size="small" color={theme.textTertiary} />
              <Text style={[styles.processingText, { color: theme.textTertiary }]}>AI Analysis...</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.controls}>
        {!isRecording ? (
          <TouchableOpacity
            style={[styles.mainButton, { backgroundColor: theme.primary, ...Shadows.floating }]}
            onPress={startRecording}
            activeOpacity={0.8}
          >
            <MaterialIcons name="mic" size={36} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.mainButton, styles.stopButton, { backgroundColor: theme.surface, borderColor: theme.border, ...Shadows.floating }]}
            onPress={stopRecording}
            activeOpacity={0.8}
          >
            <View style={[styles.stopSquare, { backgroundColor: theme.error }]} />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
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
  cardTitle: {
    ...Typography.caption,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptContentContainer: {
    paddingBottom: Spacing.md,
  },
  transcriptText: {
    ...Typography.bodyLarge,
    lineHeight: 28,
    marginBottom: Spacing.md,
  },
  emptyTranscript: {
    ...Typography.bodyLarge,
    marginTop: Spacing.xxl,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: Spacing.sm,
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
});
