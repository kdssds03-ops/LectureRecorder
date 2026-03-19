import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useRecordingStore, RecordingMeta } from '@/store/useRecordingStore';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RecordScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { addRecording } = useRecordingStore();

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setDuration((prev) => prev + 1000);
      }, 1000);
    }
    return () => clearInterval(interval);
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
        Alert.alert('권한 필요', '마이크 접근 권한이 필요합니다.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setIsRecording(true);
      setDuration(0);
    } catch (err) {
      console.error('Failed to start recording', err);
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
          name: `강의 녹음 ${new Date().toLocaleDateString()}`,
          uri,
          duration,
          createdAt: Date.now(),
        };
        addRecording(newRecording);
        router.back();
      }
    } catch (error) {
      console.error('Failed to stop recording', error);
    }
    setRecording(null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="뒤로 가기">
          <MaterialIcons name="close" size={32} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>새 강의 녹음</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.timerContainer}>
          <Text style={[styles.timer, { color: isRecording ? theme.error : theme.text }]}>
            {formatTime(duration)}
          </Text>
        </View>

        {isRecording && (
          <View style={styles.statusContainer}>
            <View style={[styles.recordingIndicator, { backgroundColor: theme.error }]} />
            <Text style={[styles.statusText, { color: theme.error }]}>녹음 중...</Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        {!isRecording ? (
          <TouchableOpacity
            style={[styles.recordButton, { backgroundColor: theme.error }]}
            onPress={startRecording}
            accessibilityLabel="녹음 시작"
          >
            <MaterialIcons name="mic" size={48} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.stopButton, { backgroundColor: theme.text }]}
            onPress={stopRecording}
            accessibilityLabel="녹음 중지 및 저장"
          >
            <View style={[styles.stopIcon, { backgroundColor: theme.background }]} />
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
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerContainer: {
    marginBottom: 40,
  },
  timer: {
    fontSize: 72,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
  },
  controls: {
    paddingBottom: 60,
    alignItems: 'center',
  },
  recordButton: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  stopButton: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
});
