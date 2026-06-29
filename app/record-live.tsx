// EXPERIMENTAL: Live streaming recorder with real-time speaker diarization.
// Captures mic PCM via react-native-live-audio-stream, streams it to AssemblyAI
// Universal Streaming (v3) for live diarized transcription, and saves the audio
// as a single WAV file. The production chunk recorder (/record) is untouched.
//
// Requires a development build (native module) — does not run in Expo Go.
// Known limitation: PCM is buffered in memory for WAV assembly, so very long
// sessions are memory-heavy. Fine for typical use; streaming-to-file is a future step.
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import LiveAudioStream from 'react-native-live-audio-stream';
import { LiveSegment, LiveTranscriber, base64ToUint8Array, pcmChunksToWavBase64 } from '@/api/liveTranscription';
import { useRecordingStore } from '@/store/useRecordingStore';
import { Colors } from '@/constants/Colors';
import { Radius, Shadows, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const SAMPLE_RATE = 16000;
const SPEAKER_PALETTE = ['#3A5A40', '#BC6C25', '#6A4C93', '#1D3557', '#A23E48', '#2A6F97', '#7B5E2A', '#43654A'];
function speakerColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SPEAKER_PALETTE[h % SPEAKER_PALETTE.length];
}

export default function RecordLiveScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { addRecording } = useRecordingStore();

  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const pcmChunksRef = useRef<Uint8Array[]>([]);
  const segmentsRef = useRef<LiveSegment[]>([]);
  const startTimeRef = useRef(0);
  const isRecordingRef = useRef(false);

  const [isStarting, setIsStarting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [partial, setPartial] = useState('');
  const [segments, setSegments] = useState<LiveSegment[]>([]);

  const scrollRef = useRef<ScrollView>(null);

  const start = async () => {
    if (isStarting || isRecording) return;
    setIsStarting(true);
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('마이크 권한 필요', '실시간 받아쓰기를 위해 마이크 권한이 필요합니다.', [
          { text: '취소', style: 'cancel' },
          { text: '설정 열기', onPress: () => Linking.openSettings() },
        ]);
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      pcmChunksRef.current = [];
      segmentsRef.current = [];
      setSegments([]);
      setPartial('');

      const transcriber = new LiveTranscriber({
        onSegment: (seg) => {
          segmentsRef.current = [...segmentsRef.current, seg];
          setSegments(segmentsRef.current);
          requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
        },
        onPartial: (t) => setPartial(t),
        onError: (m) => console.warn('[live] ', m),
      });
      transcriberRef.current = transcriber;
      await transcriber.connect(SAMPLE_RATE);

      LiveAudioStream.init({
        sampleRate: SAMPLE_RATE,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6, // Android VOICE_RECOGNITION; ignored on iOS
        bufferSize: 4096,
      });
      LiveAudioStream.on('data', (b64: string) => {
        transcriberRef.current?.sendBase64Pcm(b64);
        try {
          pcmChunksRef.current.push(base64ToUint8Array(b64));
        } catch {
          // ignore decode error
        }
      });
      LiveAudioStream.start();

      startTimeRef.current = Date.now();
      isRecordingRef.current = true;
      setIsRecording(true);
    } catch (err: any) {
      console.warn('[live] start failed:', err);
      Alert.alert('시작 실패', '실시간 받아쓰기를 시작할 수 없습니다. 개발 빌드에서만 동작합니다.');
      try { LiveAudioStream.stop(); } catch {}
      await transcriberRef.current?.close();
      transcriberRef.current = null;
    } finally {
      setIsStarting(false);
    }
  };

  const stop = async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsSaving(true);
    try {
      try { LiveAudioStream.stop(); } catch {}
      await transcriberRef.current?.close();
      transcriberRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      const durationMs = Date.now() - startTimeRef.current;
      const segs = segmentsRef.current;
      const transcript = segs
        .map((s) => (s.speaker ? `[화자 ${s.speaker}] ${s.text}` : s.text))
        .join('\n\n');

      // Assemble the buffered PCM into a single WAV file.
      let uri = '';
      try {
        const wavB64 = pcmChunksToWavBase64(pcmChunksRef.current, SAMPLE_RATE);
        uri = `${FileSystem.documentDirectory}live_${Date.now()}.wav`;
        await FileSystem.writeAsStringAsync(uri, wavB64, { encoding: 'base64' as any });
      } catch (wavErr) {
        console.warn('[live] WAV save failed:', wavErr);
      }

      const id = Date.now().toString();
      addRecording({
        id,
        name: `라이브 강의 ${new Date().toLocaleDateString()}`,
        titleSource: 'default',
        uri,
        chunkUris: uri ? [uri] : [],
        chunkDurations: uri ? [durationMs] : [],
        duration: durationMs,
        createdAt: Date.now(),
        folderId: null,
        lectureType: 'general',
        transcript,
        segments: segs.map((s) => ({ startMs: s.startMs, endMs: s.endMs, text: s.text, speaker: s.speaker })),
        source: 'recording',
      });

      pcmChunksRef.current = [];
      router.replace({ pathname: '/detail/[id]', params: { id } });
    } catch (err) {
      console.warn('[live] stop failed:', err);
      Alert.alert('저장 실패', '녹음 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (isRecording ? Alert.alert('녹음 중', '먼저 정지해 주세요.') : router.back())}
          style={[styles.circularButton, { backgroundColor: theme.surface, ...Shadows.soft }]}
        >
          <Feather name="x" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={[styles.expBadge, { backgroundColor: theme.accent + '20', borderColor: theme.accent + '40' }]}>
          <MaterialIcons name="science" size={14} color={theme.accent} />
          <Text style={[styles.expBadgeText, { color: theme.accent }]}>실시간 (실험적)</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, ...Shadows.medium }]}>
        <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>실시간 받아쓰기 · 화자 구분</Text>
        <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator={false}>
          {segments.length === 0 && !partial ? (
            <Text style={[styles.empty, { color: theme.textTertiary }]}>
              {isRecording ? '듣고 있습니다...' : '시작을 누르면 말하는 즉시 화자별로 받아씁니다.'}
            </Text>
          ) : (
            segments.map((s, i) => (
              <View key={`s-${i}`} style={styles.segRow}>
                {s.speaker && (
                  <View style={[styles.spk, { backgroundColor: speakerColor(s.speaker) + '20' }]}>
                    <View style={[styles.spkDot, { backgroundColor: speakerColor(s.speaker) }]} />
                    <Text style={[styles.spkText, { color: speakerColor(s.speaker) }]}>화자 {s.speaker}</Text>
                  </View>
                )}
                <Text style={[styles.segText, { color: theme.text }]}>{s.text}</Text>
              </View>
            ))
          )}
          {!!partial && <Text style={[styles.partial, { color: theme.textTertiary }]}>{partial}</Text>}
        </ScrollView>
      </View>

      <View style={styles.controls}>
        {!isRecording ? (
          <TouchableOpacity
            style={[styles.mainButton, { backgroundColor: theme.primary, ...Shadows.floating }]}
            onPress={start}
            disabled={isStarting || isSaving}
            activeOpacity={0.85}
          >
            {isStarting || isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <MaterialIcons name="mic" size={36} color="#fff" />
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.mainButton, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, ...Shadows.floating }]}
            onPress={stop}
            activeOpacity={0.85}
          >
            <View style={[styles.stopSquare, { backgroundColor: theme.error }]} />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenPadding, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  circularButton: { width: 44, height: 44, borderRadius: Radius.pill, justifyContent: 'center', alignItems: 'center' },
  expBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1 },
  expBadgeText: { ...Typography.bodySmall, fontWeight: '700' },
  card: { flex: 1, margin: Spacing.screenPadding, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.xl },
  cardTitle: { ...Typography.caption, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.md },
  scroll: { flex: 1 },
  empty: { ...Typography.bodyLarge, textAlign: 'center', marginTop: Spacing.xxl, fontStyle: 'italic' },
  segRow: { marginBottom: Spacing.md },
  spk: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill, marginBottom: 4 },
  spkDot: { width: 6, height: 6, borderRadius: 3 },
  spkText: { fontSize: 11, fontWeight: '700' },
  segText: { ...Typography.bodyLarge, lineHeight: 26 },
  partial: { ...Typography.bodyLarge, lineHeight: 26, fontStyle: 'italic' },
  controls: { alignItems: 'center', paddingBottom: 50 },
  mainButton: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  stopSquare: { width: 24, height: 24, borderRadius: 6 },
});
