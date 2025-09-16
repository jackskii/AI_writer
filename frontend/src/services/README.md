# Services Layer Documentation

API communication layer with automatic authentication, streaming support, and comprehensive error handling.

## Overview

The services layer provides a clean abstraction over HTTP and WebSocket communication with the backend, including:
- Axios-based HTTP client with automatic token injection
- Server-Sent Events (SSE) for AI streaming
- WebSocket clients for real-time features
- Comprehensive error handling and fallbacks

## Core API Service

**File**: `frontend/src/services/api.ts`

### Axios Configuration
```typescript
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});
```

### Authentication Interceptors
```typescript
// Request interceptor - Add auth token to all requests
api.interceptors.request.use(
  (config) => {
    // Get token from Zustand persist storage
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const parsedStorage = JSON.parse(authStorage);
        const token = parsedStorage?.state?.token;
        if (token) {
          config.headers.Authorization = `Token ${token}`;
        }
      } catch (e) {
        console.error('Failed to parse auth storage:', e);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle 401 errors with automatic logout
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth state and redirect to login
      localStorage.removeItem('auth-storage');
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);
```

## API Service Modules

### Works API
```typescript
export const worksApi = {
  list: () => api.get<{ results: Work[]; count: number; next?: string; previous?: string }>('/works/'),
  get: (id: number) => api.get<Work>(`/works/${id}/`),
  create: (data: Partial<Work>) => api.post<Work>('/works/', data),
  update: (id: number, data: Partial<Work>) => api.patch<Work>(`/works/${id}/`, data),
  delete: (id: number) => api.delete(`/works/${id}/`),
};
```

### Chapters API
```typescript
export const chaptersApi = {
  list: (workId: number) => api.get<Chapter[]>(`/works/${workId}/chapters/`),
  get: (workId: number, id: number) => api.get<Chapter>(`/works/${workId}/chapters/${id}/`),
  create: (workId: number, data: Partial<Chapter>) =>
    api.post<Chapter>(`/works/${workId}/chapters/`, data),
  update: (workId: number, id: number, data: Partial<Chapter>) =>
    api.patch<Chapter>(`/works/${workId}/chapters/${id}/`, data),
  delete: (workId: number, id: number) => api.delete(`/works/${workId}/chapters/${id}/`),
  autoSave: (workId: number, id: number, content: string) =>
    api.patch(`/works/${workId}/chapters/${id}/autosave/`, { content }),
  generateSummary: (workId: number, id: number) =>
    api.post<{ summary: string }>(`/works/${workId}/chapters/${id}/summary/`),
};
```

### Notes API
```typescript
export const notesApi = {
  list: (workId?: number, chapterId?: number) => {
    let url = '/notes/';
    const params = new URLSearchParams();
    if (workId) params.append('work', workId.toString());
    if (chapterId) params.append('chapter', chapterId.toString());
    if (params.toString()) url += `?${params.toString()}`;
    return api.get<Note[]>(url);
  },
  create: (data: Partial<Note>) => api.post<Note>('/notes/', data),
  update: (id: number, data: Partial<Note>) => api.patch<Note>(`/notes/${id}/`, data),
  delete: (id: number) => api.delete(`/notes/${id}/`),
};
```

### Chat API
```typescript
export const chatApi = {
  getHistory: (workId: number, chapterId: number) =>
    api.get<{ session_id: string; messages: any[] }>(`/chat/${workId}/${chapterId}/`),

  saveMessage: (workId: number, chapterId: number, role: string, content: string) =>
    api.post<{ id: string; role: string; content: string; timestamp: string }>(`/chat/${workId}/${chapterId}/save/`, {
      role,
      content,
    }),

  clearHistory: (workId: number, chapterId: number) =>
    api.delete(`/chat/${workId}/${chapterId}/clear/`),
};
```

## AI Services with Streaming

### Streaming Implementation Pattern
All AI services follow the same streaming pattern with HTTP fallbacks:

