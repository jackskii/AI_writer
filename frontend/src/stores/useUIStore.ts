import { create } from 'zustand';
import type { LoreEntry } from '../types';

interface UIState {
  // Editor state
  isAutoSaving: boolean;
  lastSaveTime: Date | null;
  editorContent: string;
  
  // Loading states
  isLoading: boolean;
  loadingMessage: string;
  
  // AI states
  isAIChatLoading: boolean;
  isAIContinueLoading: boolean;
  isAISuggestLoading: boolean;
  isAISummaryLoading: boolean;
  
  // Modal states
  isCreateWorkModalOpen: boolean;
  isCreateChapterModalOpen: boolean;
  isLoreEntryModalOpen: boolean;
  selectedLoreEntry: LoreEntry | null;
  
  // Notifications
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: Date;
  }>;
  
  // Actions
  setAutoSaving: (saving: boolean) => void;
  setLastSaveTime: (time: Date | null) => void;
  setEditorContent: (content: string) => void;
  
  setLoading: (loading: boolean, message?: string) => void;
  
  setAIChatLoading: (loading: boolean) => void;
  setAIContinueLoading: (loading: boolean) => void;
  setAISuggestLoading: (loading: boolean) => void;
  setAISummaryLoading: (loading: boolean) => void;
  
  setCreateWorkModalOpen: (open: boolean) => void;
  setCreateChapterModalOpen: (open: boolean) => void;
  setLoreEntryModalOpen: (open: boolean, entry?: LoreEntry) => void;
  
  addNotification: (notification: Omit<UIState['notifications'][0], 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  // Initial state
  isAutoSaving: false,
  lastSaveTime: null,
  editorContent: '',
  
  isLoading: false,
  loadingMessage: '',
  
  isAIChatLoading: false,
  isAIContinueLoading: false,
  isAISuggestLoading: false,
  isAISummaryLoading: false,
  
  isCreateWorkModalOpen: false,
  isCreateChapterModalOpen: false,
  isLoreEntryModalOpen: false,
  selectedLoreEntry: null,
  
  notifications: [],
  
  // Actions
  setAutoSaving: (saving) => set({ isAutoSaving: saving }),
  setLastSaveTime: (time) => set({ lastSaveTime: time }),
  setEditorContent: (content) => set({ editorContent: content }),
  
  setLoading: (loading, message = '') => set({ 
    isLoading: loading, 
    loadingMessage: message 
  }),
  
  setAIChatLoading: (loading) => set({ isAIChatLoading: loading }),
  setAIContinueLoading: (loading) => set({ isAIContinueLoading: loading }),
  setAISuggestLoading: (loading) => set({ isAISuggestLoading: loading }),
  setAISummaryLoading: (loading) => set({ isAISummaryLoading: loading }),
  
  setCreateWorkModalOpen: (open) => set({ isCreateWorkModalOpen: open }),
  setCreateChapterModalOpen: (open) => set({ isCreateChapterModalOpen: open }),
  setLoreEntryModalOpen: (open, entry) => set({ 
    isLoreEntryModalOpen: open,
    selectedLoreEntry: entry || null
  }),
  
  addNotification: (notification) => {
    const id = Math.random().toString(36).substring(7);
    const newNotification = {
      ...notification,
      id,
      timestamp: new Date()
    };
    
    set((state) => ({
      notifications: [...state.notifications, newNotification]
    }));
    
    // Auto-remove notification after 5 seconds
    setTimeout(() => {
      get().removeNotification(id);
    }, 5000);
  },
  
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id)
  })),
  
  clearNotifications: () => set({ notifications: [] })
}));
