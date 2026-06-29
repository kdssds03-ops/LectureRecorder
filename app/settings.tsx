import React, { useState } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Alert, Linking, Platform, Switch, ActivityIndicator, KeyboardAvoidingView, Modal } from 'react-native';
import { LECTURE_TYPE_LABELS, LECTURE_TYPE_ICONS, LectureType } from '@/store/useRecordingStore';
import * as WebBrowser from 'expo-web-browser';
import { Href, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Spacing, Radius, Typography, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { setAppSecret } from '@/api/aiService';
import { useSettingsStore } from '@/store/useSettingsStore';
import { FREE_MONTHLY_MINUTES, useSubscriptionStore } from '@/store/useSubscriptionStore';
import { restorePurchases } from '@/api/purchases';

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
  const isPremium = useSubscriptionStore((s) => s.isPremium);
  const remaining = useSubscriptionStore((s) => s.getRemainingMinutes());

  const handleRestore = async () => {
    try {
      const ok = await restorePurchases();
      Alert.alert(ok ? '복원 완료' : '복원할 구매 없음', ok ? '프리미엄이 복원되었습니다.' : '복원할 구매 내역이 없습니다.');
    } catch {
      Alert.alert('복원 실패', '구매 복원 중 오류가 발생했습니다.');
    }
  };

  const {
    recognitionLanguage, setRecognitionLanguage,
    audioQuality, setAudioQuality,
    diarizationEnabled, setDiarizationEnabled,
    summaryLanguage, setSummaryLanguage,
    translationLanguage, setTranslationLanguage,
    summaryTemplates, setSummaryTemplate,
    _hasHydrated,
  } = useSettingsStore();

  const [tapCount, setTapCount] = useState(0);
  const [secretDraft, setSecretDraft] = useState('');

  // ── Summary template editor ────────────────────────────────────────────────
  const LECTURE_TYPE_LIST: LectureType[] = [
    'general', 'math', 'science', 'coding', 'humanities', 'language',
    'history', 'economics', 'law', 'medicine', 'art', 'other',
  ];
  const [tplVisible, setTplVisible] = useState(false);
  const [tplType, setTplType] = useState<LectureType>('general');
  const [tplDraft, setTplDraft] = useState('');
  const customizedCount = Object.values(summaryTemplates || {}).filter((v) => v && v.trim()).length;

  const selectTplType = (t: LectureType) => {
    setTplType(t);
    setTplDraft(summaryTemplates?.[t] || '');
  };
  const openTplEditor = () => {
    selectTplType('general');
    setTplVisible(true);
  };
  const saveTpl = () => {
    setSummaryTemplate(tplType, tplDraft.trim());
    Alert.alert('저장됨', `${LECTURE_TYPE_LABELS[tplType]} 요약 지시문이 저장되었습니다.`);
  };

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

  const handleTerms = async () => {
    await WebBrowser.openBrowserAsync('https://github.com/kdssds03-ops/LectureRecorder/blob/main/TERMS_OF_SERVICE.md', {
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

  // Recognition language cycles through all supported options.
  const RECOGNITION_CYCLE = ['auto', 'ko', 'en', 'zh'] as const;
  const RECOGNITION_LABELS: Record<string, string> = { auto: '자동', ko: '한국어', en: '영어', zh: '중국어' };
  const cycleRecognitionLanguage = () => {
    const idx = RECOGNITION_CYCLE.indexOf(recognitionLanguage as any);
    const next = RECOGNITION_CYCLE[(idx + 1) % RECOGNITION_CYCLE.length];
    setRecognitionLanguage(next);
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
              value={RECOGNITION_LABELS[recognitionLanguage] ?? '자동'}
              theme={theme}
              onPress={cycleRecognitionLanguage}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow
              icon="mic"
              label="녹음 음질"
              value={audioQuality === 'high' ? '고음질' : '표준'}
              theme={theme}
              onPress={toggleQualityOption}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow
              icon="users"
              label="화자 구분"
              theme={theme}
              isSwitch
              switchValue={diarizationEnabled}
              onSwitchChange={setDiarizationEnabled}
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
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow
              icon="edit-3"
              label="요약 템플릿 편집"
              value={customizedCount > 0 ? `${customizedCount}개 맞춤` : '기본'}
              theme={theme}
              onPress={openTplEditor}
            />
          </View>

          <SectionHeader title="실험실" theme={theme} />
          <View style={[styles.sectionGroup, { backgroundColor: theme.surface, ...Shadows.soft }]}>
            <SettingRow
              icon="radio"
              label="실시간 받아쓰기 (실험적)"
              value="화자 구분"
              theme={theme}
              onPress={() => router.push('/record-live' as Href)}
            />
          </View>

          <SectionHeader title="구독" theme={theme} />
          <View style={[styles.sectionGroup, { backgroundColor: theme.surface, ...Shadows.soft }]}>
            <SettingRow
              icon="star"
              label={isPremium ? '프리미엄 이용 중' : '프리미엄 구독'}
              value={isPremium ? '무제한' : `이번 달 ${remaining}분 남음`}
              theme={theme}
              onPress={() => router.push('/paywall' as Href)}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow icon="refresh-ccw" label="구매 복원" theme={theme} onPress={handleRestore} />
          </View>

          <SectionHeader title="정보 & 지원" theme={theme} />
          <View style={[styles.sectionGroup, { backgroundColor: theme.surface, ...Shadows.soft }]}>
            <SettingRow icon="shield" label="개인정보 처리방침" theme={theme} onPress={handlePrivacyPolicy} />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow icon="file-text" label="이용약관" theme={theme} onPress={handleTerms} />
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

      {/* Summary template editor */}
      <Modal visible={tplVisible} transparent animationType="slide" onRequestClose={() => setTplVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.tplOverlay}>
          <View style={[styles.tplSheet, { backgroundColor: theme.surface }]}>
            <View style={[styles.tplHandle, { backgroundColor: theme.border }]} />
            <View style={styles.tplHeaderRow}>
              <Text style={[styles.tplTitle, { color: theme.text }]}>요약 템플릿 편집</Text>
              <TouchableOpacity onPress={() => setTplVisible(false)}>
                <Feather name="x" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.tplSubtitle, { color: theme.textSecondary }]}>
              강의 종류별로 AI 요약에 추가할 지시문을 입력하세요. (예: "공식은 표로 정리해줘")
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tplChips}>
              {LECTURE_TYPE_LIST.map((t) => {
                const selected = t === tplType;
                const has = !!(summaryTemplates?.[t] && summaryTemplates[t].trim());
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => selectTplType(t)}
                    style={[
                      styles.tplChip,
                      {
                        backgroundColor: selected ? theme.primary : theme.background,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.tplChipIcon}>{LECTURE_TYPE_ICONS[t]}</Text>
                    <Text style={[styles.tplChipText, { color: selected ? '#FFFFFF' : theme.text }]}>
                      {LECTURE_TYPE_LABELS[t]}
                    </Text>
                    {has && <View style={[styles.tplDot, { backgroundColor: selected ? '#FFFFFF' : theme.accent }]} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TextInput
              style={[styles.tplInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              placeholder="이 강의 종류의 요약에 반영할 요청을 입력하세요..."
              placeholderTextColor={theme.textTertiary}
              value={tplDraft}
              onChangeText={setTplDraft}
              multiline
              maxLength={600}
            />

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.primary }]} onPress={saveTpl}>
              <Text style={{ color: '#FFFFFF', ...Typography.bodyMedium, fontWeight: '700' }}>저장</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  tplOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  tplSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: Spacing.md, paddingHorizontal: Spacing.screenPadding, paddingBottom: 40 },
  tplHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.lg },
  tplHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  tplTitle: { ...Typography.titleMedium, fontWeight: '700' },
  tplSubtitle: { ...Typography.bodySmall, marginBottom: Spacing.md },
  tplChips: { gap: Spacing.xs, paddingVertical: Spacing.xs, paddingRight: Spacing.md },
  tplChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: 1 },
  tplChipIcon: { fontSize: 14 },
  tplChipText: { ...Typography.bodySmall, fontWeight: '600' },
  tplDot: { width: 6, height: 6, borderRadius: 3, marginLeft: 2 },
  tplInput: { minHeight: 110, maxHeight: 200, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing.md, ...Typography.bodyMedium, textAlignVertical: 'top' },
});