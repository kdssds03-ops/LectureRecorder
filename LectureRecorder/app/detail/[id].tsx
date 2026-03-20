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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useRecordingStore, RecordingMeta } from '@/store/useRecordingStore';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { transcribeAudio, summarizeText, translateText } from '@/api/aiService';

type TabType = 'transcript' | 'summary' | 'translation';

/**
 * Classify axios errors into user-facing message categories.
 * - No response (network down / timeout) → 'network'
 * - 401 / 403                            → 'auth'
 * - 500+                                 → 'server'
 * - Anything else                        → 'unknown'
 */
function classifyApiError(error: any): 'network' | 'auth' | 'server' | 'unknown' {
  if (!error.response) return 'network';            // no response = unreachable / timeout
  const status: number = error.response.status;
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'server';
  return 'unknown';
}

const API_ERROR_MESSAGES: Record<ReturnType<typeof classifyApiError>, string> = {
  network: '네트워크 연결을 확인하고 다시 시도해 주세요.',
  auth: '앱 키 또는 백엔드 주소가 올바르지 않습니다. 설정을 확인해 주세요.',
  server: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  unknown: '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
};

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { recordings, updateRecording } = useRecordingStore();

  const recording = recordings.find((r) => r.id === id);

  const [activeTab, setActiveTab] = useState<TabType>('transcript');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [fileExists, setFileExists] = useState<boolean | null>(null); // null = checking

  // Check whether the audio file still exists on disk
  useEffect(() => {
    if (!recording?.uri) {
      setFileExists(false);
      return;
    }
    FileSystem.getInfoAsync(recording.uri).then((info) => {
      setFileExists(info.exists);
    });
  }, [recording?.uri]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
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
              if (status.didJustFinish) {
                setIsPlaying(false);
              }
            }
          }
        );
        setSound(newSound);
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Playback error', error);
      Alert.alert('재생 오류', '오디오를 재생할 수 없습니다. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다.');
    }
  };

  const handleTranscribe = useCallback(async () => {
    if (!recording) return;
    if (fileExists === false) {
      Alert.alert('파일 없음', '오디오 파일이 삭제되었거나 찾을 수 없습니다.');
      return;
    }
    setIsProcessing(true);
    try {
      const result = await transcribeAudio(recording.uri);
      updateRecording(recording.id, { transcript: result });
    } catch (error: any) {
      Alert.alert('음성 인식 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
    }
  }, [recording, fileExists]);

  const handleSummarize = useCallback(async () => {
    if (!recording || !recording.transcript) {
      Alert.alert('알림', '먼저 음성을 텍스트로 변환해 주세요.');
      return;
    }
    setIsProcessing(true);
    try {
      const result = await summarizeText(recording.transcript);
      updateRecording(recording.id, { summary: result });
    } catch (error: any) {
      Alert.alert('요약 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
    }
  }, [recording]);

  const handleTranslate = useCallback(async () => {
    if (!recording || !recording.transcript) {
      Alert.alert('알림', '먼저 음성을 텍스트로 변환해 주세요.');
      return;
    }
    setIsProcessing(true);
    try {
      const result = await translateText(recording.transcript);
      updateRecording(recording.id, { translation: result });
    } catch (error: any) {
      Alert.alert('번역 실패', API_ERROR_MESSAGES[classifyApiError(error)]);
    } finally {
      setIsProcessing(false);
    }
  }, [recording]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  if (!recording) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>녹음을 찾을 수 없습니다.</Text>
      </SafeAreaView>
    );
  }

  // Still checking file existence — show a brief loading state
  if (fileExists === null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  // Audio file was deleted from disk — show clear error with back button
  if (fileExists === false) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="뒤로 가기">
            <MaterialIcons name="arrow-back" size={28} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{recording.name}</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.missingFileContainer}>
          <MaterialIcons name="error-outline" size={64} color={theme.error} />
          <Text style={[styles.missingFileTitle, { color: theme.text }]}>파일을 찾을 수 없음</Text>
          <Text style={[styles.missingFileDesc, { color: theme.border }]}>
            오디오 파일이 기기에서 삭제되었습니다.{'\n'}
            저장된 텍스트 기록은 아래에서 확인할 수 있습니다.
          </Text>
          {recording.transcript ? (
            <Text style={[styles.contentText, { color: theme.text, marginTop: 24 }]}>
              {recording.transcript}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const getTabContent = () => {
    switch (activeTab) {
      case 'transcript':
        return recording.transcript || null;
      case 'summary':
        return recording.summary || null;
      case 'translation':
        return recording.translation || null;
    }
  };

  const getTabAction = () => {
    switch (activeTab) {
      case 'transcript':
        return handleTranscribe;
      case 'summary':
        return handleSummarize;
      case 'translation':
        return handleTranslate;
    }
  };

  const getTabActionLabel = () => {
    switch (activeTab) {
      case 'transcript':
        return '음성 인식 시작';
      case 'summary':
        return '요약 생성';
      case 'translation':
        return '번역 시작';
    }
  };

  const tabContent = getTabContent();
  const progressWidth = playbackDuration > 0 ? (playbackPosition / playbackDuration) * 100 : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="뒤로 가기">
          <MaterialIcons name="arrow-back" size={28} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {recording.name}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Player */}
      <View style={[styles.playerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity onPress={togglePlayback} accessibilityLabel={isPlaying ? '일시 정지' : '재생'}>
          <MaterialIcons name={isPlaying ? 'pause-circle-filled' : 'play-circle-filled'} size={56} color={theme.primary} />
        </TouchableOpacity>
        <View style={styles.playerInfo}>
          <Text style={[styles.playerTime, { color: theme.text }]}>
            {formatTime(playbackPosition)} / {formatTime(recording.duration)}
          </Text>
          <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
            <View style={[styles.progressFill, { width: `${progressWidth}%`, backgroundColor: theme.primary }]} />
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {([
          { key: 'transcript' as TabType, label: '📝 기록', icon: 'description' },
          { key: 'summary' as TabType, label: '📋 요약', icon: 'summarize' },
          { key: 'translation' as TabType, label: '🌐 번역', icon: 'translate' },
        ]).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && { borderBottomColor: theme.primary, borderBottomWidth: 3 },
            ]}
            onPress={() => setActiveTab(tab.key)}
            accessibilityLabel={`${tab.label} 탭`}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab.key ? theme.primary : theme.border },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView style={styles.contentArea} contentContainerStyle={styles.contentContainer}>
        {isProcessing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.text }]}>처리 중...</Text>
          </View>
        ) : tabContent ? (
          <Text style={[styles.contentText, { color: theme.text }]}>{tabContent}</Text>
        ) : (
          <View style={styles.emptyContent}>
            <MaterialIcons
              name={activeTab === 'transcript' ? 'mic' : activeTab === 'summary' ? 'auto-awesome' : 'translate'}
              size={48}
              color={theme.border}
            />
            <Text style={[styles.emptyText, { color: theme.border }]}>
              {activeTab === 'transcript'
                ? '아직 텍스트로 변환되지 않았습니다.'
                : activeTab === 'summary'
                  ? '아직 요약이 생성되지 않았습니다.'
                  : '아직 번역이 완료되지 않았습니다.'}
            </Text>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.primary }]}
              onPress={getTabAction()}
              accessibilityLabel={getTabActionLabel()}
            >
              <Text style={styles.actionButtonText}>{getTabActionLabel()}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  errorText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  playerInfo: {
    flex: 1,
    marginLeft: 16,
  },
  playerTime: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  tabContainer: {
    flexDirection: 'row',
    marginTop: 20,
    marginHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  contentArea: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  contentText: {
    fontSize: 17,
    lineHeight: 28,
  },
  emptyContent: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  actionButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  missingFileContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  missingFileTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  missingFileDesc: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
