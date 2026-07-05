import { Colors } from '@/constants/Colors';
import { Radius, Shadows, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPackages, isPurchasesEnabled, purchase, restorePurchases } from '@/api/purchases';
import { FREE_MONTHLY_MINUTES, useSubscriptionStore } from '@/store/useSubscriptionStore';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

const BENEFITS = [
  '음성 인식·요약·번역·퀴즈 무제한',
  '긴 강의(60분+)도 끊김 없이',
  '광고 없는 깔끔한 화면',
  '새 기능 우선 제공',
];

// Apple standard EULA (used when a custom EULA is not provided).
const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_POLICY_URL = 'https://kdssds03-ops.github.io/nokkang-site/privacy.html';
const TERMS_OF_SERVICE_URL = 'https://kdssds03-ops.github.io/nokkang-site/terms.html';

export default function PaywallScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const isPremium = useSubscriptionStore((s) => s.isPremium);
  const remaining = useSubscriptionStore((s) => s.getRemainingMinutes());

  // When RevenueCat isn't configured (1.0 free launch, no IAP), we must not show
  // a non-functional purchase UI — App Review would reject it (2.1 / 3.1). In
  // that case we render a "free usage" info screen with no buy button. Once
  // EXPO_PUBLIC_REVENUECAT_IOS_KEY is set (1.1), the full paywall renders.
  const purchasesEnabled = isPurchasesEnabled();

  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(purchasesEnabled);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!purchasesEnabled) return;
    let mounted = true;
    (async () => {
      const pkgs = await getPackages();
      if (!mounted) return;
      setPackages(pkgs);
      setSelected(pkgs[0] ?? null);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [purchasesEnabled]);

  const openLink = (url: string) =>
    WebBrowser.openBrowserAsync(url, { toolbarColor: theme.surface, controlsColor: theme.primary });

  const handleSubscribe = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const ok = await purchase(selected);
      if (ok) {
        Alert.alert('프리미엄 활성화', '이제 모든 기능을 무제한으로 사용할 수 있어요.');
        router.back();
      }
    } catch (e: any) {
      if (!e?.userCancelled) {
        Alert.alert('구매 실패', '결제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    try {
      const ok = await restorePurchases();
      Alert.alert(ok ? '복원 완료' : '복원할 구매 없음', ok ? '프리미엄이 복원되었습니다.' : '복원할 구매 내역이 없습니다.');
      if (ok) router.back();
    } catch {
      Alert.alert('복원 실패', '구매 복원 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  // ── Free-usage info screen (no IAP configured) ────────────────────────────
  if (!purchasesEnabled) {
    const remainingLabel = isPremium
      ? '무제한'
      : Number.isFinite(remaining)
        ? `${remaining}분`
        : '무제한';
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: theme.surface, ...Shadows.soft }]}>
            <Feather name="x" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.text }]}>무료로 사용 중</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            노깡은 매월 {FREE_MONTHLY_MINUTES}분까지 무료로 녹음·변환할 수 있어요.{'\n'}녹음, 요약, 번역, 퀴즈, 채팅까지 모두 포함됩니다.
          </Text>

          <View style={[styles.usageCard, { backgroundColor: theme.primary + '12', borderColor: theme.primary + '30' }]}>
            <Feather name="clock" size={22} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.usageLabel, { color: theme.textSecondary }]}>이번 달 남은 사용량</Text>
              <Text style={[styles.usageValue, { color: theme.primary }]}>{remainingLabel}</Text>
            </View>
          </View>

          <Text style={[styles.subtitle, { color: theme.textTertiary, marginTop: Spacing.lg }]}>
            사용량은 매월 자동으로 초기화됩니다. 한도에 도달하면 다음 달에 다시 이용할 수 있어요.
          </Text>

          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => openLink(PRIVACY_POLICY_URL)}>
              <Text style={[styles.legalLink, { color: theme.textSecondary }]}>개인정보 처리방침</Text>
            </TouchableOpacity>
            <Text style={[styles.legalSep, { color: theme.textTertiary }]}>·</Text>
            <TouchableOpacity onPress={() => openLink(TERMS_OF_SERVICE_URL)}>
              <Text style={[styles.legalLink, { color: theme.textSecondary }]}>이용약관</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Paywall (RevenueCat configured) ───────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: theme.surface, ...Shadows.soft }]}>
          <Feather name="x" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.text }]}>노깡 프리미엄</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          무료 플랜은 매월 {FREE_MONTHLY_MINUTES}분까지 녹음·변환할 수 있어요.{'\n'}프리미엄으로 제한 없이 학습하세요.
        </Text>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {BENEFITS.map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <Feather name="check-circle" size={18} color={theme.primary} />
              <Text style={[styles.benefitText, { color: theme.text }]}>{b}</Text>
            </View>
          ))}
        </View>

        {isPremium ? (
          <View style={[styles.card, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '30' }]}>
            <Text style={[styles.benefitText, { color: theme.primary, fontWeight: '700' }]}>
              이미 프리미엄을 이용 중이에요. 감사합니다!
            </Text>
          </View>
        ) : loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xl }} />
        ) : packages.length === 0 ? (
          <Text style={[styles.notice, { color: theme.textSecondary }]}>
            현재 이용 가능한 구독 상품이 없습니다. 잠시 후 다시 시도해 주세요.
          </Text>
        ) : (
          <>
            {packages.map((pkg) => {
              const active = selected?.identifier === pkg.identifier;
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  onPress={() => setSelected(pkg)}
                  style={[
                    styles.planRow,
                    { backgroundColor: theme.surface, borderColor: active ? theme.primary : theme.border, borderWidth: active ? 2 : 1 },
                  ]}
                >
                  <Text style={[styles.planTitle, { color: theme.text }]}>{pkg.product.title}</Text>
                  <Text style={[styles.planPrice, { color: theme.primary }]}>{pkg.product.priceString}</Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.subscribeBtn, { backgroundColor: theme.primary, ...Shadows.soft }]}
              onPress={handleSubscribe}
              disabled={busy || !selected}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.subscribeText}>구독 시작하기</Text>}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={handleRestore} disabled={busy} style={styles.restoreBtn}>
          <Text style={[styles.restoreText, { color: theme.textSecondary }]}>구매 복원</Text>
        </TouchableOpacity>

        <Text style={[styles.legal, { color: theme.textTertiary }]}>
          구독은 기간 만료 전 해지하지 않으면 자동 갱신되며, 기기의 App Store 계정 설정에서 관리·해지할 수 있습니다.
        </Text>

        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => openLink(APPLE_EULA_URL)}>
            <Text style={[styles.legalLink, { color: theme.textSecondary }]}>이용약관(EULA)</Text>
          </TouchableOpacity>
          <Text style={[styles.legalSep, { color: theme.textTertiary }]}>·</Text>
          <TouchableOpacity onPress={() => openLink(PRIVACY_POLICY_URL)}>
            <Text style={[styles.legalLink, { color: theme.textSecondary }]}>개인정보 처리방침</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', padding: Spacing.screenPadding },
  closeBtn: { width: 40, height: 40, borderRadius: Radius.pill, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: Spacing.screenPadding, paddingBottom: Spacing.xl * 2 },
  title: { ...Typography.titleLarge, fontWeight: '800', marginTop: Spacing.md },
  subtitle: { ...Typography.bodyMedium, marginTop: Spacing.sm, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg, marginTop: Spacing.xl, gap: Spacing.md },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  benefitText: { ...Typography.bodyMedium, flex: 1 },
  notice: { ...Typography.bodyMedium, marginTop: Spacing.xl, textAlign: 'center', lineHeight: 22 },
  usageCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg, marginTop: Spacing.xl,
  },
  usageLabel: { ...Typography.caption },
  usageValue: { ...Typography.titleLarge, fontWeight: '800', marginTop: 2 },
  planRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: Radius.lg, padding: Spacing.lg, marginTop: Spacing.md,
  },
  planTitle: { ...Typography.bodyMedium, fontWeight: '700' },
  planPrice: { ...Typography.bodyLarge, fontWeight: '800' },
  subscribeBtn: { borderRadius: Radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.xl },
  subscribeText: { color: '#fff', ...Typography.bodyLarge, fontWeight: '800' },
  restoreBtn: { alignItems: 'center', paddingVertical: Spacing.lg },
  restoreText: { ...Typography.bodyMedium, textDecorationLine: 'underline' },
  legal: { ...Typography.caption, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18 },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg },
  legalLink: { ...Typography.caption, textDecorationLine: 'underline' },
  legalSep: { ...Typography.caption },
});
