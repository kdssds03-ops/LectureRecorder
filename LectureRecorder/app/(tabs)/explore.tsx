import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getBackendUrl, setBackendUrl, getAppSecret, setAppSecret } from '@/api/aiService';

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const [backendUrl, setBackendUrlState] = useState('');
  const [appSecret, setAppSecretState] = useState('');

  useEffect(() => {
    (async () => {
      setBackendUrlState(await getBackendUrl());
      setAppSecretState(await getAppSecret());
    })();
  }, []);

  const handleSave = async () => {
    if (!backendUrl.trim().startsWith('http')) {
      Alert.alert('입력 오류', '백엔드 URL은 http:// 또는 https://로 시작해야 합니다.');
      return;
    }
    await setBackendUrl(backendUrl);
    await setAppSecret(appSecret);
    Alert.alert('저장 완료', '설정이 저장되었습니다.');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>설정</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>🔗 백엔드 서버 설정</Text>
            <Text style={[styles.description, { color: theme.border }]}>
              음성 인식, 요약, 번역 요청이 이 주소의 서버를 통해 처리됩니다.
            </Text>

            <Text style={[styles.label, { color: theme.text }]}>백엔드 서버 주소</Text>
            <Text style={[styles.sublabel, { color: theme.border }]}>
              로컬 테스트: http://localhost:3000{'\n'}
              배포 후: https://your-app.up.railway.app
            </Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={backendUrl}
              onChangeText={setBackendUrlState}
              placeholder="http://localhost:3000"
              placeholderTextColor={theme.border}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Text style={[styles.label, { color: theme.text }]}>앱 시크릿 키</Text>
            <Text style={[styles.sublabel, { color: theme.border }]}>
              서버의 APP_SECRET 값과 동일하게 입력하세요.
            </Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={appSecret}
              onChangeText={setAppSecretState}
              placeholder="앱 시크릿 키 입력"
              placeholderTextColor={theme.border}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.primary }]}
            onPress={handleSave}
            accessibilityLabel="설정 저장"
          >
            <Text style={styles.saveButtonText}>💾 저장</Text>
          </TouchableOpacity>

          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 24 }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>ℹ️ 앱 정보</Text>
            <Text style={[styles.infoText, { color: theme.text }]}>LectureRecorder v1.0.0</Text>
            <Text style={[styles.infoText, { color: theme.border }]}>강의 녹음 · 화자 구분 · 요약 · 번역</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  sublabel: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  saveButton: {
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoText: {
    fontSize: 14,
    marginTop: 4,
  },
});
