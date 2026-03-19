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
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getApiKey, setApiKey } from '@/api/aiService';

export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const [assemblyKey, setAssemblyKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');

  useEffect(() => {
    (async () => {
      setAssemblyKey(await getApiKey('assemblyai'));
      setOpenaiKey(await getApiKey('openai'));
    })();
  }, []);

  const handleSave = async () => {
    await setApiKey('assemblyai', assemblyKey.trim());
    await setApiKey('openai', openaiKey.trim());
    Alert.alert('저장 완료', 'API 키가 안전하게 저장되었습니다.');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="뒤로 가기">
          <MaterialIcons name="arrow-back" size={28} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>설정</Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>🔑 API 키 설정</Text>
            <Text style={[styles.description, { color: theme.border }]}>
              음성 인식, 요약, 번역 기능을 사용하려면 외부 서비스의 API 키가 필요합니다.
            </Text>

            <Text style={[styles.label, { color: theme.text }]}>AssemblyAI API Key</Text>
            <Text style={[styles.sublabel, { color: theme.border }]}>
              음성 인식 및 화자 구분에 사용됩니다.
            </Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={assemblyKey}
              onChangeText={setAssemblyKey}
              placeholder="AssemblyAI API Key 입력"
              placeholderTextColor={theme.border}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.label, { color: theme.text }]}>OpenAI API Key</Text>
            <Text style={[styles.sublabel, { color: theme.border }]}>
              강의 내용 요약 및 번역에 사용됩니다.
            </Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={openaiKey}
              onChangeText={setOpenaiKey}
              placeholder="OpenAI API Key 입력"
              placeholderTextColor={theme.border}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.primary }]}
            onPress={handleSave}
            accessibilityLabel="API 키 저장"
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
  title: {
    fontSize: 20,
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