```typescript
// Example: Chat streaming
chatStream: (
  workId: number,
  chapterId: number,
  message: string,
  onChunk: (chunk: string) => void,
  onStart?: () => void,
  onEnd?: (fullResponse: string) => void,
  onError?: (error: string) => void
) => {
  const params = new URLSearchParams({
    work_id: workId.toString(),
    chapter_id: chapterId.toString(),
    message: message,
  });

  // Add token for authentication since EventSource can't send headers
  const authStorage = localStorage.getItem('auth-storage');
  if (authStorage) {
    try {
      const parsedStorage = JSON.parse(authStorage);
      const token = parsedStorage?.state?.token;
      if (token) {
        params.append('token', token);
      }
    } catch (e) {
      console.error('Failed to parse auth storage:', e);
    }
  }

  const eventSource = new EventSource(
    `${API_BASE_URL}/ai/chat/stream/?${params.toString()}`,
    { withCredentials: true }
  );

  let fullResponse = '';

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'start':
          console.log('Chat streaming started');
          onStart?.();
          break;
        case 'chunk':
          fullResponse += data.content;
          onChunk(data.content);
          break;
        case 'end':
          console.log('Chat streaming completed');
          onEnd?.(fullResponse);
          eventSource.close();
          break;
        case 'error':
          onError?.(data.message);
          eventSource.close();
          break;
      }
    } catch (error) {
      console.error('Error parsing chat SSE data:', error);
      onError?.('Error parsing server response');
      eventSource.close();
    }
  };

  eventSource.onerror = (error) => {
    console.error('Chat EventSource error:', error);
    onError?.('Connection error occurred');
    eventSource.close();
  };

  // Return the EventSource so it can be closed manually if needed
  return eventSource;
}
```

### AI Service Endpoints

#### Continue Writing
```typescript
// HTTP version (fallback)
continue: (workId: number, chapterId: number, guide?: string, content?: string, tokenCount?: number) =>
  api.post<{ content: string }>('/ai/continue/', {
    work_id: workId,
    chapter_id: chapterId,
    guide,
    content,
    token_count: tokenCount,
  }),

// Streaming version (primary)
continueStream: (
  workId: number,
  chapterId: number,
  onChunk: (chunk: string) => void,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (error: string) => void,
  guide?: string,
  content?: string,
  tokenCount?: number
) => {
  const params = new URLSearchParams({
    work_id: workId.toString(),
    chapter_id: chapterId.toString(),
  });

  if (guide) params.append('guide', guide);
  if (content) params.append('content', content);
  if (tokenCount) params.append('token_count', tokenCount.toString());

  // Add authentication token
  const authStorage = localStorage.getItem('auth-storage');
  if (authStorage) {
    const parsedStorage = JSON.parse(authStorage);
    const token = parsedStorage?.state?.token;
    if (token) params.append('token', token);
  }

  const eventSource = new EventSource(
    `${API_BASE_URL}/ai/continue/stream/?${params.toString()}`,
    { withCredentials: true }
  );

  // Standard SSE message handling...
  return eventSource;
}
```

#### Suggestions
```typescript
suggest: (workId: number, chapterId: number, targetText?: string) =>
  api.post<{ suggestions: any[] }>('/ai/suggest/', {
    work_id: workId,
    chapter_id: chapterId,
    target_text: targetText,
  }),
```

#### Summarization
```typescript
// HTTP version
summarize: (workId: number, chapterId: number) =>
  api.post<{ summary: string }>('/ai/summarize/', {
    work_id: workId,
    chapter_id: chapterId,
  }),

// Streaming version
summarizeStream: (
  workId: number,
  chapterId: number,
  onChunk: (chunk: string) => void,
  onStart?: () => void,
  onEnd?: (summary: string) => void,
  onError?: (error: string) => void
) => {
  // Similar streaming implementation
}
```

## WebSocket Services

