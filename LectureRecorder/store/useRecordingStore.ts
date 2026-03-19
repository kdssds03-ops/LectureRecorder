import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  removeRecording: (id: string) => void;
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
  removeRecording: (id) => {
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
