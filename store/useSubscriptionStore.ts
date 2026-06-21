import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Number of AI actions (transcription / summary / translation / quiz) a free
// user may run per calendar month. Premium subscribers are unlimited.
export const FREE_MONTHLY_CREDITS = 30;

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface SubscriptionState {
  isPremium: boolean;
  usageMonth: string;
  aiCreditsUsed: number;
  _hasHydrated: boolean;

  setPremium: (value: boolean) => void;
  /** Returns true if a free user still has credits, or the user is premium. */
  canUseAi: () => boolean;
  /** Remaining free credits this month (Infinity for premium). */
  getRemaining: () => number;
  /** Records one consumed AI action. No-op for premium users. */
  consumeCredit: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      isPremium: false,
      usageMonth: currentMonth(),
      aiCreditsUsed: 0,
      _hasHydrated: false,

      setPremium: (value) => set({ isPremium: value }),

      canUseAi: () => {
        const { isPremium, usageMonth, aiCreditsUsed } = get();
        if (isPremium) return true;
        // New month → the stored count is stale; treat as reset.
        if (usageMonth !== currentMonth()) return true;
        return aiCreditsUsed < FREE_MONTHLY_CREDITS;
      },

      getRemaining: () => {
        const { isPremium, usageMonth, aiCreditsUsed } = get();
        if (isPremium) return Infinity;
        if (usageMonth !== currentMonth()) return FREE_MONTHLY_CREDITS;
        return Math.max(0, FREE_MONTHLY_CREDITS - aiCreditsUsed);
      },

      consumeCredit: () => {
        const { isPremium } = get();
        if (isPremium) return;
        const month = currentMonth();
        set((s) =>
          s.usageMonth === month
            ? { aiCreditsUsed: s.aiCreditsUsed + 1 }
            : { usageMonth: month, aiCreditsUsed: 1 }
        );
      },

      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'nokkang-subscription-v1',
      version: 1,
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