### Chat WebSocket
```typescript
export class ChatWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private maxReconnectAttempts = 5;
  private reconnectAttempts = 0;

  constructor(workId: number, chapterId: number) {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.VITE_WS_HOST || 'localhost:8001';
    this.url = `${wsProtocol}//${wsHost}/ws/chat/${workId}/${chapterId}/`;
  }

  connect(onMessage: (message: any) => void, onError?: (error: any) => void) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WebSocket连接已建立');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('WebSocket消息解析错误:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket错误:', error);
      onError?.(error);
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket连接已关闭', event.code, event.reason);
      this.attemptReconnect(onMessage, onError);
    };
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket连接未建立，无法发送消息');
    }
  }

  sendChatMessage(message: string) {
    this.send({
      type: 'chat',
      message: message
    });
  }

  sendTypingIndicator(isTyping: boolean) {
    this.send({
      type: 'typing',
      is_typing: isTyping
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.reconnectAttempts = 0;
  }
}
```

### Notifications WebSocket
```typescript
export class NotificationWebSocket {
  private ws: WebSocket | null = null;
  private url: string;

  constructor(workId: number) {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.VITE_WS_HOST || 'localhost:8001';
    this.url = `${wsProtocol}//${wsHost}/ws/notifications/${workId}/`;
  }

  connect(onNotification: (notification: any) => void) {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('通知WebSocket连接已建立');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onNotification(data);
      } catch (error) {
        console.error('通知消息解析错误:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('通知WebSocket错误:', error);
    };

    this.ws.onclose = () => {
      console.log('通知WebSocket连接已关闭');
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

## Authentication Service

**File**: `frontend/src/services/authApi.ts`

```typescript
import { api } from './api';

interface LoginCredentials {
  username: string;
  password: string;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

interface AuthResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
  };
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<{ data: AuthResponse }> => {
    const response = await api.post('/auth/login/', credentials);
    return response;
  },

  register: async (userData: RegisterData): Promise<{ data: AuthResponse }> => {
    const response = await api.post('/auth/register/', userData);
    return response;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout/');
  },

  getCurrentUser: async (): Promise<{ data: User }> => {
    const response = await api.get('/auth/user/');
    return response;
  }
};
```

## Error Handling

### API Error Types
```typescript
interface APIError {
  message: string;
  status: number;
  details?: Record<string, string[]>;
}

export const handleAPIError = (error: any): APIError => {
  if (error.response) {
    // Server responded with error status
    return {
      message: error.response.data?.error || 'Server error occurred',
      status: error.response.status,
      details: error.response.data?.details
    };
  } else if (error.request) {
    // Network error
    return {
      message: 'Network error - please check your connection',
      status: 0
    };
  } else {
    // Request setup error
    return {
      message: error.message || 'Unknown error occurred',
      status: -1
    };
  }
};
```

### Retry Logic
```typescript
export const apiWithRetry = async <T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      // Don't retry authentication errors
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw error;
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  throw new Error('Max retries exceeded');
};
```

## Usage Patterns

### React Query Integration
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Fetch works list
const { data: works, isLoading, error } = useQuery({
  queryKey: ['works'],
  queryFn: () => worksApi.list(),
});

// Create work mutation
const createWorkMutation = useMutation({
  mutationFn: (workData: Partial<Work>) => worksApi.create(workData),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['works'] });
  },
});

// Streaming usage
const handleContinueWriting = () => {
  const eventSource = aiApi.continueStream(
    workId,
    chapterId,
    (chunk) => setContent(prev => prev + chunk),
    () => setIsStreaming(true),
    () => setIsStreaming(false),
    (error) => console.error('Streaming error:', error),
    guide,
    content,
    tokenCount
  );

  // Store reference for cleanup
  setStreamEventSource(eventSource);
};
```

### Error Handling in Components
```typescript
const ComponentWithErrorHandling = () => {
  const [error, setError] = useState<string | null>(null);

  const handleApiCall = async () => {
    try {
      await worksApi.create(workData);
      setError(null);
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);

      if (apiError.status === 401) {
        // Redirect to login (handled by interceptor)
      } else if (apiError.status === 429) {
        // Rate limited
        setError('Too many requests. Please wait and try again.');
      }
    }
  };

  return (
    <div>
      {error && <div className="error-message">{error}</div>}
      {/* Component content */}
    </div>
  );
};
```

## Development & Testing

### Mock Services for Testing
```typescript
// Mock API for testing
export const mockApi = {
  works: {
    list: jest.fn().mockResolvedValue({ data: { results: [] } }),
    create: jest.fn().mockResolvedValue({ data: { id: 1 } }),
  },
  chapters: {
    list: jest.fn().mockResolvedValue({ data: [] }),
  },
};

// Use in tests
jest.mock('../services/api', () => ({
  worksApi: mockApi.works,
  chaptersApi: mockApi.chapters,
}));
```

### Debugging Network Issues
```typescript
// Add request/response logging
api.interceptors.request.use(config => {
  console.log('API Request:', {
    method: config.method,
    url: config.url,
    data: config.data
  });
  return config;
});

api.interceptors.response.use(
  response => {
    console.log('API Response:', {
      status: response.status,
      url: response.config.url,
      data: response.data
    });
    return response;
  },
  error => {
    console.error('API Error:', {
      status: error.response?.status,
      message: error.message,
      url: error.config?.url
    });
    return Promise.reject(error);
  }
);
```

The services layer provides a robust foundation for all API communication with comprehensive error handling, automatic authentication, and streaming support for AI features.