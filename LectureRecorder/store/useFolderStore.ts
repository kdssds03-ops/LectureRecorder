import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Folder {
  id: string;
  name: string;
  icon: string;
  color: string;
  createdAt: number;
}

interface FolderState {
  folders: Folder[];
  _hasHydrated: boolean;
  
  addFolder: (name: string, color?: string, icon?: string) => void;
  deleteFolder: (id: string) => void;
  updateFolder: (id: string, updates: Partial<Folder>) => void;
  setHasHydrated: (state: boolean) => void;
}

export const useFolderStore = create<FolderState>()(
  persist(
    (set, get) => ({
      folders: [],
      _hasHydrated: false,

      addFolder: (name, color = '#007AFF', icon = 'folder') => {
        const newFolder: Folder = {
          id: Math.random().toString(36).substring(2, 15), // Simple unique ID generator fallback
          name: name.trim(),
          icon,
          color,
          createdAt: Date.now(),
        };
        set({ folders: [...get().folders, newFolder] });
      },

      deleteFolder: (id) => {
        set({ folders: get().folders.filter((f) => f.id !== id) });
      },

      updateFolder: (id, updates) => {
        set({
          folders: get().folders.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
        });
      },

      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'lecture-recorder-folders-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => {
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
