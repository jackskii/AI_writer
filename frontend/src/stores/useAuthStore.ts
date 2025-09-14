import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, authApi } from '../services/authApi';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      
      login: (user: User, token: string) => {
        set({ user, token, isAuthenticated: true });
      },
      
      logout: async () => {
        try {
          await authApi.logout();
        } catch (error) {
          console.error('Logout API call failed:', error);
        } finally {
          set({ user: null, token: null, isAuthenticated: false });
        }
      },
      
      updateUser: (user: User) => {
        set({ user });
      }
    }),
    {
      name: 'auth-storage',
    }
  )
);