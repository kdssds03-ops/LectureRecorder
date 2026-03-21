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
  folderId?: string;  // optional: which folder this recording belongs to
  transcript?: string;
  summary?: string;
  translation?: string;
}

interface RecordingStore {
  recordings: RecordingMeta[];
  folders: Folder[];
  addRecording: (recording: RecordingMeta) => void;
  removeRecording: (id: string) => Promise<void>;
  updateRecording: (id: string, data: Partial<RecordingMeta>) => void;
  loadRecordings: () => Promise<void>;
  addFolder: (name: string) => void;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, newName: string) => void;
}

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  recordings: [],
  folders: [],

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
    const recData = await AsyncStorage.getItem('recordings');
    const folderData = await AsyncStorage.getItem('folders');
    set({
      recordings: recData ? JSON.parse(recData) : [],
      folders: folderData ? JSON.parse(folderData) : [],
    });
  },

  addFolder: (name) => {
    const newFolder: Folder = {
      id: Date.now().toString(),
      name: name.trim(),
      createdAt: Date.now(),
    };
    const updated = [...get().folders, newFolder];
    set({ folders: updated });
    AsyncStorage.setItem('folders', JSON.stringify(updated));
  },

  deleteFolder: (id) => {
    const updated = get().folders.filter((f) => f.id !== id);
    set({ folders: updated });
    AsyncStorage.setItem('folders', JSON.stringify(updated));
  },

  renameFolder: (id, newName) => {
    const updated = get().folders.map((f) =>
      f.id === id ? { ...f, name: newName.trim() } : f
    );
    set({ folders: updated });
    AsyncStorage.setItem('folders', JSON.stringify(updated));
  },
}));
