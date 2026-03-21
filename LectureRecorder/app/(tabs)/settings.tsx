import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Switch,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getAppSecret, setAppSecret } from '@/api/aiService';
import { useSettingsStore, RecognitionLanguage, AudioQuality, SummaryLanguage, TranslationLanguage } from '@/store/useSettingsStore';
import { ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SettingRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value?: string;
  badge?: string;
  theme: (typeof Colors)['light'];
  onPress?: () => void;
  isSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (val: boolean) => void;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ title, theme }: { title: string; theme: (typeof Colors)['light'] }) {
  return (
    <Text style={[styles.sectionHeader, { color: theme.primary }]}>{title}</Text>
  );
}

function SettingRow({ 
  icon, 
  label, 
  value, 
  badge, 
  theme, 
  onPress,
  isSwitch,
  switchValue,
  onSwitchChange
}: SettingRowProps) {
  const inner = (
    <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <MaterialIcons name={icon} size={22} color={theme.primary} style={styles.rowIcon} />
      <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
      <View style={styles.rowRight}>
        {isSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange}
            trackColor={{ false: theme.border, true: (theme as any).oliveDeep }}
            thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
          />
        ) : badge ? (
          <View style={[styles.badge, { backgroundColor: theme.border }]}>
            <Text style={[styles.badgeText, { color: (theme as any).textSecondary }]}>{badge}</Text>
          </View>
        ) : value ? (
          <Text style={[styles.rowValue, { color: (theme as any).textSecondary }]}>{value}</Text>
        ) : onPress ? (
          <MaterialIcons name="chevron-right" size={20} color={theme.border} />
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

interface SelectionOption<T> {
  label: string;
  value: T;
}

interface SelectionModalProps<T> {
  visible: boolean;
  title: string;
  options: SelectionOption<T>[];
  selectedValue: T;
  onSelect: (value: T) => void;
  onClose: () => void;
  theme: (typeof Colors)['light'];
}

function SelectionModal<T>({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
  theme,
}: SelectionModalProps<T>) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>
          <ScrollView>
            {options.map((option) => (
              <TouchableOpacity
                key={String(option.value)}
                style={[
                  styles.optionRow,
                  { borderBottomColor: theme.border },
                  selectedValue === option.value && { backgroundColor: (theme as any).unselectedChip },
                ]}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    { color: theme.text },
                    selectedValue === option.value && { color: theme.primary, fontWeight: '700' },
                  ]}
                >
                  {option.label}
                </Text>
                {selectedValue === option.value && (
                  <MaterialIcons name="check" size={20} color={theme.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <SafeAreaView />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

const HIDDEN_TAP_TARGET = 7;

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const {
    recognitionLanguage,
    setRecognitionLanguage,
    speakerDiarization,
    setSpeakerDiarization,
    audioQuality,
    setAudioQuality,
    summaryLanguage,
    setSummaryLanguage,
    translationLanguage,
    setTranslationLanguage,
    _hasHydrated,
  } = useSettingsStore();

  // ── Modal states ────────────────────────────────────────────────────────────
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [qualityModalVisible, setQualityModalVisible] = useState(false);
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);
  const [translationModalVisible, setTranslationModalVisible] = useState(false);

  // ── Hidden developer panel state ────────────────────────────────────────────
  const [tapCount, setTapCount] = useState(0);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [secretDraft, setSecretDraft] = useState('');

  useEffect(() => {
    if (!showDevPanel) return;
    getAppSecret().then(setSecretDraft);
  }, [showDevPanel]);

  const handleVersionTap = () => {
    const next = tapCount + 1;
    if (next >= HIDDEN_TAP_TARGET) {
      setShowDevPanel(true);
      setTapCount(0);
    } else {
      setTapCount(next);
    }
  };

  const handleSaveSecret = async () => {
    await setAppSecret(secretDraft);
    Alert.alert('저장됨', '앱 시크릿 키가 저장되었습니다.');
    setShowDevPanel(false);
    setTapCount(0);
  };

  const handlePrivacyPolicy = async () => {
    await WebBrowser.openBrowserAsync('https://your-notion-link-or-gist.com', {
      toolbarColor: (theme as any).oliveDeep || '#C2D68F',
      controlsColor: theme.primary,
      enableBarCollapsing: true,
      showTitle: true,
    });
  };

  const handleSupport = () => {
    const email = 'support@lecturerecorder.com';
    const subject = '[문의] Lecture Recorder 이용 관련 문의드립니다';
    const body = '안녕하세요, 아래에 문의 내용을 상세히 적어주시면 신속히 답변드리겠습니다.\n\n1. 기기 모델명:\n2. OS 버전:\n3. 문의 내용:';
    
    const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(url);
  };

  if (!_hasHydrated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  const RECOGNITION_LANGUAGES: SelectionOption<RecognitionLanguage>[] = [
    { label: '한국어', value: 'ko' },
    { label: '영어', value: 'en' },
    { label: '중국어', value: 'zh' },
    { label: '자동 감지', value: 'auto' },
  ];

  const AUDIO_QUALITIES: SelectionOption<AudioQuality>[] = [
    { label: '표준', value: 'standard' },
    { label: '고음질', value: 'high' },
  ];

  const SUMMARY_LANGUAGES: SelectionOption<SummaryLanguage>[] = [
    { label: '한국어', value: 'ko' },
    { label: '영어', value: 'en' },
    { label: '중국어', value: 'zh' },
  ];

  const TRANSLATION_LANGUAGES: SelectionOption<TranslationLanguage>[] = [
    { label: '영어', value: 'en' },
    { label: '한국어', value: 'ko' },
    { label: '일본어', value: 'ja' },
    { label: '중국어', value: 'zh' },
    { label: '스페인어', value: 'es' },
    { label: '프랑스어', value: 'fr' },
  ];

  const getRecognitionLangLabel = (val: RecognitionLanguage) => 
    RECOGNITION_LANGUAGES.find(o => o.value === val)?.label || val;

  const getAudioQualityLabel = (val: AudioQuality) =>
    AUDIO_QUALITIES.find(o => o.value === val)?.label || val;

  const getSummaryLangLabel = (val: SummaryLanguage) =>
    SUMMARY_LANGUAGES.find(o => o.value === val)?.label || val;

  const getTranslationLangLabel = (val: TranslationLanguage) =>
    TRANSLATION_LANGUAGES.find(o => o.value === val)?.label || val;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>설정</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* ── Recording Preferences ── */}
          <SectionHeader title="🎙️ 녹음 환경설정" theme={theme} />
          <SettingRow
            icon="language"
            label="음성 인식 언어"
            value={getRecognitionLangLabel(recognitionLanguage)}
            theme={theme}
            onPress={() => setLangModalVisible(true)}
          />
          <SettingRow
            icon="record-voice-over"
            label="화자 구분"
            theme={theme}
            isSwitch
            switchValue={speakerDiarization}
            onSwitchChange={setSpeakerDiarization}
          />
          <SettingRow
            icon="graphic-eq"
            label="오디오 품질"
            value={getAudioQualityLabel(audioQuality)}
            theme={theme}
            onPress={() => setQualityModalVisible(true)}
          />

          {/* ── Language Preferences ── */}
          <SectionHeader title="🌐 언어 환경설정" theme={theme} />
          <SettingRow
            icon="summarize"
            label="요약 출력 언어"
            value={getSummaryLangLabel(summaryLanguage)}
            theme={theme}
            onPress={() => setSummaryModalVisible(true)}
          />
          <SettingRow
            icon="translate"
            label="기본 번역 언어"
            value={getTranslationLangLabel(translationLanguage)}
            theme={theme}
            onPress={() => setTranslationModalVisible(true)}
          />

          {/* ── Privacy & Help ── */}
          <SectionHeader title="🔒 개인정보 및 도움말" theme={theme} />
          <SettingRow
            icon="privacy-tip"
            label="개인정보 처리방침"
            theme={theme}
            onPress={handlePrivacyPolicy}
          />
          <SettingRow
            icon="help-outline"
            label="도움말 및 지원"
            theme={theme}
            onPress={handleSupport}
          />

          {/* ── App Info ── */}
          <SectionHeader title="ℹ️ 앱 정보" theme={theme} />

          {/* Version row — tap 7× to reveal dev panel */}
          <TouchableOpacity onPress={handleVersionTap} accessibilityRole="button" accessibilityLabel="버전 정보">
            <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <MaterialIcons name="info-outline" size={22} color={theme.primary} style={styles.rowIcon} />
              <Text style={[styles.rowLabel, { color: theme.text }]}>버전</Text>
              <Text style={[styles.rowValue, { color: theme.border }]}>1.0.0</Text>
            </View>
          </TouchableOpacity>

          <SettingRow icon="mic" label="LectureRecorder" value="강의 녹음 · 화자 구분 · 요약 · 번역" theme={theme} />

          {/* ── Hidden developer panel (7-tap unlock) ── */}
          {showDevPanel && (
            <View style={[styles.devPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.devPanelTitle, { color: theme.text }]}>🔧 내부 설정</Text>
              <Text style={[styles.devPanelSubtitle, { color: theme.border }]}>
                테스터 전용 · 앱 시크릿 키
              </Text>
              <TextInput
                style={[styles.devInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                value={secretDraft}
                onChangeText={setSecretDraft}
                placeholder="앱 시크릿 키 입력"
                placeholderTextColor={theme.border}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.devButtonRow}>
                <TouchableOpacity
                  style={[styles.devButton, styles.devButtonCancel, { borderColor: theme.border }]}
                  onPress={() => { setShowDevPanel(false); setTapCount(0); }}
                >
                  <Text style={[styles.devButtonText, { color: theme.border }]}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.devButton, styles.devButtonSave]}
                  onPress={handleSaveSecret}
                >
                  <LinearGradient
                    colors={[(theme as any).oliveLight, (theme as any).oliveDeep]}
                    style={styles.gradientButton}
                  >
                    <Text style={[styles.devButtonText, { color: (theme as any).textOnPrimary ?? '#121212' }]}>저장</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={[styles.versionText, { color: (theme as any).oliveDeep || '#C2D68F' }]}>
            v1.0.0
          </Text>
          <Text style={[styles.footer, { color: theme.border }]}>
            © {new Date().getFullYear()} LectureRecorder. All rights reserved.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <SelectionModal
        visible={langModalVisible}
        title="음성 인식 언어 선택"
        options={RECOGNITION_LANGUAGES}
        selectedValue={recognitionLanguage}
        onSelect={setRecognitionLanguage}
        onClose={() => setLangModalVisible(false)}
        theme={theme}
      />

      <SelectionModal
        visible={qualityModalVisible}
        title="오디오 품질 선택"
        options={AUDIO_QUALITIES}
        selectedValue={audioQuality}
        onSelect={setAudioQuality}
        onClose={() => setQualityModalVisible(false)}
        theme={theme}
      />

      <SelectionModal
        visible={summaryModalVisible}
        title="요약 출력 언어 선택"
        options={SUMMARY_LANGUAGES}
        selectedValue={summaryLanguage}
        onSelect={setSummaryLanguage}
        onClose={() => setSummaryModalVisible(false)}
        theme={theme}
      />

      <SelectionModal
        visible={translationModalVisible}
        title="기본 번역 언어 선택"
        options={TRANSLATION_LANGUAGES}
        selectedValue={translationLanguage}
        onSelect={setTranslationLanguage}
        onClose={() => setTranslationModalVisible(false)}
        theme={theme}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 60,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  rowIcon: { marginRight: 12 },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '600' },
  rowRight: { alignItems: 'flex-end' },
  rowValue: { fontSize: 15, maxWidth: 160, textAlign: 'right' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  // ── Developer panel
  devPanel: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  devPanelTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  devPanelSubtitle: {
    fontSize: 12,
    marginBottom: 12,
  },
  devInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  devButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  devButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  devButtonCancel: {
    borderWidth: 1,
  },
  devButtonSave: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  gradientButton: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  devButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 40,
    opacity: 0.6,
  },
  // ── Selection Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  optionLabel: {
    fontSize: 16,
  },
});
