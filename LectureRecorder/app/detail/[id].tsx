import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useRecordingStore } from '@/store/useRecordingStore';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LinearGradient } from 'expo-linear-gradient';
import { transcribeAudio, translateText } from '@/api/aiService';

type TabType = 'transcript' | 'summary' | 'translation';

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
  const { id, name: paramName, duration: paramDuration, createdAt: paramCreatedAt } = useLocalSearchParams<{
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
  const foldersHydrated = useRecordingStore((state) => state._hasHydrated);

  const displayName = recording?.name || paramName || '강의 기록';
  const displayDuration = recording?.duration || (paramDuration ? Number(paramDuration) : 0);
  const displayDate = recording?.createdAt || (paramCreatedAt ? Number(paramCreatedAt) : Date.now());

  const [activeTab, setActiveTab] = useState<TabType>('transcript');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleDraft, setEditTitleDraft] = useState('');

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<1.0 | 1.2 | 1.5 | 2.0>(1.0);

  const SPEED_STEPS: Array<1.0 | 1.2 | 1.5 | 2.0> = [1.0, 1.2, 1.5, 2.0];

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [sound]);

  const togglePlayback = async () => {
    if (!recording) return;
    try {
      if (sound && isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else if (sound) {
        await sound.playAsync();
        setIsPlaying(true);
      } else {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: recording.uri },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded) {
              setPlaybackPosition(status.positionMillis ?? 0);
              setPlaybackDuration(status.durationMillis ?? 0);
              if (status.didJustFinish) setIsPlaying(false);
            }
          }
        );
        setSound(newSound);
        setIsPlaying(true);
      }
    } catch (error) {
      Alert.alert('재생 오류', '오디오를 재생할 수 없습니다.');
    }
  };

  const cycleSpeed = async () => {
    const nextIdx = (SPEED_STEPS.indexOf(playbackRate) + 1) % SPEED_STEPS.length;
    const nextRate = SPEED_STEPS[nextIdx];
    setPlaybackRate(nextRate);
    if (sound) await sound.setRateAsync(nextRate, true);
  };

  const handleTranscribe = useCallback(async () => {
    if (!recording) return;
    setIsProcessing(true);
    setProcessingStatus('오디오 분석 중...');
    try {
      const result = await transcribeAudio(recording.uri);
      updateRecording(recording.id, { transcript: result });
      const { generateTitleFromText } = useRecordingStore.getState();
      generateTitleFromText(recording.id, result);
    } catch (error: any) {
      Alert.alert('음성 인식 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [recording]);

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
  }, [recording]);

  const handleTranslate = useCallback(async () => {
    if (!recording || !recording.transcript) {
      Alert.alert('알림', '먼저 음성을 텍스트로 변환해 주세요.');
      return;
    }
    setIsProcessing(true);
    setProcessingStatus('번역 중...');
    try {
      const result = await translateText(recording.transcript);
      updateRecording(recording.id, { translation: result });
    } catch (error: any) {
      Alert.alert('번역 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [recording]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  const getTabContent = () => {
    if (!recording) return null;
    switch (activeTab) {
      case 'transcript':
        return recording.transcript || null;
      case 'summary':
        if (!recording.summary) return null;
        return typeof recording.summary === 'object' ? (recording.summary as any).summary : recording.summary;
      case 'translation':
        return recording.translation || null;
    }
  };

  const progressWidth = playbackDuration > 0 ? (playbackPosition / playbackDuration) * 100 : 0;
  const tabContent = getTabContent();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <MaterialIcons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.titleContainer}
          onPress={() => {
            setEditTitleDraft(displayName);
            setIsEditingTitle(true);
          }}
        >
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <MaterialIcons name="edit" size={14} color={theme.primary} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Audio Player Card */}
        <View style={[styles.playerCard, { backgroundColor: theme.card, shadowColor: (theme as any).shadow }]}>
          <View style={styles.playerInfo}>
            <Text style={[styles.playerDate, { color: theme.textSecondary }]}>{formatDate(displayDate)}</Text>
            <Text style={[styles.playerDuration, { color: theme.text }]}>{formatTime(displayDuration)}</Text>
          </View>

          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBarBackground, { backgroundColor: theme.border }]}>
              <View style={[styles.progressBarFill, { width: `${progressWidth}%`, backgroundColor: theme.primary }]} />
            </View>
            <View style={styles.timeLabels}>
              <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>{formatTime(playbackPosition)}</Text>
              <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>{formatTime(playbackDuration || displayDuration)}</Text>
            </View>
          </View>

          <View style={styles.playerControls}>
            <TouchableOpacity onPress={cycleSpeed} style={[styles.speedButton, { backgroundColor: (theme as any).oliveLight }]}>
              <Text style={[styles.speedText, { color: theme.primary }]}>{playbackRate}x</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={togglePlayback} style={[styles.playButton, { backgroundColor: theme.primary }]}>
              <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={36} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={{ width: 50 }} />
          </View>
        </View>

        {/* Tabs */}
        <View style={[styles.tabContainer, { backgroundColor: (theme as any).oliveLight }]}>
          {(['transcript', 'summary', 'translation'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tabButton,
                activeTab === tab && { backgroundColor: theme.card, shadowColor: (theme as any).shadow },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: theme.textSecondary },
                  activeTab === tab && { color: theme.primary, fontWeight: '800' },
                ]}
              >
                {tab === 'transcript' ? '기록' : tab === 'summary' ? '요약' : '번역'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content Card */}
        <View style={[styles.contentCard, { backgroundColor: theme.card, shadowColor: (theme as any).shadow }]}>
          {isProcessing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.processingText, { color: theme.textSecondary }]}>{processingStatus}</Text>
            </View>
          ) : tabContent ? (
            <Text style={[styles.contentText, { color: theme.text }]}>{tabContent}</Text>
          ) : (
            <View style={styles.emptyContentContainer}>
              <MaterialIcons name="auto-fix-high" size={48} color={theme.border} />
              <Text style={[styles.emptyContentText, { color: theme.textSecondary }]}>
                {activeTab === 'transcript'
                  ? '아직 변환된 텍스트가 없어요'
                  : activeTab === 'summary'
                    ? '텍스트 변환 후 요약을 생성해보세요'
                    : '텍스트 변환 후 번역을 시작해보세요'}
              </Text>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.primary }]}
                onPress={activeTab === 'transcript' ? handleTranscribe : activeTab === 'summary' ? handleSummarize : handleTranslate}
              >
                <Text style={styles.actionButtonText}>
                  {activeTab === 'transcript' ? '음성 인식 시작' : activeTab === 'summary' ? '요약 노트 만들기' : '번역하기'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Title Edit Modal */}
      <Modal visible={isEditingTitle} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsEditingTitle(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>노트 제목 변경</Text>
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
    shadowOpacity: 1,
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
  playButton: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 4 },
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
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  contentText: { fontSize: 16, lineHeight: 28, letterSpacing: 0.3 },
  processingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  processingText: { marginTop: 16, fontSize: 15, fontWeight: '600' },
  emptyContentContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyContentText: { marginTop: 16, fontSize: 15, textAlign: 'center', marginBottom: 24 },
  actionButton: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, elevation: 2 },
  actionButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', borderRadius: 32, padding: 32 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 24, textAlign: 'center' },
  modalInput: { height: 56, borderWidth: 1, borderRadius: 16, paddingHorizontal: 20, fontSize: 16, marginBottom: 32 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  errorText: { textAlign: 'center', fontSize: 16 },
});
