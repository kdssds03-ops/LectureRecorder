import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useRecordingStore, LECTURE_TYPE_LABELS, LECTURE_TYPE_ICONS } from '@/store/useRecordingStore';
import { Colors } from '@/constants/Colors';
import { Spacing, Radius, Typography, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { transcribeAudio, translateText } from '@/api/aiService';
import * as Clipboard from 'expo-clipboard';
import Snackbar from '@/components/Snackbar';

type TabType = 'transcript' | 'summary' | 'translation';

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

  const displayName = recording?.name || paramName || '강의 기록';
  const displayDuration = recording?.duration || (paramDuration ? Number(paramDuration) : 0);

  const [activeTab, setActiveTab] = useState<TabType>('transcript');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

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
      if (sound) {
        sound.unloadAsync().catch(() => {});
      }
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(() => {});
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

  const handleCopy = async () => {
    if (!recording) return;
    let textToCopy = '';

    if (activeTab === 'transcript' && recording.transcript) {
      textToCopy = recording.transcript;
    } else if (activeTab === 'summary' && recording.summary) {
      const structured = parseStructuredSummary(recording.summary);
      if (structured) {
        const parts: string[] = [];
        if (structured.overview) parts.push(`개요\n${structured.overview}`);
        if (structured.keyPoints?.length) {
          parts.push(`핵심 포인트\n${structured.keyPoints.map(p => `• ${p}`).join('\n')}`);
        }
        if (structured.details?.length) {
          parts.push(structured.details.map(d => `${d.heading}\n${d.content}`).join('\n\n'));
        }
        if (structured.keywords?.length) {
          parts.push(`키워드: ${structured.keywords.join(', ')}`);
        }
        if (structured.studyTips) parts.push(`학습 팁\n${structured.studyTips}`);
        textToCopy = parts.join('\n\n');
      } else {
        textToCopy = String(recording.summary);
      }
    } else if (activeTab === 'translation' && recording.translation) {
      textToCopy = recording.translation;
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

  const progressWidth = playbackDuration > 0 ? (playbackPosition / playbackDuration) * 100 : 0;

  const renderTranscript = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    const timestampRegex = /^(\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}|\d{2}:\d{2}\s*-\s*\d{2}:\d{2})$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (timestampRegex.test(line)) {
        elements.push(
          <View key={`ts-${i}`} style={[styles.timestampPill, { backgroundColor: theme.unselectedChip }]}>
            <Text style={[styles.timestampText, { color: theme.textSecondary }]}>{line}</Text>
          </View>
        );
      } else {
        elements.push(
          <Text key={`txt-${i}`} style={[styles.transcriptBody, { color: theme.text }]}>{line}</Text>
        );
      }
    }
    return elements.length > 0 ? elements : (
      <Text style={[styles.transcriptBody, { color: theme.text }]}>{text}</Text>
    );
  };

  const renderStructuredSummary = (structured: StructuredSummary) => {
    const lectureType = recording?.lectureType ?? structured.lectureType;
    const typeLabel = lectureType ? LECTURE_TYPE_LABELS[lectureType as keyof typeof LECTURE_TYPE_LABELS] : null;
    const typeIcon = lectureType ? LECTURE_TYPE_ICONS[lectureType as keyof typeof LECTURE_TYPE_ICONS] : null;

    return (
      <View style={styles.summaryContainer}>
        {typeLabel && (
          <View style={[styles.categoryBadge, { backgroundColor: theme.unselectedChip }]}>
            {typeIcon && <Text style={styles.categoryIcon}>{typeIcon}</Text>}
            <Text style={[styles.categoryLabel, { color: theme.textSecondary }]}>{typeLabel}</Text>
          </View>
        )}

        {structured.overview ? (
          <View style={styles.summarySection}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>개요</Text>
            <View style={[styles.overviewCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.overviewText, { color: theme.text }]}>{structured.overview}</Text>
            </View>
          </View>
        ) : null}

        {structured.keyPoints?.length > 0 && (
          <View style={styles.summarySection}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>핵심 포인트</Text>
            <View style={[styles.keyPointsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {structured.keyPoints.map((point, idx) => (
                <View key={idx} style={styles.keyPointRow}>
                  <View style={[styles.keyPointDot, { backgroundColor: theme.primary }]} />
                  <Text style={[styles.keyPointText, { color: theme.text }]}>{point}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {structured.details?.length > 0 && (
          <View style={styles.summarySection}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>상세 내용</Text>
            {structured.details.map((detail, idx) => (
              <View key={idx} style={[styles.detailCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.detailHeading, { color: theme.text }]}>{detail.heading}</Text>
                <Text style={[styles.detailContent, { color: theme.textSecondary }]}>{detail.content}</Text>
              </View>
            ))}
          </View>
        )}

        {structured.keywords?.length > 0 && (
          <View style={styles.summarySection}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>키워드</Text>
            <View style={styles.keywordsRow}>
              {structured.keywords.map((kw, idx) => (
                <View key={idx} style={[styles.keywordChip, { backgroundColor: theme.unselectedChip }]}>
                  <Text style={[styles.keywordText, { color: theme.text }]}>{kw}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {structured.studyTips ? (
          <View style={styles.summarySection}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>학습 팁</Text>
            <View style={[styles.studyTipsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <MaterialIcons name="lightbulb-outline" size={18} color={theme.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.studyTipsText, { color: theme.text, flex: 1 }]}>{structured.studyTips}</Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const renderSummary = () => {
    if (!recording?.summary) return null;
    const structured = parseStructuredSummary(recording.summary);
    if (structured) return renderStructuredSummary(structured);
    return (
      <View style={styles.summaryContainer}>
        <Text style={[styles.transcriptBody, { color: theme.text }]}>{String(recording.summary)}</Text>
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
          {(['transcript', 'summary', 'translation'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.pillTab,
                activeTab === tab && [styles.pillTabActive, { backgroundColor: theme.surface, ...Shadows.soft }],
              ]}
              disabled={isProcessing}
            >
              <Text style={[styles.pillTabText, { color: activeTab === tab ? theme.text : theme.textSecondary }]}>
                {tab === 'transcript' ? '음성인식' : tab === 'summary' ? '요약' : '메모'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => { setEditTitleDraft(displayName); setIsEditingTitle(true); }}
          style={[styles.circularButton, { backgroundColor: theme.surface, ...Shadows.soft }]}
        >
          <Feather name="more-horizontal" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.playerSection}>
          <Text style={[styles.recordingTitle, { color: theme.text }]} numberOfLines={2}>
            {displayName}
          </Text>

          {recording?.lectureType && (
            <View style={[styles.lectureTypeBadge, { backgroundColor: theme.unselectedChip }]}>
              <Text style={styles.lectureTypeIcon}>{LECTURE_TYPE_ICONS[recording.lectureType]}</Text>
              <Text style={[styles.lectureTypeLabel, { color: theme.textSecondary }]}>
                {LECTURE_TYPE_LABELS[recording.lectureType]}
              </Text>
            </View>
          )}

          <View style={styles.playerControlsRow}>
            <TouchableOpacity onPress={togglePlayback} style={[styles.playCircle, { backgroundColor: theme.text }]}>
              <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={28} color={theme.background} />
            </TouchableOpacity>

            <Text style={[styles.timeText, { color: theme.textSecondary, marginLeft: Spacing.sm }]}>
              {formatTime(playbackPosition)}
            </Text>

            <View style={styles.sliderTrack}>
              <View style={[styles.sliderFill, { width: `${progressWidth}%`, backgroundColor: theme.primary }]} />
              <View style={[styles.sliderKnob, { left: `${progressWidth}%`, backgroundColor: theme.surface, ...Shadows.soft }]} />
            </View>

            <Text style={[styles.timeText, { color: theme.textSecondary, marginRight: Spacing.sm }]}>
              {formatTime(playbackDuration || displayDuration)}
            </Text>

            <TouchableOpacity onPress={cycleSpeed} style={[styles.speedButton, { backgroundColor: theme.unselectedChip }]}>
              <Text style={[styles.speedText, { color: theme.text }]}>{playbackRate}x</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.contentArea}>
          {isProcessing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.processingText, { color: theme.textSecondary }]}>{processingStatus}</Text>
            </View>
          ) : activeTab === 'transcript' ? (
            recording?.transcript ? (
              <View style={styles.transcriptSection}>{renderTranscript(recording.transcript)}</View>
            ) : (
              <View style={styles.emptyContentContainer}>
                <MaterialIcons name="mic-none" size={48} color={theme.border} />
                <Text style={[styles.emptyContentText, { color: theme.textSecondary }]}>아직 변환된 텍스트가 없어요</Text>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primary, ...Shadows.soft }]} onPress={handleTranscribe}>
                  <Text style={styles.actionButtonText}>음성 인식 시작</Text>
                </TouchableOpacity>
              </View>
            )
          ) : activeTab === 'summary' ? (
            recording?.isSummarizing ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.processingText, { color: theme.textSecondary }]}>AI 요약 생성 중...</Text>
              </View>
            ) : recording?.summary ? (
              renderSummary()
            ) : (
              <View style={styles.emptyContentContainer}>
                <MaterialIcons name="auto-awesome" size={48} color={theme.border} />
                <Text style={[styles.emptyContentText, { color: theme.textSecondary }]}>텍스트 변환 후 요약을 생성해보세요</Text>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primary, ...Shadows.soft }]} onPress={handleSummarize}>
                  <Text style={styles.actionButtonText}>요약 노트 만들기</Text>
                </TouchableOpacity>
              </View>
            )
          ) : recording?.translation ? (
            <Text style={[styles.transcriptBody, { color: theme.text }]}>{recording.translation}</Text>
          ) : (
            <View style={styles.emptyContentContainer}>
              <MaterialIcons name="translate" size={48} color={theme.border} />
              <Text style={[styles.emptyContentText, { color: theme.textSecondary }]}>텍스트 변환 후 번역을 시작해보세요</Text>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primary, ...Shadows.soft }]} onPress={handleTranslate}>
                <Text style={styles.actionButtonText}>메모 작성 / 번역하기</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {recording?.transcript && (
        <View style={styles.bottomActionArea}>
          <TouchableOpacity
            style={[styles.outlineButton, { borderColor: theme.border, backgroundColor: theme.surface, ...Shadows.soft }]}
            onPress={handleCopy}
            activeOpacity={0.7}
          >
            <Feather name="copy" size={18} color={theme.textSecondary} style={{ marginRight: Spacing.sm }} />
            <Text style={[styles.outlineButtonText, { color: theme.textSecondary }]}>복사</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={isEditingTitle} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsEditingTitle(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, ...Shadows.medium }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>노트 제목 변경</Text>
            <TextInput
              style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={editTitleDraft}
              onChangeText={setEditTitleDraft}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, { borderColor: theme.border }]} onPress={() => setIsEditingTitle(false)}>
                <Text style={{ color: theme.textSecondary, ...Typography.bodyMedium }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.text }]}
                onPress={() => {
                  if (editTitleDraft.trim()) {
                    updateRecording(id as string, { name: editTitleDraft.trim(), titleSource: 'user' });
                  }
                  setIsEditingTitle(false);
                }}
              >
                <Text style={{ color: theme.background, ...Typography.bodyMedium, fontWeight: '700' }}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Snackbar visible={snackbarVisible} message={snackbarMessage} onDismiss={() => setSnackbarVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenPadding, paddingTop: Spacing.xl, paddingBottom: Spacing.md,
  },
  circularButton: { width: 44, height: 44, borderRadius: Radius.pill, justifyContent: 'center', alignItems: 'center' },
  pillTabsContainer: { flexDirection: 'row', borderRadius: Radius.pill, padding: 4 },
  pillTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.pill },
  pillTabActive: { borderRadius: Radius.pill },
  pillTabText: { ...Typography.bodyMedium, fontWeight: '600' },
  scrollContent: { paddingHorizontal: Spacing.screenPadding, paddingBottom: 100 },
  playerSection: { paddingVertical: Spacing.lg },
  recordingTitle: { ...Typography.titleMedium, fontWeight: '700', marginBottom: Spacing.sm },
  lectureTypeBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, marginBottom: Spacing.md, gap: 4,
  },
  lectureTypeIcon: { fontSize: 14 },
  lectureTypeLabel: { ...Typography.caption, fontWeight: '500' },
  playerControlsRow: { flexDirection: 'row', alignItems: 'center' },
  playCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sliderTrack: {
    flex: 1, height: 6, backgroundColor: '#E5E5EA', borderRadius: 3,
    marginHorizontal: Spacing.sm, flexDirection: 'row', alignItems: 'center',
  },
  sliderFill: { height: '100%', borderRadius: 3 },
  sliderKnob: { position: 'absolute', width: 20, height: 20, borderRadius: 10, marginLeft: -10 },
  timeText: { ...Typography.caption },
  speedButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.md, marginLeft: Spacing.sm },
  speedText: { ...Typography.caption, fontWeight: '700' },
  contentArea: { marginTop: Spacing.md },
  transcriptSection: { flex: 1 },
  timestampPill: {
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: Radius.pill, marginBottom: Spacing.sm, marginTop: Spacing.md,
  },
  timestampText: { ...Typography.caption },
  transcriptBody: { ...Typography.bodyMedium, lineHeight: 26, marginBottom: Spacing.md, letterSpacing: -0.2 },
  summaryContainer: { marginTop: Spacing.sm },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.pill, marginBottom: Spacing.lg, gap: 5,
  },
  categoryIcon: { fontSize: 14 },
  categoryLabel: { ...Typography.bodySmall, fontWeight: '600' },
  summarySection: { marginBottom: Spacing.xl },
  sectionLabel: { ...Typography.caption, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },
  overviewCard: { borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1 },
  overviewText: { ...Typography.bodyMedium, lineHeight: 26 },
  keyPointsCard: { borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, gap: Spacing.sm },
  keyPointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  keyPointDot: { width: 7, height: 7, borderRadius: 4, marginTop: 7, flexShrink: 0 },
  keyPointText: { ...Typography.bodyMedium, lineHeight: 24, flex: 1 },
  detailCard: { borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, marginBottom: Spacing.sm },
  detailHeading: { ...Typography.bodyMedium, fontWeight: '700', marginBottom: Spacing.xs },
  detailContent: { ...Typography.bodyMedium, lineHeight: 24 },
  keywordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  keywordChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.pill },
  keywordText: { ...Typography.bodySmall, fontWeight: '500' },
  studyTipsCard: { borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, flexDirection: 'row', alignItems: 'flex-start' },
  studyTipsText: { ...Typography.bodyMedium, lineHeight: 24 },
  processingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  processingText: { marginTop: 16, ...Typography.bodyMedium },
  emptyContentContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyContentText: { ...Typography.bodyMedium, textAlign: 'center' },
  actionButton: { paddingHorizontal: Spacing.xl, paddingVertical: 14, borderRadius: Radius.pill, marginTop: Spacing.sm },
  actionButtonText: { color: '#FFFFFF', ...Typography.bodyMedium, fontWeight: '700' },
  bottomActionArea: { position: 'absolute', bottom: Spacing.xl, right: Spacing.screenPadding, alignItems: 'flex-end' },
  outlineButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 10, borderRadius: Radius.pill, borderWidth: 1 },
  outlineButtonText: { ...Typography.bodyMedium, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: Spacing.screenPadding },
  modalContent: { width: '100%', borderRadius: Radius.xl, padding: Spacing.xl },
  modalTitle: { ...Typography.titleMedium, marginBottom: Spacing.lg, textAlign: 'center' },
  modalInput: { height: 52, borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, ...Typography.bodyMedium, marginBottom: Spacing.xl },
  modalButtons: { flexDirection: 'row', gap: Spacing.md },
  modalButton: { flex: 1, height: 52, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
});
