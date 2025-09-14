import { create } from 'zustand';
import type { Work, Chapter, LoreEntry, Note } from '../types';

interface WorkState {
  // 当前状态
  currentWork: Work | null;
  currentChapter: Chapter | null;
  
  // 数据缓存
  works: Work[];
  chapters: Record<number, Chapter[]>; // workId -> chapters
  loreEntries: Record<number, LoreEntry[]>; // workId -> lore entries
  notes: Record<string, Note[]>; // `${workId}-${chapterId}` -> notes
  
  // Actions
  setCurrentWork: (work: Work | null) => void;
  setCurrentChapter: (chapter: Chapter | null) => void;
  
  // Works
  setWorks: (works: Work[]) => void;
  addWork: (work: Work) => void;
  updateWork: (work: Work) => void;
  removeWork: (workId: number) => void;
  
  // Chapters
  setChapters: (workId: number, chapters: Chapter[]) => void;
  addChapter: (workId: number, chapter: Chapter) => void;
  updateChapter: (chapter: Chapter) => void;
  removeChapter: (workId: number, chapterId: number) => void;
  
  // Lore entries
  setLoreEntries: (workId: number, entries: LoreEntry[]) => void;
  addLoreEntry: (workId: number, entry: LoreEntry) => void;
  updateLoreEntry: (entry: LoreEntry) => void;
  removeLoreEntry: (workId: number, entryId: number) => void;
  
  // Notes
  setNotes: (key: string, notes: Note[]) => void;
  addNote: (workId: number, chapterId: number | undefined, note: Note) => void;
  updateNote: (workId: number, chapterId: number | undefined, note: Note) => void;
  removeNote: (workId: number, chapterId: number | undefined, noteId: number) => void;
  
  // Utilities
  clearAll: () => void;
}

export const useWorkStore = create<WorkState>()((set, get) => ({
      // Initial state
      currentWork: null,
      currentChapter: null,
      works: [],
      chapters: {},
      loreEntries: {},
      notes: {},

      // Actions
      setCurrentWork: (work) => set({ currentWork: work }),
      setCurrentChapter: (chapter) => set({ currentChapter: chapter }),

      // Works
      setWorks: (works) => set({ works }),
      addWork: (work) => set((state) => ({ works: [...state.works, work] })),
      updateWork: (work) => set((state) => ({
        works: state.works.map(w => w.id === work.id ? work : w),
        currentWork: state.currentWork?.id === work.id ? work : state.currentWork
      })),
      removeWork: (workId) => set((state) => {
        const newState = {
          works: state.works.filter(w => w.id !== workId),
          chapters: { ...state.chapters },
          loreEntries: { ...state.loreEntries },
          notes: { ...state.notes }
        };
        
        // Clean up related data
        delete newState.chapters[workId];
        delete newState.loreEntries[workId];
        
        // Clean up notes
        Object.keys(newState.notes).forEach(key => {
          if (key.startsWith(`${workId}-`)) {
            delete newState.notes[key];
          }
        });
        
        return {
          ...newState,
          currentWork: state.currentWork?.id === workId ? null : state.currentWork,
          currentChapter: state.currentChapter?.work === workId ? null : state.currentChapter
        };
      }),

      // Chapters
      setChapters: (workId, chapters) => set((state) => ({
        chapters: { ...state.chapters, [workId]: chapters }
      })),
      addChapter: (workId, chapter) => set((state) => ({
        chapters: {
          ...state.chapters,
          [workId]: [...(state.chapters[workId] || []), chapter]
        }
      })),
      updateChapter: (chapter) => set((state) => {
        const workId = chapter.work;
        return {
          chapters: {
            ...state.chapters,
            [workId]: (state.chapters[workId] || []).map(c => 
              c.id === chapter.id ? chapter : c
            )
          },
          currentChapter: state.currentChapter?.id === chapter.id ? chapter : state.currentChapter
        };
      }),
      removeChapter: (workId, chapterId) => set((state) => ({
        chapters: {
          ...state.chapters,
          [workId]: (state.chapters[workId] || []).filter(c => c.id !== chapterId)
        },
        currentChapter: state.currentChapter?.id === chapterId ? null : state.currentChapter
      })),

      // Lore entries
      setLoreEntries: (workId, entries) => set((state) => ({
        loreEntries: { ...state.loreEntries, [workId]: entries }
      })),
      addLoreEntry: (workId, entry) => set((state) => ({
        loreEntries: {
          ...state.loreEntries,
          [workId]: [...(state.loreEntries[workId] || []), entry]
        }
      })),
      updateLoreEntry: (entry) => set((state) => {
        const workId = entry.work;
        return {
          loreEntries: {
            ...state.loreEntries,
            [workId]: (state.loreEntries[workId] || []).map(e => 
              e.id === entry.id ? entry : e
            )
          }
        };
      }),
      removeLoreEntry: (workId, entryId) => set((state) => ({
        loreEntries: {
          ...state.loreEntries,
          [workId]: (state.loreEntries[workId] || []).filter(e => e.id !== entryId)
        }
      })),

      // Notes
      setNotes: (key, notes) => set((state) => ({
        notes: { ...state.notes, [key]: notes }
      })),
      addNote: (workId, chapterId, note) => set((state) => {
        const key = chapterId ? `${workId}-${chapterId}` : `${workId}`;
        return {
          notes: {
            ...state.notes,
            [key]: [...(state.notes[key] || []), note]
          }
        };
      }),
      updateNote: (workId, chapterId, note) => set((state) => {
        const key = chapterId ? `${workId}-${chapterId}` : `${workId}`;
        return {
          notes: {
            ...state.notes,
            [key]: (state.notes[key] || []).map(n => n.id === note.id ? note : n)
          }
        };
      }),
      removeNote: (workId, chapterId, noteId) => set((state) => {
        const key = chapterId ? `${workId}-${chapterId}` : `${workId}`;
        return {
          notes: {
            ...state.notes,
            [key]: (state.notes[key] || []).filter(n => n.id !== noteId)
          }
        };
      }),

      // Utilities
      clearAll: () => set({
        currentWork: null,
        currentChapter: null,
        works: [],
        chapters: {},
        loreEntries: {},
        notes: {}
      })
    }));