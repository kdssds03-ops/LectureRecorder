import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Alert, Linking, KeyboardAvoidingView, Platform, Modal, Switch, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getAppSecret, setAppSecret, getDeveloperMode, setDeveloperMode, clearBackendOverride, getRawBackendOverride, setBackendUrl } from '@/api/aiService';
import { useSettingsStore, RecognitionLanguage, AudioQuality, SummaryLanguage, TranslationLanguage } from '@/store/useSettingsStore';
import { LinearGradient } from 'expo-linear-gradient';

function SectionHeader({ title, theme }: { title: string; theme: any }) {
  return <Text style={[styles.sectionHeader, { color: theme.primary }]}>{title}</Text>;
}

function SettingRow({ icon, label, value, theme, onPress, isSwitch, switchValue, onSwitchChange }: any) {
  const inner = (
    <View style={[styles.row, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
      <View style={[styles.iconBox, { backgroundColor: theme.oliveLight }]}>
        <MaterialIcons name={icon} size={20} color={theme.primary} />
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
          <MaterialIcons name="chevron-right" size={20} color={theme.border} />
        )}
      </View>
    </View>
  );

  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity> : inner;
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const {
    recognitionLanguage, setRecognitionLanguage,
    speakerDiarization, setSpeakerDiarization,
    audioQuality, setAudioQuality,
    summaryLanguage, setSummaryLanguage,
    translationLanguage, setTranslationLanguage,
    _hasHydrated,
  } = useSettingsStore();

  const [langModalVisible, setLangModalVisible] = useState(false);
  const [qualityModalVisible, setQualityModalVisible] = useState(false);
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);
  const [translationModalVisible, setTranslationModalVisible] = useState(false);

  const [tapCount, setTapCount] = useState(0);
  const [showDevPanel, setShowDevPanel] = useState(false);
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
      toolbarColor: theme.primary,
      controlsColor: '#FFFFFF',
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>설정</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <SectionHeader title="인식 및 요약 설정" theme={theme} />
        <SettingRow
          icon="language"
          label="음성 인식 언어"
          value={recognitionLanguage === 'ko' ? '한국어' : recognitionLanguage === 'en' ? '영어' : '자동'}
          theme={theme}
          onPress={() => setLangModalVisible(true)}
        />
        <SettingRow
          icon="people"
          label="화자 분리 (Beta)"
          isSwitch
          switchValue={speakerDiarization}
          onSwitchChange={setSpeakerDiarization}
          theme={theme}
        />
        <SettingRow
          icon="high-quality"
          label="녹음 음질"
          value={audioQuality === 'high' ? '고음질' : '표준'}
          theme={theme}
          onPress={() => setQualityModalVisible(true)}
        />

        <View style={{ height: 24 }} />
        <SectionHeader title="AI 노트 설정" theme={theme} />
        <SettingRow
          icon="article"
          label="요약 언어"
          value={summaryLanguage === 'ko' ? '한국어' : '영어'}
          theme={theme}
          onPress={() => setSummaryModalVisible(true)}
        />
        <SettingRow
          icon="translate"
          label="기본 번역 언어"
          value={translationLanguage === 'en' ? '영어' : translationLanguage === 'ja' ? '일본어' : '한국어'}
          theme={theme}
          onPress={() => setTranslationModalVisible(true)}
        />

        <View style={{ height: 24 }} />
        <SectionHeader title="정보" theme={theme} />
        <SettingRow icon="security" label="개인정보 처리방침" theme={theme} onPress={handlePrivacyPolicy} />
        <SettingRow icon="mail" label="피드백 보내기" theme={theme} onPress={handleSendFeedback} />
        <SettingRow icon="info" label="앱 버전" value="1.0.0" theme={theme} onPress={() => setTapCount(c => c + 1)} />
        
        {tapCount >= 7 && (
          <View style={[styles.devPanel, { backgroundColor: theme.card }]}>
            <Text style={{ color: theme.text, fontWeight: 'bold', marginBottom: 8 }}>개발자 설정</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              placeholder="App Secret"
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
              <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>비밀키 저장</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: '800' },
  scrollContent: { padding: 24, paddingBottom: 100 },
  sectionHeader: { fontSize: 14, fontWeight: '800', marginBottom: 12, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    elevation: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '600' },
  rowValue: { fontSize: 14, fontWeight: '600' },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  devPanel: { marginTop: 24, padding: 20, borderRadius: 20, elevation: 4 },
  input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, marginBottom: 12 },
  saveBtn: { height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
});
