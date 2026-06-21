/**
 * usage.ts — server-side speech-to-text usage metering & free-tier enforcement.
 *
 * The mobile app sends `x-device-id`. We meter actual transcribed audio seconds
 * (from AssemblyAI's `audio_duration`) per device per month, and reject free
 * users that exceed the monthly quota — UNLESS they are premium (verified via
 * RevenueCat, when REVENUECAT_SECRET_KEY is configured).
 *
 * NOTE: storage here is in-memory and resets on redeploy/restart. For production
 * use a shared store (Redis / Postgres). The pure functions below are written so
 * that backing store can be swapped without touching call sites.
 */
import axios from 'axios';

export const FREE_MONTHLY_SECONDS = 120 * 60; // 120 minutes

interface UsageRecord {
  month: string;
  seconds: number;
}

const usageStore = new Map<string, UsageRecord>();
const jobDevice = new Map<string, string>(); // jobId -> deviceId
const countedJobs = new Set<string>();        // jobIds already metered

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getUsedSeconds(deviceId: string): number {
  const r = usageStore.get(deviceId);
  return r && r.month === currentMonth() ? r.seconds : 0;
}

export function addSeconds(deviceId: string, seconds: number): void {
  if (!deviceId) return;
  const month = currentMonth();
  const add = Math.max(0, Math.round(seconds || 0));
  const r = usageStore.get(deviceId);
  if (!r || r.month !== month) {
    usageStore.set(deviceId, { month, seconds: add });
  } else {
    r.seconds += add;
  }
}

export function isOverFreeLimit(deviceId: string): boolean {
  return getUsedSeconds(deviceId) >= FREE_MONTHLY_SECONDS;
}

/** Associate a transcription job with the device that started it. */
export function linkJob(jobId: string, deviceId: string): void {
  if (jobId && deviceId) jobDevice.set(jobId, deviceId);
}

/** Meter a completed job exactly once. */
export function countJobOnce(jobId: string, seconds: number): void {
  if (!jobId || countedJobs.has(jobId)) return;
  countedJobs.add(jobId);
  const deviceId = jobDevice.get(jobId);
  if (deviceId) addSeconds(deviceId, seconds);
}

// ── Premium verification via RevenueCat ─────────────────────────────────────
const RC_KEY = process.env.REVENUECAT_SECRET_KEY || '';
const ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID || 'premium';

/** Enforcement only runs when we can verify premium (otherwise we'd block payers). */
export function enforcementEnabled(): boolean {
  return !!RC_KEY;
}

export async function isPremium(appUserId: string): Promise<boolean> {
  if (!RC_KEY || !appUserId) return false;
  try {
    const res = await axios.get(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: { Authorization: `Bearer ${RC_KEY}` }, timeout: 8000 }
    );
    const ent = res.data?.subscriber?.entitlements?.[ENTITLEMENT_ID];
    if (!ent) return false;
    if (!ent.expires_date) return true; // lifetime
    return new Date(ent.expires_date).getTime() > Date.now();
  } catch (err: any) {
    console.warn('[usage] RevenueCat check failed:', err?.response?.status ?? err?.message);
    return false; // fail-open vs fail-closed? See enforce() — we choose not to block on RC errors
  }
}

/**
 * Decide whether to allow a transcription request.
 * Returns { allowed, reason }. When enforcement is disabled, always allows.
 */
export async function enforce(deviceId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!enforcementEnabled()) return { allowed: true };
  if (!deviceId) return { allowed: true }; // can't attribute → don't hard-block
  if (!isOverFreeLimit(deviceId)) return { allowed: true };
  const premium = await isPremium(deviceId);
  if (premium) return { allowed: true };
  return { allowed: false, reason: 'free_quota_exceeded' };
}
