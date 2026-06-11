import { create } from 'zustand';
import type { Work, Chapter, LoreEntry } from '../types';

interface WorkState {
  currentWork: Work | null;
  currentChapter: Chapter | null;
  loreEntries: Record<number, LoreEntry[]>;

  setCurrentWork: (work: Work | null) => void;
  setCurrentChapter: (chapter: Chapter | null) => void;
  updateChapter: (chapter: Chapter) => void;
  setLoreEntries: (workId: number, entries: LoreEntry[]) => void;
  clearAll: () => void;
}

export const useWorkStore = create<WorkState>()((set) => ({
  currentWork: null,
  currentChapter: null,
  loreEntries: {},

  setCurrentWork: (work) => set({ currentWork: work }),
  setCurrentChapter: (chapter) => set({ currentChapter: chapter }),

  updateChapter: (chapter) =>
    set((state) => ({
      currentChapter: state.currentChapter?.id === chapter.id ? chapter : state.currentChapter,
    })),

  setLoreEntries: (workId, entries) =>
    set((state) => ({
      loreEntries: { ...state.loreEntries, [workId]: entries },
    })),

  clearAll: () =>
    set({
      currentWork: null,
      currentChapter: null,
      loreEntries: {},
    }),
}));
