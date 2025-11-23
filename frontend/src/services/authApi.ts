import axios from 'axios';

// Create a separate axios instance for auth requests
const authAxios = axios.create();

// Helper function to get token from storage
const getTokenFromStorage = (): string | null => {
  const authStorage = localStorage.getItem('auth-storage');
  if (authStorage) {
    try {
      const parsedStorage = JSON.parse(authStorage);
      return parsedStorage?.state?.token || null;
    } catch (e) {
      console.error('Failed to parse auth storage:', e);
    }
  }
  return null;
};

// Add auth token interceptor for auth API
authAxios.interceptors.request.use(
  (config) => {
    const token = getTokenFromStorage();
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

const API_BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://127.0.0.1:8001';

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: string;
  works_count: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  first_name?: string;
  last_name?: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export const authApi = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await authAxios.post(`${API_BASE_URL}/api/auth/login/`, data);
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await authAxios.post(`${API_BASE_URL}/api/auth/register/`, data);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await authAxios.post(`${API_BASE_URL}/api/auth/logout/`, {});
  },

  getProfile: async (): Promise<User> => {
    const response = await authAxios.get(`${API_BASE_URL}/api/auth/profile/`);
    return response.data;
  },

  updateProfile: async (data: Partial<User>): Promise<User> => {
    const response = await authAxios.put(`${API_BASE_URL}/api/auth/profile/update/`, data);
    return response.data;
  },

  getSettings: async (): Promise<UserSettings> => {
    const response = await authAxios.get(`${API_BASE_URL}/api/auth/settings/`);
    return response.data;
  },

  updateSettings: async (data: { deepseek_api_key?: string }): Promise<{ message: string; data: UserSettings }> => {
    const response = await authAxios.put(`${API_BASE_URL}/api/auth/settings/update/`, data);
    return response.data;
  }
};

export interface UserSettings {
  masked_api_key: string;
  has_api_key: boolean;
  updated_at: string;
}