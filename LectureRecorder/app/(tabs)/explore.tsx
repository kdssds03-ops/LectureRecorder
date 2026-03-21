import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  const content = (
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
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>설정</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Recording Preferences ── */}
        <SectionHeader title="🎙️ 녹음 환경설정" theme={theme} />
        <SettingRow
          icon="language"
          label="음성 인식 언어"
          value="한국어"
          theme={theme}
          badge="출시 예정"
        />
        <SettingRow
          icon="record-voice-over"
          label="화자 구분"
          value="자동"
          theme={theme}
          badge="출시 예정"
        />
        <SettingRow
          icon="graphic-eq"
          label="오디오 품질"
          value="고품질"
          theme={theme}
          badge="출시 예정"
        />

        {/* ── Language Preferences ── */}
        <SectionHeader title="🌐 언어 환경설정" theme={theme} />
        <SettingRow
          icon="summarize"
          label="요약 출력 언어"
          value="한국어"
          theme={theme}
          badge="출시 예정"
        />
        <SettingRow
          icon="translate"
          label="기본 번역 언어"
          value="영어"
          theme={theme}
          badge="출시 예정"
        />

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
        <SettingRow
          icon="info-outline"
          label="버전"
          value="1.0.0"
          theme={theme}
        />
        <SettingRow
          icon="mic"
          label="LectureRecorder"
          value="강의 녹음 · 화자 구분 · 요약 · 번역"
          theme={theme}
        />

        <Text style={[styles.footer, { color: theme.border }]}>
          © 2024 LectureRecorder. All rights reserved.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  rowIcon: {
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowValue: {
    fontSize: 14,
    maxWidth: 160,
    textAlign: 'right',
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 40,
  },
});
