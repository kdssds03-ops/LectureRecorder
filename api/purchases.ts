/**
 * purchases.ts — RevenueCat (react-native-purchases) wrapper.
 *
 * Safe-by-default: if no RevenueCat API key is configured, or on web, all
 * functions no-op and the user is simply treated as a free user. The app never
 * crashes because IAP isn't set up yet.
 *
 * To enable: set EXPO_PUBLIC_REVENUECAT_IOS_KEY (and optionally the Android key)
 * in .env / eas.json, create a "premium" entitlement + an offering in the
 * RevenueCat dashboard, and matching subscription products in App Store Connect.
 */
import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { getDeviceId } from '@/api/aiService';

export const ENTITLEMENT_ID = 'premium';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

function apiKey(): string {
  if (Platform.OS === 'ios') return IOS_KEY;
  if (Platform.OS === 'android') return ANDROID_KEY;
  return '';
}

export function isPurchasesEnabled(): boolean {
  return Platform.OS !== 'web' && !!apiKey();
}

let configured = false;

/** Initialize RevenueCat and sync entitlement → subscription store. */
export async function initPurchases(): Promise<void> {
  if (!isPurchasesEnabled() || configured) return;
  try {
    Purchases.setLogLevel(LOG_LEVEL.WARN);
    // Use our device id as the RevenueCat app_user_id so the backend can verify
    // entitlements server-side with the same identifier.
    const appUserID = await getDeviceId();
    Purchases.configure({ apiKey: apiKey(), appUserID });
    configured = true;
    await refreshEntitlement();
  } catch (err) {
    console.warn('[purchases] init failed:', err);
  }
}

function applyCustomerInfo(info: CustomerInfo): boolean {
  const active = !!info.entitlements.active[ENTITLEMENT_ID];
  useSubscriptionStore.getState().setPremium(active);
  return active;
}

/** Re-check the current entitlement state from RevenueCat. */
export async function refreshEntitlement(): Promise<boolean> {
  if (!isPurchasesEnabled()) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return applyCustomerInfo(info);
  } catch (err) {
    console.warn('[purchases] refreshEntitlement failed:', err);
    return false;
  }
}

/** Returns the current offering's packages (empty if unavailable). */
export async function getPackages(): Promise<PurchasesPackage[]> {
  if (!isPurchasesEnabled()) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const current: PurchasesOffering | null = offerings.current;
    return current?.availablePackages ?? [];
  } catch (err) {
    console.warn('[purchases] getPackages failed:', err);
    return [];
  }
}

/** Purchase a package. Returns true if the user is premium afterwards. */
export async function purchase(pkg: PurchasesPackage): Promise<boolean> {
  if (!isPurchasesEnabled()) return false;
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return applyCustomerInfo(customerInfo);
}

/** Restore previous purchases (required by App Store). */
export async function restorePurchases(): Promise<boolean> {
  if (!isPurchasesEnabled()) return false;
  const info = await Purchases.restorePurchases();
  return applyCustomerInfo(info);
}
