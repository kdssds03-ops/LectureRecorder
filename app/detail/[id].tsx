import { transcribeAudio, translateText } from '@/api/aiService';
import Snackbar from '@/components/Snackbar';
import { Colors } from '@/constants/Colors';
import { Radius, Shadows, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRecordingStore } from '@/store/useRecordingStore';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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

  // Free-tier gate: returns true if the action may proceed, else opens paywall.
  const ensureCredit = useCallback((): boolean => {
    if (useSubscriptionStore.getState().canUseAi()) return true;
    router.push('/paywall' as Href);
    return false;
  }, [router]);
  const recognitionLanguage = useSettingsStore((state) => state.recognitionLanguage);
  const translationLanguage = useSettingsStore((state) => state.translationLanguage);

  const displayName = recording?.name || paramName || '강의 기록';
  const displayDuration = recording?.duration || (paramDuration ? Number(paramDuration) : 0);

  const [activeTab, setActiveTab] = useState<TabType>('transcript');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  const [quizSelected, setQuizSelected] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

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
        sound.unloadAsync().catch(() => { });
      }
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(() => { });
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
    if (!ensureCredit()) return;
    setIsProcessing(true);
    setProcessingStatus('오디오 분석 중...');
    try {
      const result = await transcribeAudio(recording.uri, recognitionLanguage);
      updateRecording(recording.id, { transcript: result });
      useSubscriptionStore.getState().consumeCredit();
      const { generateTitleFromText } = useRecordingStore.getState();
      generateTitleFromText(recording.id, result);
    } catch (error: any) {
      Alert.alert('음성 인식 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [recording, recognitionLanguage, updateRecording, ensureCredit]);

  const handleSummarize = useCallback(async () => {
    if (!recording || !recording.transcript) {
      Alert.alert('알림', '먼저 음성을 텍스트로 변환해 주세요.');
      return;
    }
    if (!ensureCredit()) return;
    setIsProcessing(true);
    setProcessingStatus('AI 요약 생성 중...');
    try {
      await fetchSummary(recording.id);
      useSubscriptionStore.getState().consumeCredit();
    } catch (error: any) {
      Alert.alert('요약 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [recording, fetchSummary, ensureCredit]);

  const handleTranslate = useCallback(async () => {
    if (!recording || !recording.transcript) {
      Alert.alert('알림', '먼저 음성을 텍스트로 변환해 주세요.');
      return;
    }
    if (!ensureCredit()) return;
    setIsProcessing(true);
    setProcessingStatus('번역 중...');
    try {
      const result = await translateText(recording.transcript, translationLanguage);
      updateRecording(recording.id, { translation: result });
      useSubscriptionStore.getState().consumeCredit();
    } catch (error: any) {
      Alert.alert('번역 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [recording, translationLanguage, updateRecording, ensureCredit]);

  const handleQuiz = useCallback(async () => {
    if (!recording || !recording.transcript) {
      Alert.alert('알림', '먼저 음성을 텍스트로 변환해 주세요.');
      return;
    }
    if (!ensureCredit()) return;
    setIsProcessing(true);
    setProcessingStatus('AI 퀴즈 생성 중...');
    try {
      await fetchQuiz(recording.id);
      useSubscriptionStore.getState().consumeCredit();
      setQuizSelected({});
      setQuizSubmitted(false);
    } catch (error: any) {
      Alert.alert('퀴즈 생성 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [recording, fetchQuiz, ensureCredit]);

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
      parts.push(`\n## 메모 / 번역\n\n${recording.translation}`);
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
          <View
            key={`ts-${i}`}
            style={[styles.timestampPill, { backgroundColor: theme.unselectedChip }]}
          >
            <Text style={[styles.timestampText, { color: theme.textSecondary }]}>{line}</Text>
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
                {tab === 'transcript' ? '음성인식' : tab === 'summary' ? '요약' : tab === 'translation' ? '메모' : '퀴즈'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => setIsEditingTitle(true)}
          style={[styles.circularButton, { backgroundColor: theme.surface, ...Shadows.soft }]}
        >
          <Feather name="more-horizontal" size={24} color={theme.text} />
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
              {formatTime(playbackPosition)}
            </Text>

            <View style={styles.sliderTrack}>
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
            </View>

            <Text style={[styles.timeText, { color: theme.textSecondary, marginRight: Spacing.sm }]}>
              {formatTime(playbackDuration || displayDuration)}
            </Text>
          </View>
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
            recording?.transcript ? (
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
              <Text style={[styles.transcriptBody, { color: theme.text }]}>{recording.translation}</Text>
            ) : (
              <View style={styles.emptyContentContainer}>
                <Text style={[styles.emptyContentText, { color: theme.textSecondary }]}>
                  텍스트 변환 후 번역을 시작해보세요
                </Text>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primary, ...Shadows.soft }]} onPress={handleTranslate}>
                  <Text style={styles.actionButtonText}>메모 작성 / 번역하기</Text>
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

      {/* Title edit modal */}
      <Modal visible={isEditingTitle} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsEditingTitle(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.surface, ...Shadows.medium }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>노트 제목 변경</Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              value={editTitleDraft}
              onChangeText={setEditTitleDraft}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: theme.border }]}
                onPress={() => setIsEditingTitle(false)}
              >
                <Text style={{ color: theme.textSecondary, ...Typography.bodyMedium }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.text }]}
                onPress={() => {
                  if (editTitleDraft.trim()) updateRecording(id as string, { name: editTitleDraft.trim() });
                  setIsEditingTitle(false);
                }}
              >
                <Text style={{ color: theme.background, ...Typography.bodyMedium, fontWeight: '700' }}>
                  저장
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
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
