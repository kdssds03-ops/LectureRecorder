import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export interface RecordingMeta {
  id: string;
  name: string;
  uri: string;
  duration: number; // in milliseconds
  createdAt: number;
  transcript?: string;
  summary?: string;
  translation?: string;
}

interface RecordingStore {
  recordings: RecordingMeta[];
  addRecording: (recording: RecordingMeta) => void;
  removeRecording: (id: string) => Promise<void>;
  updateRecording: (id: string, data: Partial<RecordingMeta>) => void;
  loadRecordings: () => Promise<void>;
}

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  recordings: [],

  addRecording: (recording) => {
    const updated = [recording, ...get().recordings];
    set({ recordings: updated });
    AsyncStorage.setItem('recordings', JSON.stringify(updated));
  },

  removeRecording: async (id) => {
    const target = get().recordings.find((r) => r.id === id);

    // Attempt to delete the local audio file first.
    // Failure is logged but never blocks the store removal.
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

  loadRecordings: async () => {
    const data = await AsyncStorage.getItem('recordings');
    if (data) {
      set({ recordings: JSON.parse(data) });
    }
  },
}));
