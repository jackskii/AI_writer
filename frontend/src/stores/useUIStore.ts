import { create } from 'zustand';

interface UIState {
  isAutoSaving: boolean;
  lastSaveTime: Date | null;
  theme: 'dark' | 'light';
  isAISuggestLoading: boolean;
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: Date;
  }>;

  setAutoSaving: (saving: boolean) => void;
  setLastSaveTime: (time: Date | null) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setAISuggestLoading: (loading: boolean) => void;
  addNotification: (notification: Omit<UIState['notifications'][0], 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

const applyTheme = (theme: 'dark' | 'light') => {
  document.documentElement.setAttribute('data-theme', theme);
};

const getInitialTheme = (): 'dark' | 'light' => {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') {
    applyTheme(stored);
    return stored;
  }
  applyTheme('dark');
  return 'dark';
};

export const useUIStore = create<UIState>((set, get) => ({
  isAutoSaving: false,
  lastSaveTime: null,
  theme: getInitialTheme(),
  isAISuggestLoading: false,
  notifications: [],

  setAutoSaving: (saving) => set({ isAutoSaving: saving }),
  setLastSaveTime: (time) => set({ lastSaveTime: time }),

  setTheme: (theme) => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
    set({ theme });
  },

  setAISuggestLoading: (loading) => set({ isAISuggestLoading: loading }),

  addNotification: (notification) => {
    const id = Math.random().toString(36).substring(7);
    const newNotification = {
      ...notification,
      id,
      timestamp: new Date(),
    };

    set((state) => ({
      notifications: [...state.notifications, newNotification],
    }));

    setTimeout(() => {
      get().removeNotification(id);
    }, 5000);
  },

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () => set({ notifications: [] }),
}));
