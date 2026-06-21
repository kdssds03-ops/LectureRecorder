/**
 * usage.ts — server-side STT usage metering & free-tier enforcement.
 *
 * Storage backend:
 *   - If REDIS_URL is set → Redis (atomic, survives restarts/redeploys). Recommended.
 *   - Otherwise → in-memory fallback (resets on restart; fine for local dev).
 *
 * The mobile app sends `x-device-id`. We meter actual transcribed audio seconds
 * (AssemblyAI `audio_duration`) per device per month, and reject free users that
 * exceed the monthly quota — unless premium (verified via RevenueCat).
 */
import axios from 'axios';
import Redis from 'ioredis';

export const FREE_MONTHLY_SECONDS = 120 * 60; // 120 minutes

const MONTH_TTL_SECONDS = 75 * 24 * 3600; // keep monthly counters ~75 days
const JOB_TTL_SECONDS = 7 * 24 * 3600;

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Storage backend abstraction ─────────────────────────────────────────────
interface UsageBackend {
  addSeconds(deviceId: string, seconds: number): Promise<void>;
  getUsedSeconds(deviceId: string): Promise<number>;
  linkJob(jobId: string, deviceId: string): Promise<void>;
  /** Returns the deviceId if this job was not counted before, else null. */
  claimJob(jobId: string): Promise<string | null>;
}

// In-memory fallback ----------------------------------------------------------
class MemoryBackend implements UsageBackend {
  private usage = new Map<string, { month: string; seconds: number }>();
  private jobDevice = new Map<string, string>();
  private counted = new Set<string>();

  async addSeconds(deviceId: string, seconds: number) {
    const month = currentMonth();
    const add = Math.max(0, Math.round(seconds || 0));
    const r = this.usage.get(deviceId);
    if (!r || r.month !== month) this.usage.set(deviceId, { month, seconds: add });
    else r.seconds += add;
  }
  async getUsedSeconds(deviceId: string) {
    const r = this.usage.get(deviceId);
    return r && r.month === currentMonth() ? r.seconds : 0;
  }
  async linkJob(jobId: string, deviceId: string) {
    if (jobId && deviceId) this.jobDevice.set(jobId, deviceId);
  }
  async claimJob(jobId: string) {
    if (!jobId || this.counted.has(jobId)) return null;
    this.counted.add(jobId);
    return this.jobDevice.get(jobId) ?? null;
  }
}

// Redis backend ---------------------------------------------------------------
class RedisBackend implements UsageBackend {
  constructor(private redis: Redis) {}
  private usageKey(deviceId: string) {
    return `usage:${deviceId}:${currentMonth()}`;
  }
  async addSeconds(deviceId: string, seconds: number) {
    const add = Math.max(0, Math.round(seconds || 0));
    if (!deviceId || add === 0) return;
    const key = this.usageKey(deviceId);
    await this.redis.incrby(key, add);
    await this.redis.expire(key, MONTH_TTL_SECONDS);
  }
  async getUsedSeconds(deviceId: string) {
    const v = await this.redis.get(this.usageKey(deviceId));
    return v ? parseInt(v, 10) || 0 : 0;
  }
  async linkJob(jobId: string, deviceId: string) {
    if (jobId && deviceId) await this.redis.set(`jobdev:${jobId}`, deviceId, 'EX', JOB_TTL_SECONDS);
  }
  async claimJob(jobId: string) {
    if (!jobId) return null;
    // NX ensures only the first caller "wins" → metered exactly once.
    const res = await this.redis.set(`jobcnt:${jobId}`, '1', 'EX', JOB_TTL_SECONDS, 'NX');
    if (res !== 'OK') return null;
    return (await this.redis.get(`jobdev:${jobId}`)) ?? null;
  }
}

// ── Backend selection ───────────────────────────────────────────────────────
let backend: UsageBackend;
const REDIS_URL = process.env.REDIS_URL || '';
if (REDIS_URL) {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
  redis.on('error', (e) => console.warn('[usage] Redis error:', e?.message));
  backend = new RedisBackend(redis);
  console.log('[usage] using Redis backend');
} else {
  backend = new MemoryBackend();
  console.log('[usage] using in-memory backend (set REDIS_URL for persistence)');
}

// ── Public API (async) ──────────────────────────────────────────────────────
export async function getUsedSeconds(deviceId: string): Promise<number> {
  if (!deviceId) return 0;
  try {
    return await backend.getUsedSeconds(deviceId);
  } catch (e: any) {
    console.warn('[usage] getUsedSeconds failed:', e?.message);
    return 0;
  }
}

export async function addSeconds(deviceId: string, seconds: number): Promise<void> {
  if (!deviceId) return;
  try {
    await backend.addSeconds(deviceId, seconds);
  } catch (e: any) {
    console.warn('[usage] addSeconds failed:', e?.message);
  }
}

export async function isOverFreeLimit(deviceId: string): Promise<boolean> {
  return (await getUsedSeconds(deviceId)) >= FREE_MONTHLY_SECONDS;
}

export async function linkJob(jobId: string, deviceId: string): Promise<void> {
  try {
    await backend.linkJob(jobId, deviceId);
  } catch (e: any) {
    console.warn('[usage] linkJob failed:', e?.message);
  }
}

/** Meter a completed job exactly once. */
export async function countJobOnce(jobId: string, seconds: number): Promise<void> {
  try {
    const deviceId = await backend.claimJob(jobId);
    if (deviceId) await addSeconds(deviceId, seconds);
  } catch (e: any) {
    console.warn('[usage] countJobOnce failed:', e?.message);
  }
}

// ── Premium verification via RevenueCat ─────────────────────────────────────
const RC_KEY = process.env.REVENUECAT_SECRET_KEY || '';
const ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID || 'premium';

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
    if (!ent.expires_date) return true;
    return new Date(ent.expires_date).getTime() > Date.now();
  } catch (err: any) {
    console.warn('[usage] RevenueCat check failed:', err?.response?.status ?? err?.message);
    return false;
  }
}

/** Decide whether to allow a transcription request. */
export async function enforce(deviceId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!enforcementEnabled()) return { allowed: true };
  if (!deviceId) return { allowed: true };
  if (!(await isOverFreeLimit(deviceId))) return { allowed: true };
  if (await isPremium(deviceId)) return { allowed: true };
  return { allowed: false, reason: 'free_quota_exceeded' };
}
