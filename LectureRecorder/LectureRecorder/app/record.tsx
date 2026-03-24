import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Alert, Linking, Animated, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useRecordingStore, RecordingMeta } from '@/store/useRecordingStore';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LinearGradient } from 'expo-linear-gradient';
import { quickTranscribe } from '@/api/aiService';

export default function RecordScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { addRecording } = useRecordingStore();

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [realtimeTranscript, setRealtimeTranscript] = useState<string[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  // Duration timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => {
        setDuration((prev) => prev + 1000);
      }, 1000);

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
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

  // Real-time transcription timer (every 30 seconds)
  useEffect(() => {
    let transInterval: ReturnType<typeof setInterval>;
    if (isRecording) {
      transInterval = setInterval(async () => {
        if (recording) {
          try {
            setIsTranscribing(true);
            // Get current recording URI without stopping
            const status = await recording.getStatusAsync();
            if (status.canRecord) {
              const uri = recording.getURI();
              if (uri) {
                const text = await quickTranscribe(uri);
                if (text && text.trim()) {
                  setRealtimeTranscript(prev => [...prev, text]);
                }
              }
            }
          } catch (err) {
            console.error('Real-time transcription failed', err);
          } finally {
            setIsTranscribing(false);
          }
        }
      }, 30000); // 30 seconds
    }
    return () => clearInterval(transInterval);
  }, [isRecording, recording]);

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

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
      setDuration(0);
      setRealtimeTranscript([]);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('녹음 시작 실패', '녹음을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();

      if (uri) {
        const newRecording: RecordingMeta = {
          id: Date.now().toString(),
          name: `강의 기록 ${new Date().toLocaleDateString()}`,
          titleSource: 'default',
          uri,
          duration,
          createdAt: new Date().toISOString(),
          status: 'pending',
        };
        addRecording(newRecording);
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
              try {
                await recording?.stopAndUnloadAsync();
                await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
              } catch (_) {}
              setRecording(null);
              setIsRecording(false);
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
          style={[styles.closeButton, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <MaterialIcons name="close" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>오늘의 강의 기록</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.visualizerContainer}>
          <Animated.View
            style={[
              styles.pulseCircle,
              {
                backgroundColor: isRecording ? (theme as any).accent : (theme as any).oliveLight,
                transform: [{ scale: pulseAnim }]
              }
            ]}
          />
          <View style={[styles.mainCircle, { backgroundColor: isRecording ? theme.primary : (theme as any).secondary }]}>
            <MaterialIcons name="mic" size={64} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.timerContainer}>
          <Text style={[styles.timer, { color: theme.text }]}>
            {formatTime(duration)}
          </Text>
          <Text style={[styles.timerLabel, { color: theme.textSecondary }]}>
            {isRecording ? '강의를 기록하고 있습니다...' : '준비가 되면 버튼을 눌러주세요'}
          </Text>
        </View>

        {isRecording && (
          <View style={[styles.transcriptContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.transcriptHeader}>
              <Text style={[styles.transcriptTitle, { color: theme.text }]}>실시간 전사 내용</Text>
              {isTranscribing && (
                <Text style={[styles.transcribingText, { color: theme.primary }]}>인식 중...</Text>
              )}
            </View>
            <ScrollView 
              ref={scrollViewRef}
              style={styles.transcriptScroll}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
              {realtimeTranscript.length === 0 ? (
                <Text style={[styles.emptyTranscript, { color: theme.textSecondary }]}>
                  30초마다 전사된 내용이 여기에 표시됩니다.
                </Text>
              ) : (
                realtimeTranscript.map((text, index) => (
                  <Text key={index} style={[styles.transcriptText, { color: theme.text }]}>
                    {text}
                  </Text>
                ))
              )}
            </ScrollView>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        {!isRecording ? (
          <TouchableOpacity
            style={[styles.recordButton, { shadowColor: theme.primary }]}
            onPress={startRecording}
          >
            <LinearGradient
              colors={[(theme as any).secondary, theme.primary]}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>녹음 시작하기</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.stopButton, { backgroundColor: theme.error, shadowColor: theme.error }]}
            onPress={stopRecording}
          >
            <View style={styles.buttonGradient}>
              <MaterialIcons name="stop" size={32} color="#FFFFFF" />
              <Text style={styles.buttonText}>기록 완료</Text>
            </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 20,
  },
  visualizerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 20,
  },
  pulseCircle: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    opacity: 0.5,
  },
  mainCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  timer: {
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8,
  },
  timerLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  transcriptContainer: {
    width: '85%',
    height: 200,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    marginTop: 10,
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  transcriptTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  transcribingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptText: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 12,
  },
  emptyTranscript: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 20,
  },
  controls: {
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  recordButton: {
    height: 72,
    borderRadius: 24,
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    overflow: 'hidden',
  },
  stopButton: {
    height: 72,
    borderRadius: 24,
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    overflow: 'hidden',
  },
  buttonGradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
});
