import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type RecognitionLanguage = 'ko' | 'en' | 'zh' | 'auto';
export type AudioQuality = 'standard' | 'high';
export type SummaryLanguage = 'ko' | 'en' | 'zh';
export type TranslationLanguage = 'en' | 'ko' | 'ja' | 'zh' | 'es' | 'fr';

interface SettingsState {
  recognitionLanguage: RecognitionLanguage;
  audioQuality: AudioQuality;
  summaryLanguage: SummaryLanguage;
  translationLanguage: TranslationLanguage;
  _hasHydrated: boolean;
  
  setRecognitionLanguage: (lang: RecognitionLanguage) => void;
  setAudioQuality: (quality: AudioQuality) => void;
  setSummaryLanguage: (lang: SummaryLanguage) => void;
  setTranslationLanguage: (lang: TranslationLanguage) => void;
  setHasHydrated: (state: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      recognitionLanguage: 'ko',
      audioQuality: 'high',
      summaryLanguage: 'ko',
      translationLanguage: 'en',
      _hasHydrated: false,

      setRecognitionLanguage: (lang) => set({ recognitionLanguage: lang }),
      setAudioQuality: (quality) => set({ audioQuality: quality }),
      setSummaryLanguage: (lang) => set({ summaryLanguage: lang }),
      setTranslationLanguage: (lang) => set({ translationLanguage: lang }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'lecture-recorder-settings-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => {
        // Exclude _hasHydrated from being persisted so it always starts false on app launch
        const { _hasHydrated, ...persistedState } = state;
        return persistedState;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
        }
      },
    }
  )
);
