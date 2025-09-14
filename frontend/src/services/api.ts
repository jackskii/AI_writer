import axios from 'axios';
import type { Work, Act, Chapter, LoreEntry, Note, ChatMessage, AIContext } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// 作品相关 API
export const worksApi = {
  list: () => api.get<Work[]>('/works/'),
  get: (id: number) => api.get<Work>(`/works/${id}/`),
  create: (data: Partial<Work>) => api.post<Work>('/works/', data),
  update: (id: number, data: Partial<Work>) => api.patch<Work>(`/works/${id}/`, data),
  delete: (id: number) => api.delete(`/works/${id}/`),
};

// 章节相关 API
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

// 卷相关 API
export const actsApi = {
  list: (workId: number) => api.get<Act[]>(`/works/${workId}/acts/`),
  get: (workId: number, id: number) => api.get<Act>(`/works/${workId}/acts/${id}/`),
  create: (workId: number, data: Partial<Act>) => 
    api.post<Act>(`/works/${workId}/acts/`, data),
  update: (workId: number, id: number, data: Partial<Act>) => 
    api.patch<Act>(`/works/${workId}/acts/${id}/`, data),
  delete: (workId: number, id: number) => api.delete(`/works/${workId}/acts/${id}/`),
};

// 世界观条目相关 API
export const loreApi = {
  list: (workId: number) => api.get<LoreEntry[]>(`/works/${workId}/lore/`),
  get: (workId: number, id: number) => api.get<LoreEntry>(`/works/${workId}/lore/${id}/`),
  create: (workId: number, data: Partial<LoreEntry>) => 
    api.post<LoreEntry>(`/works/${workId}/lore/`, data),
  update: (workId: number, id: number, data: Partial<LoreEntry>) => 
    api.patch<LoreEntry>(`/works/${workId}/lore/${id}/`, data),
  delete: (workId: number, id: number) => api.delete(`/works/${workId}/lore/${id}/`),
};

// 笔记相关 API
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

// AI 服务相关 API
export const aiApi = {
  chat: (workId: number, chapterId: number, message: string) =>
    api.post<{ response: string }>('/ai/chat/', {
      work_id: workId,
      chapter_id: chapterId,
      message,
    }),
  
  continue: (workId: number, chapterId: number, guide?: string, content?: string, tokenCount?: number) =>
    api.post<{ content: string }>('/ai/continue/', {
      work_id: workId,
      chapter_id: chapterId,
      guide,
      content,
      token_count: tokenCount,
    }),
  
  suggest: (workId: number, chapterId: number, targetText?: string) =>
    api.post<{ suggestions: any[] }>('/ai/suggest/', {
      work_id: workId,
      chapter_id: chapterId,
      target_text: targetText,
    }),
  
  summarize: (workId: number, chapterId: number) =>
    api.post<{ summary: string }>('/ai/summarize/', {
      work_id: workId,
      chapter_id: chapterId,
    }),

  // Streaming version of continue writing
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

    const eventSource = new EventSource(`${API_BASE_URL}/ai/continue/stream/?${params.toString()}`, {
      withCredentials: true
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'start':
            onStart?.();
            break;
          case 'chunk':
            onChunk(data.content);
            break;
          case 'end':
            onEnd?.();
            eventSource.close();
            break;
          case 'error':
            onError?.(data.message);
            eventSource.close();
            break;
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
        onError?.('Error parsing server response');
        eventSource.close();
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      onError?.('Connection error occurred');
      eventSource.close();
    };

    // Return the EventSource so it can be closed manually if needed
    return eventSource;
  },

  // Streaming version of summarize
  summarizeStream: (
    workId: number, 
    chapterId: number, 
    onChunk: (chunk: string) => void,
    onStart?: () => void,
    onEnd?: (summary: string) => void,
    onError?: (error: string) => void
  ) => {
    const params = new URLSearchParams({
      work_id: workId.toString(),
      chapter_id: chapterId.toString(),
    });

    const url = `${API_BASE_URL}/ai/summarize/stream/?${params.toString()}`;
    console.log('Summary streaming URL:', url);

    const eventSource = new EventSource(url, {
      withCredentials: true
    });

    eventSource.onopen = (event) => {
      console.log('EventSource connection opened', event);
    };

    eventSource.onmessage = (event) => {
      console.log('EventSource message received:', event.data);
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'start':
            onStart?.();
            break;
          case 'chunk':
            onChunk(data.content);
            break;
          case 'end':
            onEnd?.(data.summary);
            eventSource.close();
            break;
          case 'error':
            onError?.(data.message);
            eventSource.close();
            break;
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
        onError?.('Error parsing server response');
        eventSource.close();
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      onError?.('Connection error occurred');
      eventSource.close();
    };

    // Return the EventSource so it can be closed manually if needed
    return eventSource;
  },
};

// WebSocket 连接管理
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
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }
    
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
      if (onError) {
        onError(error);
      }
    };
    
    this.ws.onclose = (event) => {
      console.log('WebSocket连接已关闭', event.code, event.reason);
      this.attemptReconnect(onMessage, onError);
    };
  }
  
  private attemptReconnect(onMessage: (message: any) => void, onError?: (error: any) => void) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      this.reconnectTimer = setTimeout(() => {
        this.connect(onMessage, onError);
      }, 2000 * this.reconnectAttempts);
    } else {
      console.error('WebSocket重连失败，已达到最大重试次数');
    }
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

// 通知 WebSocket 连接管理
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