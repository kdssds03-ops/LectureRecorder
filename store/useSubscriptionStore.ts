import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The dominant cost is speech-to-text, which is billed per audio minute.
// So the free tier is metered in MINUTES of transcribed audio per month.
// GPT features (summary/translation/quiz/chat) are cheap and not metered.
export const FREE_MONTHLY_MINUTES = 120;
const FREE_MONTHLY_SECONDS = FREE_MONTHLY_MINUTES * 60;

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface SubscriptionState {
  isPremium: boolean;
  usageMonth: string;
  usedSeconds: number;
  _hasHydrated: boolean;

  setPremium: (value: boolean) => void;
  /** Whether the user may transcribe more audio this month. */
  canTranscribe: () => boolean;
  /** Remaining free minutes this month (Infinity for premium). */
  getRemainingMinutes: () => number;
  /** Record consumed transcription seconds. No-op for premium. */
  consumeSeconds: (seconds: number) => void;
  setHasHydrated: (state: boolean) => void;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      isPremium: false,
      usageMonth: currentMonth(),
      usedSeconds: 0,
      _hasHydrated: false,

      setPremium: (value) => set({ isPremium: value }),

      canTranscribe: () => {
        const { isPremium, usageMonth, usedSeconds } = get();
        if (isPremium) return true;
        if (usageMonth !== currentMonth()) return true; // new month → reset
        return usedSeconds < FREE_MONTHLY_SECONDS;
      },

      getRemainingMinutes: () => {
        const { isPremium, usageMonth, usedSeconds } = get();
        if (isPremium) return Infinity;
        const used = usageMonth === currentMonth() ? usedSeconds : 0;
        return Math.max(0, Math.ceil((FREE_MONTHLY_SECONDS - used) / 60));
      },

      consumeSeconds: (seconds) => {
        if (get().isPremium) return;
        const month = currentMonth();
        const add = Math.max(0, Math.round(seconds));
        set((s) =>
          s.usageMonth === month
            ? { usedSeconds: s.usedSeconds + add }
            : { usageMonth: month, usedSeconds: add }
        );
      },

      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'nokkang-subscription-v2',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => {
        const { _hasHydrated, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
