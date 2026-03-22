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
  uri: string;
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
      
      if (suggestedName && suggestedName.trim() !== '') {
        updates.name = suggestedName;
      }
      
      updateRecording(recordingId, updates);
    } catch (error) {
      updateRecording(recordingId, { isSummarizing: false });
      throw error;
    }
  },
}));
