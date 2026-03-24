import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Share,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import { useRecordingStore } from '@/store/useRecordingStore';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { transcribeAudio, summarizeText } from '@/api/aiService';

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const { recordings, updateRecording, deleteRecording } = useRecordingStore();
  const recording = recordings.find((r) => r.id === id);

  const [sound, setSound] = sound = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary'>('transcript');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleDraft, setEditTitleDraft] = useState('');

  useEffect(() => {
    if (recording) {
      setEditTitleDraft(recording.name);
      if (recording.status === 'pending' && !isProcessing) {
        processRecording();
      }
    }
    return () => {
      sound?.unloadAsync();
    };
  }, [id]);

  const processRecording = async () => {
    if (!recording || isProcessing) return;
    setIsProcessing(true);
    try {
      updateRecording(id, { status: 'transcribing' });
      const transcript = await transcribeAudio(recording.uri);
      updateRecording(id, { transcript, status: 'summarizing' });

      const { summary, suggestedName } = await summarizeText(transcript);
      updateRecording(id, {
        summary,
        name: suggestedName || recording.name,
        status: 'completed',
      });
      setActiveTab('summary');
    } catch (err: any) {
      console.error(err);
      updateRecording(id, { status: 'error' });
      Alert.alert('처리 실패', err.message || '강의 처리에 실패했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const playPause = async () => {
    if (!recording) return;
    if (sound) {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
    } else {
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: recording.uri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );
      setSound(newSound);
      setIsPlaying(true);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setDuration(status.durationMillis || 0);
      setIsPlaying(status.isPlaying);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
      }
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const copyToNotion = async () => {
    if (!recording?.summary) return;
    
    const notionFormattedText = `
# ${recording.name}
📅 일시: ${new Date(recording.createdAt).toLocaleString()}
⏱️ 길이: ${formatTime(recording.duration)}

${recording.summary}

---
*노깡(nokkang)에서 생성됨*
    `.trim();

    await Clipboard.setStringAsync(notionFormattedText);
    Alert.alert('복사 완료', '노션에 바로 붙여넣을 수 있도록 클립보드에 복사되었습니다.');
  };

  const handleDelete = () => {
    Alert.alert('기록 삭제', '이 강의 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deleteRecording(id);
          router.back();
        },
      },
    ]);
  };

  if (!recording) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>기록을 찾을 수 없습니다.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <MaterialIcons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.titleContainer} onPress={() => setIsEditingTitle(true)}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {recording.name}
          </Text>
          <MaterialIcons name="edit" size={16} color={theme.textSecondary} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDelete}
          style={[styles.backButton, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <MaterialIcons name="delete-outline" size={24} color={theme.error} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.playerCard, { backgroundColor: theme.primary }]}>
          <View style={styles.playerInfo}>
            <Text style={[styles.playerDate, { color: 'rgba(255,255,255,0.8)' }]}>
              {new Date(recording.createdAt).toLocaleDateString()}
            </Text>
            <Text style={[styles.playerDuration, { color: '#FFFFFF' }]}>
              {formatTime(isPlaying ? position : recording.duration)}
            </Text>
          </View>

          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBarBackground, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: '#FFFFFF',
                    width: `${duration > 0 ? (position / duration) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.timeLabels}>
              <Text style={[styles.timeLabel, { color: 'rgba(255,255,255,0.8)' }]}>{formatTime(position)}</Text>
              <Text style={[styles.timeLabel, { color: 'rgba(255,255,255,0.8)' }]}>{formatTime(duration || recording.duration)}</Text>
            </View>
          </View>

          <View style={styles.playerControls}>
            <View style={{ width: 40 }} />
            <TouchableOpacity style={styles.playButton} onPress={playPause}>
              <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={48} color={theme.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.speedButton} onPress={() => {}}>
              <Text style={[styles.speedText, { color: '#FFFFFF' }]}>1.0x</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.tabContainer, { backgroundColor: theme.card }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'transcript' && { backgroundColor: theme.background }]}
            onPress={() => setActiveTab('transcript')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'transcript' ? theme.text : theme.textSecondary }]}>
              전체 내용
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'summary' && { backgroundColor: theme.background }]}
            onPress={() => setActiveTab('summary')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'summary' ? theme.text : theme.textSecondary }]}>
              AI 요약
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.contentCard, { backgroundColor: theme.card }]}>
          {recording.status !== 'completed' && recording.status !== 'error' ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.processingText, { color: theme.textSecondary }]}>
                {recording.status === 'transcribing' ? '음성을 텍스트로 변환 중...' : 'AI가 내용을 요약 중...'}
              </Text>
            </View>
          ) : activeTab === 'transcript' ? (
            <Text style={[styles.contentText, { color: theme.text }]}>
              {recording.transcript || '내용이 없습니다.'}
            </Text>
          ) : (
            <View>
              <View style={styles.notionHeader}>
                <Text style={[styles.notionTitle, { color: theme.text }]}>Notion Style Summary</Text>
                <TouchableOpacity style={[styles.copyButton, { backgroundColor: theme.primary }]} onPress={copyToNotion}>
                  <FontAwesome5 name="copy" size={14} color="#FFFFFF" />
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.notionCallout, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Text style={[styles.contentText, { color: theme.text }]}>
                  {recording.summary || '요약된 내용이 없습니다.'}
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={isEditingTitle} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsEditingTitle(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>강의 제목 변경</Text>
            <TextInput
              style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={editTitleDraft}
              onChangeText={setEditTitleDraft}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, { borderColor: theme.border }]} onPress={() => setIsEditingTitle(false)}>
                <Text style={{ color: theme.textSecondary }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary, borderWidth: 0 }]}
                onPress={() => {
                  if (editTitleDraft.trim()) updateRecording(id, { name: editTitleDraft.trim() });
                  setIsEditingTitle(false);
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  title: { fontSize: 18, fontWeight: '800' },
  scrollContent: { padding: 24 },
  playerCard: {
    borderRadius: 32,
    padding: 24,
    marginBottom: 24,
    elevation: 4,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  playerInfo: { marginBottom: 20 },
  playerDate: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  playerDuration: { fontSize: 32, fontWeight: '800' },
  progressBarContainer: { marginBottom: 20 },
  progressBarBackground: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%' },
  timeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  timeLabel: { fontSize: 12, fontWeight: '600' },
  playerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speedButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  speedText: { fontSize: 14, fontWeight: '800' },
  playButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  tabContainer: {
    flexDirection: 'row',
    padding: 6,
    borderRadius: 20,
    marginBottom: 24,
  },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 16 },
  tabText: { fontSize: 15, fontWeight: '700' },
  contentCard: {
    borderRadius: 32,
    padding: 28,
    minHeight: 300,
    elevation: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  contentText: { fontSize: 16, lineHeight: 28, letterSpacing: 0.3 },
  notionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  notionTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  notionCallout: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  processingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  processingText: { marginTop: 16, fontSize: 15, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', borderRadius: 32, padding: 32 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 24, textAlign: 'center' },
  modalInput: { height: 56, borderWidth: 1, borderRadius: 16, paddingHorizontal: 20, fontSize: 16, marginBottom: 32 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  errorText: { textAlign: 'center', fontSize: 16, marginTop: 100 },
});
