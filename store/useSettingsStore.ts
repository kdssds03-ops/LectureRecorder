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
  diarizationEnabled: boolean;
  summaryLanguage: SummaryLanguage;
  translationLanguage: TranslationLanguage;
  // User-editable extra summary instructions, keyed by lecture type ('general', 'math', …).
  summaryTemplates: Record<string, string>;
  _hasHydrated: boolean;

  setRecognitionLanguage: (lang: RecognitionLanguage) => void;
  setAudioQuality: (quality: AudioQuality) => void;
  setDiarizationEnabled: (value: boolean) => void;
  setSummaryLanguage: (lang: SummaryLanguage) => void;
  setTranslationLanguage: (lang: TranslationLanguage) => void;
  setSummaryTemplate: (lectureType: string, instruction: string) => void;
  setHasHydrated: (state: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      recognitionLanguage: 'ko',
      audioQuality: 'high',
      diarizationEnabled: false,
      summaryLanguage: 'ko',
      translationLanguage: 'en',
      summaryTemplates: {},
      _hasHydrated: false,

      setRecognitionLanguage: (lang) => set({ recognitionLanguage: lang }),
      setAudioQuality: (quality) => set({ audioQuality: quality }),
      setDiarizationEnabled: (value) => set({ diarizationEnabled: value }),
      setSummaryLanguage: (lang) => set({ summaryLanguage: lang }),
      setTranslationLanguage: (lang) => set({ translationLanguage: lang }),
      setSummaryTemplate: (lectureType, instruction) =>
        set((s) => ({ summaryTemplates: { ...s.summaryTemplates, [lectureType]: instruction } })),
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
