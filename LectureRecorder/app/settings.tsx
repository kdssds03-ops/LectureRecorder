import React, { useState } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Alert, Linking, Platform, Switch, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Spacing, Radius, Typography, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { setAppSecret } from '@/api/aiService';
import { useSettingsStore } from '@/store/useSettingsStore';

function SectionHeader({ title, theme }: { title: string; theme: any }) {
  return <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>{title}</Text>;
}

function SettingRow({ icon, label, value, theme, onPress, isSwitch, switchValue, onSwitchChange }: any) {
  const inner = (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.iconBox, { backgroundColor: theme.unselectedChip }]}>
        <Feather name={icon} size={18} color={theme.text} />
      </View>
      <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
      <View style={styles.rowRight}>
        {isSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor="#FFFFFF"
          />
        ) : value ? (
          <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{value}</Text>
        ) : (
          <Feather name="chevron-right" size={20} color={theme.border} />
        )}
      </View>
    </View>
  );

  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity> : inner;
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const router = useRouter();

  const {
    recognitionLanguage, setRecognitionLanguage,
    audioQuality, setAudioQuality,
    summaryLanguage, setSummaryLanguage,
    translationLanguage, setTranslationLanguage,
    _hasHydrated,
  } = useSettingsStore();

  const [tapCount, setTapCount] = useState(0);
  const [secretDraft, setSecretDraft] = useState('');

  if (!_hasHydrated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  const handlePrivacyPolicy = async () => {
    await WebBrowser.openBrowserAsync('https://gist.github.com/kdssds03-ops/d5e16b62e40867e50d4d61649c5f794e', {
      toolbarColor: theme.surface,
      controlsColor: theme.primary,
    });
  };

  const handleSendFeedback = async () => {
    const subject = encodeURIComponent('[노깡 피드백] 사용자 의견');
    const body = encodeURIComponent('안녕하세요!\n\n노깡 앱 사용 중 느낀 점이나 개선 사항을 자유롭게 적어주세요.\n\n\n---\n앱 버전: 1.0.0\n기기: ' + Platform.OS);
    const mailtoUrl = `mailto:kdssds03@gmail.com?subject=${subject}&body=${body}`;
    
    try {
      await Linking.openURL(mailtoUrl);
    } catch (error) {
      Alert.alert('오류', '메일 앱을 열 수 없습니다.');
    }
  };

  const toggleLanguageOption = (current: string, setFunc: (val: any) => void) => {
    if (current === 'ko') setFunc('en');
    else setFunc('ko');
  };
  
  const toggleQualityOption = () => {
    if (audioQuality === 'high') setAudioQuality('standard');
    else setAudioQuality('high');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.circularButton, { backgroundColor: theme.surface, ...Shadows.soft }]}>
          <Feather name="chevron-left" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>설정</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <SectionHeader title="인식 및 요약 설정" theme={theme} />
          <View style={[styles.sectionGroup, { backgroundColor: theme.surface, ...Shadows.soft }]}>
            <SettingRow
              icon="globe"
              label="음성 인식 언어"
              value={recognitionLanguage === 'ko' ? '한국어' : recognitionLanguage === 'en' ? '영어' : '자동'}
              theme={theme}
              onPress={() => toggleLanguageOption(recognitionLanguage, setRecognitionLanguage)}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow
              icon="mic"
              label="녹음 음질"
              value={audioQuality === 'high' ? '고음질' : '표준'}
              theme={theme}
              onPress={toggleQualityOption}
            />
          </View>

          <SectionHeader title="AI 노트 설정" theme={theme} />
          <View style={[styles.sectionGroup, { backgroundColor: theme.surface, ...Shadows.soft }]}>
            <SettingRow
              icon="file-text"
              label="기본 요약 언어"
              value={summaryLanguage === 'ko' ? '한국어' : '영어'}
              theme={theme}
              onPress={() => toggleLanguageOption(summaryLanguage, setSummaryLanguage)}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow
              icon="type"
              label="기본 번역 언어"
              value={translationLanguage === 'en' ? '영어' : translationLanguage === 'ja' ? '일본어' : '한국어'}
              theme={theme}
              onPress={() => toggleLanguageOption(translationLanguage, setTranslationLanguage)}
            />
          </View>

          <SectionHeader title="정보 & 지원" theme={theme} />
          <View style={[styles.sectionGroup, { backgroundColor: theme.surface, ...Shadows.soft }]}>
            <SettingRow icon="shield" label="개인정보 처리방침" theme={theme} onPress={handlePrivacyPolicy} />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow icon="mail" label="개발자에게 피드백 보내기" theme={theme} onPress={handleSendFeedback} />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow icon="info" label="앱 버전 정보" value="1.0.0" theme={theme} onPress={() => setTapCount(c => c + 1)} />
          </View>
          
          {tapCount >= 7 && (
            <View style={[styles.devPanel, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
              <Text style={{ color: theme.text, ...Typography.bodyMedium, fontWeight: '700', marginBottom: Spacing.sm }}>개발자 설정</Text>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                placeholder="App Secret"
                placeholderTextColor={theme.textTertiary}
                value={secretDraft}
                onChangeText={setSecretDraft}
                secureTextEntry
              />
              <TouchableOpacity 
                style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                onPress={async () => {
                  await setAppSecret(secretDraft);
                  Alert.alert('저장됨');
                  setTapCount(0);
                }}
              >
                <Text style={{ color: '#FFFFFF', ...Typography.bodyMedium, fontWeight: '700' }}>비밀키 업데이트</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: Spacing.screenPadding, 
    paddingTop: Spacing.lg, 
    paddingBottom: Spacing.md 
  },
  circularButton: { width: 44, height: 44, borderRadius: Radius.pill, justifyContent: 'center', alignItems: 'center' },
  title: { ...Typography.titleMedium },
  scrollContent: { padding: Spacing.screenPadding, paddingBottom: 100 },
  sectionHeader: { ...Typography.caption, marginBottom: Spacing.sm, marginLeft: Spacing.sm, marginTop: Spacing.xl, textTransform: 'uppercase' },
  sectionGroup: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    height: 64,
  },
  divider: {
    height: 1,
    marginLeft: 60,
  },
  iconBox: { width: 36, height: 36, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md },
  rowLabel: { flex: 1, ...Typography.bodyMedium },
  rowValue: { ...Typography.bodyMedium, marginRight: Spacing.xs },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  devPanel: { marginTop: Spacing.xl, padding: Spacing.lg, borderRadius: Radius.xl },
  input: { height: 48, borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, marginBottom: Spacing.md, ...Typography.bodyMedium },
  saveBtn: { height: 48, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
});
