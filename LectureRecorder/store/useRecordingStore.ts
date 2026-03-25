import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface RecordingMeta {
  id: string;
  name: string;
  titleSource?: 'default' | 'ai' | 'user';
  uri: string;
  chunkUris?: string[];
  duration: number; // in milliseconds
  createdAt: number;
  folderId: string | null;  // which folder this recording belongs to
  transcript?: string;
  summary?: string;
  translation?: string;
  isSummarizing?: boolean;
}

interface RecordingStore {
  recordings: RecordingMeta[];
  addRecording: (recording: RecordingMeta) => void;
  removeRecording: (id: string) => Promise<void>;
  updateRecording: (id: string, data: Partial<RecordingMeta>) => void;
  moveToFolder: (recordingId: string, folderId: string | null) => void;
  loadRecordings: () => Promise<void>;
  fetchSummary: (recordingId: string) => Promise<void>;
  generateTitleFromText: (recordingId: string, text: string) => Promise<void>;
  _hasHydrated: boolean;
}

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  recordings: [],
  _hasHydrated: false,

  addRecording: (recording) => {
    const updated = [recording, ...get().recordings];
    set({ recordings: updated });
    AsyncStorage.setItem('recordings', JSON.stringify(updated));
  },

  removeRecording: async (id) => {
    const target = get().recordings.find((r) => r.id === id);

    if (target?.uri) {
      try {
        const info = await FileSystem.getInfoAsync(target.uri);
        if (info.exists) {
          await FileSystem.deleteAsync(target.uri, { idempotent: true });
        }
      } catch (err) {
        console.warn(`[store] Could not delete audio file for recording ${id}:`, err);
      }
    }

    const updated = get().recordings.filter((r) => r.id !== id);
    set({ recordings: updated });
    AsyncStorage.setItem('recordings', JSON.stringify(updated));
  },

  updateRecording: (id, data) => {
    const updated = get().recordings.map((r) => (r.id === id ? { ...r, ...data } : r));
    set({ recordings: updated });
    AsyncStorage.setItem('recordings', JSON.stringify(updated));
  },

  moveToFolder: (recordingId, folderId) => {
    const updated = get().recordings.map((r) =>
      r.id === recordingId ? { ...r, folderId } : r
    );
    set({ recordings: updated });
    AsyncStorage.setItem('recordings', JSON.stringify(updated));
  },

  loadRecordings: async () => {
    const recData = await AsyncStorage.getItem('recordings');
    set({
      recordings: recData ? JSON.parse(recData) : [],
      _hasHydrated: true,
    });
  },

  generateTitleFromText: async (recordingId: string, text: string) => {
    console.log(`[Diagnostic] generateTitleFromText triggered for recordingId: ${recordingId}`);
    const { recordings, updateRecording } = get();
    const recording = recordings.find(r => r.id === recordingId);
    
    // Only auto-generate if 'default' or 'ai'. Never overwrite 'user' titles.
    if (!recording) {
      console.log(`[Diagnostic] generateTitleFromText aborted: recording not found`);
      return;
    }
    if (recording.titleSource === 'user') {
      console.log(`[Diagnostic] generateTitleFromText aborted: titleSource is 'user'`);
      return;
    }

    try {
      console.log(`[Diagnostic] generateTitleFromText: calling generateRecordingTitle API`);
      const { generateRecordingTitle } = require('@/api/aiService');
      const newTitle = await generateRecordingTitle(text);
      console.log(`[Diagnostic] generateTitleFromText: API returned new title -> '${newTitle}'`);
      
      if (newTitle) {
        // Guard against race conditions: check state hasn't changed to 'user' during await!
        const currentRecording = get().recordings.find(r => r.id === recordingId);
        if (currentRecording && currentRecording.titleSource !== 'user') {
          console.log(`[Diagnostic] generateTitleFromText: committing title update to store`);
          updateRecording(recordingId, { name: newTitle, titleSource: 'ai' });
        } else {
          console.log(`[Diagnostic] generateTitleFromText aborted on response: user edited title while waiting`);
        }
      }
    } catch (e: any) {
      console.log(`[Diagnostic] generateTitleFromText API call failed: ${e?.message ?? String(e)}`);
      console.log('[store] generateTitleFromText failed, silent ignore:', e);
    }
  },

  fetchSummary: async (recordingId: string) => {
    const { recordings, updateRecording } = get();
    const recording = recordings.find(r => r.id === recordingId);
    
    if (!recording || !recording.transcript) return;

    // Set loading state
    updateRecording(recordingId, { isSummarizing: true });

    try {
      const { summarizeText } = require('@/api/aiService');
      const { summary, suggestedName } = await summarizeText(recording.transcript);
      
      const updates: Partial<RecordingMeta> = { 
        summary, 
        isSummarizing: false 
      };
      
      if (suggestedName && suggestedName.trim() !== '' && recording.titleSource !== 'user') {
        updates.name = suggestedName;
        updates.titleSource = 'ai';
      }
      
      updateRecording(recordingId, updates);

      // Fallback: If no suggestedName arrived natively, trigger the dedicated title flow
      if (!suggestedName && recording.titleSource !== 'user') {
        get().generateTitleFromText(recordingId, recording.transcript);
      }
    } catch (error) {
      updateRecording(recordingId, { isSummarizing: false });
      throw error;
    }
  },
}));
