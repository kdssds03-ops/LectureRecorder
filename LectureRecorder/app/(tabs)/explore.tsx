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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getAppSecret, setAppSecret } from '@/api/aiService';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SettingRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value?: string;
  badge?: string;
  theme: (typeof Colors)['light'];
  onPress?: () => void;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ title, theme }: { title: string; theme: (typeof Colors)['light'] }) {
  return (
    <Text style={[styles.sectionHeader, { color: theme.primary }]}>{title}</Text>
  );
}

function SettingRow({ icon, label, value, badge, theme, onPress }: SettingRowProps) {
  const inner = (
    <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <MaterialIcons name={icon} size={22} color={theme.primary} style={styles.rowIcon} />
      <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
      <View style={styles.rowRight}>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: theme.border }]}>
            <Text style={[styles.badgeText, { color: theme.text }]}>{badge}</Text>
          </View>
        ) : value ? (
          <Text style={[styles.rowValue, { color: theme.border }]}>{value}</Text>
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

// ── Main Screen ────────────────────────────────────────────────────────────────

const HIDDEN_TAP_TARGET = 7;

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>설정</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* ── Recording Preferences ── */}
          <SectionHeader title="🎙️ 녹음 환경설정" theme={theme} />
          <SettingRow icon="language" label="음성 인식 언어" value="한국어" badge="출시 예정" theme={theme} />
          <SettingRow icon="record-voice-over" label="화자 구분" value="자동" badge="출시 예정" theme={theme} />
          <SettingRow icon="graphic-eq" label="오디오 품질" value="고품질" badge="출시 예정" theme={theme} />

          {/* ── Language Preferences ── */}
          <SectionHeader title="🌐 언어 환경설정" theme={theme} />
          <SettingRow icon="summarize" label="요약 출력 언어" value="한국어" badge="출시 예정" theme={theme} />
          <SettingRow icon="translate" label="기본 번역 언어" value="영어" badge="출시 예정" theme={theme} />

          {/* ── Privacy & Help ── */}
          <SectionHeader title="🔒 개인정보 및 도움말" theme={theme} />
          <SettingRow
            icon="privacy-tip"
            label="개인정보 처리방침"
            theme={theme}
            onPress={() => Linking.openURL('https://example.com/privacy')}
          />
          <SettingRow
            icon="help-outline"
            label="도움말 및 지원"
            theme={theme}
            onPress={() => Linking.openURL('https://example.com/support')}
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
                  style={[styles.devButton, styles.devButtonSave, { backgroundColor: theme.primary }]}
                  onPress={handleSaveSecret}
                >
                  <Text style={[styles.devButtonText, { color: '#FFFFFF' }]}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={[styles.footer, { color: theme.border }]}>
            © 2024 LectureRecorder. All rights reserved.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  rowIcon: { marginRight: 12 },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '500' },
  rowRight: { alignItems: 'flex-end' },
  rowValue: { fontSize: 14, maxWidth: 160, textAlign: 'right' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
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
  devButtonSave: {},
  devButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 40,
  },
});
