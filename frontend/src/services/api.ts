import axios from 'axios';
import type { Work, Act, Chapter, Faction, LoreEntry, Note, ChatMessage, AutoEdit, Suggestion, WritingStyle } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add auth token interceptor
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
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Check for API key missing error
    const errorMessage = error.response?.data?.error || '';
    if (errorMessage.includes('API密钥未配置') || errorMessage.includes('请先配置API密钥') || errorMessage.includes('用户设置不存在')) {
      // Trigger settings modal via custom event
      window.dispatchEvent(new CustomEvent('openSettingsModal', {
        detail: { reason: 'API密钥未配置，请先配置您的DeepSeek API密钥' }
      }));
    }

    if (error.response?.status === 401) {
      // Clear auth state and redirect to login
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        try {
          const parsedStorage = JSON.parse(authStorage);
          const logout = parsedStorage?.state?.logout;
          if (logout) {
            // Clear auth state
            localStorage.removeItem('auth-storage');
            // Redirect to login page
            window.location.href = '/auth';
          }
        } catch (e) {
          console.error('Failed to handle auth error:', e);
          // Fallback: clear storage and redirect
          localStorage.removeItem('auth-storage');
          window.location.href = '/auth';
        }
      }
    }
    return Promise.reject(error);
  }
);

// 作品相关 API
export const worksApi = {
  list: () => api.get<{ results: Work[]; count: number; next?: string; previous?: string }>('/works/'),
  get: (id: number) => api.get<Work>(`/works/${id}/`),
  create: (data: Partial<Work>) => api.post<Work>('/works/', data),
  update: (id: number, data: Partial<Work>) => api.patch<Work>(`/works/${id}/`, data),
  delete: (id: number) => api.delete(`/works/${id}/`),
};

// 章节相关 API
export const chaptersApi = {
  list: (workId: number, options?: { includeSummary?: boolean }) =>
    api.get<Chapter[]>(`/works/${workId}/chapters/`, {
      params: options?.includeSummary ? { include_summary: 1 } : undefined,
    }),
  get: (workId: number, id: number) => api.get<Chapter>(`/works/${workId}/chapters/${id}/`),
  create: (workId: number, data: Partial<Chapter>) =>
    api.post<Chapter>(`/works/${workId}/chapters/`, data),
  update: (workId: number, id: number, data: Partial<Chapter>) =>
    api.patch<Chapter>(`/works/${workId}/chapters/${id}/`, data),
  delete: (workId: number, id: number) => api.delete(`/works/${workId}/chapters/${id}/`),
  autoSave: (workId: number, id: number, content: string) =>
    api.patch(`/works/${workId}/chapters/${id}/autosave/`, { content }),
  reorder: (workId: number, actId: number, chapterIds: number[]) =>
    api.post<{ status: string; updated: number }>(`/works/${workId}/chapters/reorder/`, {
      act_id: actId,
      chapter_ids: chapterIds,
    }),
};

// 卷相关 API
export const actsApi = {
  list: (workId: number, options?: { includeSynopsis?: boolean }) =>
    api.get<Act[]>(`/works/${workId}/acts/`, {
      params: options?.includeSynopsis ? { include_synopsis: 1 } : undefined,
    }),
  get: (workId: number, id: number) => api.get<Act>(`/works/${workId}/acts/${id}/`),
  create: (workId: number, data: Partial<Act>) => 
    api.post<Act>(`/works/${workId}/acts/`, data),
  update: (workId: number, id: number, data: Partial<Act>) => 
    api.patch<Act>(`/works/${workId}/acts/${id}/`, data),
  delete: (workId: number, id: number) => api.delete(`/works/${workId}/acts/${id}/`),
};

// 阵营相关 API
export const factionsApi = {
  list: (workId: number) => api.get<Faction[]>(`/works/${workId}/factions/`),
  create: (workId: number, data: Partial<Faction>) => 
    api.post<Faction>(`/works/${workId}/factions/`, data),
  update: (workId: number, id: number, data: Partial<Faction>) => 
    api.patch<Faction>(`/works/${workId}/factions/${id}/`, data),
  delete: (workId: number, id: number) => api.delete(`/works/${workId}/factions/${id}/`),
};

// 世界观条目相关 API
export const loreApi = {
  list: (workId: number) => api.get<LoreEntry[]>(`/works/${workId}/lore/`),
  create: (workId: number, data: Partial<LoreEntry> & { factions?: number[] }) => 
    api.post<LoreEntry>(`/works/${workId}/lore/`, data),
  update: (workId: number, id: number, data: Partial<LoreEntry> & { factions?: number[] }) => 
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
    return api.get<Note[] | { results: Note[] }>(url);
  },
  create: (data: Partial<Note>) => api.post<Note>('/notes/', data),
  update: (id: number, data: Partial<Note>) => api.patch<Note>(`/notes/${id}/`, data),
  delete: (id: number) => api.delete(`/notes/${id}/`),
};

// AutoEdit 相关 API
export const autoEditApi = {
  list: (chapterId?: number) => {
    let url = '/auto-edits/';
    if (chapterId) url += `?chapter=${chapterId}`;
    return api.get<AutoEdit[]>(url);
  },

  update: (id: number, data: Partial<AutoEdit>) =>
    api.patch<AutoEdit>(`/auto-edits/${id}/`, data),

  delete: (id: number) => api.delete(`/auto-edits/${id}/`),

  addVersion: (id: number, editedText: string) =>
    api.post<AutoEdit>(`/auto-edits/${id}/add_version/`, { edited_text: editedText }),

  switchVersion: (id: number, versionIndex: number) =>
    api.patch<AutoEdit>(`/auto-edits/${id}/switch_version/`, { version_index: versionIndex }),
};

// 聊天历史相关 API
export const chatApi = {
  getHistory: (workId: number, chapterId: number) =>
    api.get<{ session_id: string; messages: ChatMessage[] }>(`/chat/${workId}/${chapterId}/`),

  saveMessage: (workId: number, chapterId: number, role: string, content: string) =>
    api.post<ChatMessage>(`/chat/${workId}/${chapterId}/save/`, {
      role,
      content,
    }),

  deleteMessage: (workId: number, chapterId: number, messageId: string) =>
    api.delete(`/chat/${workId}/${chapterId}/message/${messageId}/`),

  clearHistory: (workId: number, chapterId: number) =>
    api.delete(`/chat/${workId}/${chapterId}/clear/`),

  getWorkHistory: (workId: number) =>
    api.get<{ session_id: string; messages: ChatMessage[] }>(`/chat/work/${workId}/`),

  saveWorkMessage: (workId: number, role: string, content: string) =>
    api.post<ChatMessage>(`/chat/work/${workId}/save/`, {
      role,
      content,
    }),

  deleteWorkMessage: (workId: number, messageId: string) =>
    api.delete(`/chat/work/${workId}/message/${messageId}/`),

  clearWorkHistory: (workId: number) =>
    api.delete(`/chat/work/${workId}/clear/`),
};

// AI 服务相关 API
export const aiApi = {
  suggest: (workId: number, chapterId: number, targetText?: string) =>
    api.post<{ suggestions: Suggestion[] }>('/ai/suggest/', {
      work_id: workId,
      chapter_id: chapterId,
      target_text: targetText,
    }),

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

  // Streaming version of generate act synopsis
  generateActSynopsisStream: async (
    workId: number,
    actId: number,
    callbacks: {
      onStart?: () => void;
      onChapterProgress?: (info: { chapter: string; status: string; current: number; total: number; message?: string }) => void;
      onChapterDone?: (chapter: string) => void;
      onChapterSkip?: (chapter: string, message: string) => void;
      onChapterError?: (chapter: string, message: string) => void;
      onSynopsisProgress?: (message: string) => void;
      onChunk?: (chunk: string) => void;
      onEnd?: (synopsis: string) => void;
      onError?: (message: string) => void;
    }
  ) => {
    // Get auth token
    let token = '';
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const parsedStorage = JSON.parse(authStorage);
        token = parsedStorage?.state?.token || '';
      } catch (e) {
        console.error('Failed to parse auth storage:', e);
      }
    }

    const url = `${API_BASE_URL}/ai/act-synopsis/stream/`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Token ${token}` : ''
        },
        body: JSON.stringify({
          work_id: workId,
          act_id: actId,
          token: token
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              switch (data.type) {
                case 'start':
                  callbacks.onStart?.();
                  break;
                case 'chapter_progress':
                  callbacks.onChapterProgress?.({
                    chapter: data.chapter,
                    status: data.status,
                    current: data.current,
                    total: data.total,
                    message: data.message
                  });
                  break;
                case 'chapter_done':
                  callbacks.onChapterDone?.(data.chapter);
                  break;
                case 'chapter_skip':
                  callbacks.onChapterSkip?.(data.chapter, data.message);
                  break;
                case 'chapter_error':
                  callbacks.onChapterError?.(data.chapter, data.message);
                  break;
                case 'synopsis_progress':
                  callbacks.onSynopsisProgress?.(data.message);
                  break;
                case 'chunk':
                  callbacks.onChunk?.(data.content);
                  break;
                case 'end':
                  callbacks.onEnd?.(data.synopsis);
                  break;
                case 'error':
                  callbacks.onError?.(data.message);
                  break;
              }
            } catch (error) {
              console.error('Error parsing SSE data:', error, line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Act synopsis stream error:', error);
      callbacks.onError?.(`连接错误: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  // Get default lore entry template
  getDefaultLoreTemplate: () => api.get<{ template: string }>('/ai/lore-template/default/'),

  // Streaming version of auto edit
  autoEditStream: async (
    workId: number,
    chapterId: number,
    selectedText: string,
    context: {
      chapterSelection: 'all' | 'custom' | 'none';
      customChapterCount?: number;
      selectedLoreEntries: number[];
      selectedFactions?: number[];
      reasoningMode?: boolean;
      editRequirement?: string;
      styleId?: number;
    },
    onChunk: (chunk: string) => void,
    onStart?: () => void,
    onEnd?: (editedText: string) => void,
    onError?: (error: string) => void,
    signal?: AbortSignal
  ) => {
    // Build request body
    const requestBody: Record<string, string | number | boolean> = {
      work_id: workId,
      chapter_id: chapterId,
      selected_text: selectedText,
      chapter_selection: context.chapterSelection,
    };

    if (context.reasoningMode) {
      requestBody.reasoning_mode = true;
    }

    if (context.customChapterCount) {
      requestBody.custom_chapter_count = context.customChapterCount;
    }

    if (context.selectedLoreEntries.length > 0) {
      requestBody.selected_lore_ids = context.selectedLoreEntries.join(',');
    }

    if (context.selectedFactions && context.selectedFactions.length > 0) {
      requestBody.selected_faction_ids = context.selectedFactions.join(',');
    }

    if (context.editRequirement) {
      requestBody.edit_requirement = context.editRequirement;
    }

    if (context.styleId) {
      requestBody.style_id = context.styleId;
    }

    // Add token for authentication
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const parsedStorage = JSON.parse(authStorage);
        const token = parsedStorage?.state?.token;
        if (token) {
          requestBody.token = token;
        }
      } catch (e) {
        console.error('Failed to parse auth storage:', e);
      }
    }

    try {
      // Use fetch with POST for SSE streaming
      const response = await fetch(`${API_BASE_URL}/ai/auto-edit/stream/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        credentials: 'include',
        signal: signal,
      });

      if (!response.ok) {
        onError?.(`HTTP error! status: ${response.status}`);
        return;
      }

      // Read response as stream
      const reader = response.body?.getReader();
      if (!reader) {
        onError?.('Failed to get response reader');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      // Read stream chunks
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (split by double newline)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const message of messages) {
          if (!message.trim()) continue;

          // Parse SSE message (format: "data: {...}")
          const dataMatch = message.match(/^data: (.+)$/m);
          if (!dataMatch) continue;

          try {
            const data = JSON.parse(dataMatch[1]);

            switch (data.type) {
              case 'start':
                onStart?.();
                break;
              case 'chunk':
                onChunk(data.content);
                break;
              case 'end':
                onEnd?.(data.edited_text || '');
                return;
              case 'error':
                onError?.(data.message);
                return;
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error);
            onError?.('Error parsing server response');
            return;
          }
        }
      }
    } catch (error) {
      // Don't report error if request was aborted
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Auto-edit stream aborted');
        return;
      }
      console.error('Fetch error:', error);
      onError?.('Connection error occurred');
    }
  },

  // Streaming version of chat
  chatStream: (
    workId: number,
    chapterId: number,
    message: string,
    onChunk: (chunk: string) => void,
    onStart?: () => void,
    onEnd?: (fullResponse: string) => void,
    onError?: (error: string) => void,
    reasoningMode: boolean = false
  ) => {
    const params = new URLSearchParams({
      work_id: workId.toString(),
      chapter_id: chapterId.toString(),
      message: message,
    });

    if (reasoningMode) {
      params.append('reasoning_mode', '1');
    }

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

    const eventSource = new EventSource(`${API_BASE_URL}/ai/chat/stream/?${params.toString()}`, {
      withCredentials: true,
    });

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
  },

  workChatStream: (
    workId: number,
    message: string,
    onChunk: (chunk: string) => void,
    onStart?: () => void,
    onEnd?: (fullResponse: string) => void,
    onError?: (error: string) => void,
    reasoningMode: boolean = false
  ) => {
    const params = new URLSearchParams({
      work_id: workId.toString(),
      message: message,
    });

    if (reasoningMode) {
      params.append('reasoning_mode', '1');
    }

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

    const eventSource = new EventSource(`${API_BASE_URL}/ai/work/chat/stream/?${params.toString()}`, {
      withCredentials: true,
    });

    let fullResponse = '';

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'start':
            onStart?.();
            break;
          case 'chunk':
            fullResponse += data.content;
            onChunk(data.content);
            break;
          case 'end':
            onEnd?.(data.full_response || fullResponse);
            eventSource.close();
            break;
          case 'error':
            onError?.(data.message);
            eventSource.close();
            break;
        }
      } catch (error) {
        console.error('Error parsing work chat SSE data:', error);
        onError?.('Error parsing server response');
        eventSource.close();
      }
    };

    eventSource.onerror = (error) => {
      console.error('Work chat EventSource error:', error);
      onError?.('Connection error occurred');
      eventSource.close();
    };

    return eventSource;
  },

  // Get chapters containing entry name (for UI selection)
  getChaptersWithEntry: async (
    workId: number,
    entryName: string
  ): Promise<Array<{id: number, chapter_number: number, title: string}>> => {
    const requestBody: Record<string, string | number> = {
      work_id: workId,
      entry_name: entryName,
    };

    // Add token for authentication
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const parsedStorage = JSON.parse(authStorage);
        const token = parsedStorage?.state?.token;
        if (token) {
          requestBody.token = token;
        }
      } catch (e) {
        console.error('Failed to parse auth storage:', e);
      }
    }

    const response = await fetch(`${API_BASE_URL}/ai/auto-describe-entry/chapters/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.chapters || [];
  },

  // Streaming auto describe entry
  autoDescribeEntry: async (
    workId: number,
    entryName: string,
    onChunk: (chunk: string) => void,
    onStart?: (usedChapters: Array<{chapter_number: number, title: string, id?: number}>) => void,
    onEnd?: (description: string, usedChapters: Array<{chapter_number: number, title: string, id?: number}>) => void,
    onError?: (error: string) => void,
    options?: {
      chapterIds?: number[];
      additionalContext?: string;
      isUpdate?: boolean;
      originalDescription?: string;
    }
  ) => {
    // Build request body
    const requestBody: Record<string, unknown> = {
      work_id: workId,
      entry_name: entryName,
    };

    // Add optional parameters
    if (options?.chapterIds && options.chapterIds.length > 0) {
      requestBody.chapter_ids = options.chapterIds;
    }
    if (options?.additionalContext) {
      requestBody.additional_context = options.additionalContext;
    }
    if (options?.isUpdate) {
      requestBody.is_update = true;
      requestBody.original_description = options.originalDescription || '';
    }

    // Add token for authentication
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const parsedStorage = JSON.parse(authStorage);
        const token = parsedStorage?.state?.token;
        if (token) {
          requestBody.token = token;
        }
      } catch (e) {
        console.error('Failed to parse auth storage:', e);
      }
    }

    try {
      // Use fetch with POST for SSE streaming
      const response = await fetch(`${API_BASE_URL}/ai/auto-describe-entry/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        credentials: 'include',
      });

      if (!response.ok) {
        onError?.(`HTTP error! status: ${response.status}`);
        return;
      }

      // Read response as stream
      const reader = response.body?.getReader();
      if (!reader) {
        onError?.('Failed to get response reader');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      // Read stream chunks
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (split by double newline)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const message of messages) {
          if (!message.trim()) continue;

          // Parse SSE message (format: "data: {...}")
          const dataMatch = message.match(/^data: (.+)$/m);
          if (!dataMatch) continue;

          try {
            const data = JSON.parse(dataMatch[1]);

            switch (data.type) {
              case 'start':
                onStart?.(data.used_chapters || []);
                break;
              case 'chunk':
                onChunk(data.content);
                break;
              case 'end':
                onEnd?.(data.description || '', data.used_chapters || []);
                return;
              case 'error':
                onError?.(data.message);
                return;
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error);
            onError?.('Error parsing server response');
            return;
          }
        }
      }
    } catch (error) {
      console.error('Fetch error:', error);
      onError?.('Connection error occurred');
    }
  },

};

// Edit Prefills API
export interface EditPrefill {
  id: number;
  scope: 'auto_edit';
  name: string;
  prompt_text: string;
  is_default: boolean;
  order: number;
  created_at: string;
  updated_at: string;
}

export const editPrefillsApi = {
  list: (scope: 'auto_edit' = 'auto_edit') =>
    api.get<EditPrefill[]>('/auth/edit-prefills/', { params: { scope } }),
  create: (data: { name: string; prompt_text: string; scope?: 'auto_edit' }) =>
    api.post<EditPrefill>('/auth/edit-prefills/create/', data),
  update: (id: number, data: Partial<{ name: string; prompt_text: string }>) =>
    api.patch<EditPrefill>(`/auth/edit-prefills/${id}/`, data),
  delete: (id: number) => api.delete(`/auth/edit-prefills/${id}/delete/`),
};

// 写作风格相关 API
export const stylesApi = {
  list: () => api.get<WritingStyle[]>('/styles/'),

  create: (data: Partial<WritingStyle>) => api.post<WritingStyle>('/styles/', data),

  update: (id: number, data: Partial<WritingStyle>) =>
    api.patch<WritingStyle>(`/styles/${id}/`, data),

  delete: (id: number) => api.delete(`/styles/${id}/`),

  analyze: (text: string, name: string) =>
    api.post<{
      analysis_result: {
        overall?: string;
        perspectives: Array<{
          name: string;
          description: string;
          examples: string[];
        }>;
      };
      formatted_text: string;
      name: string;
    }>('/styles/analyze/', { text, name }),

  analyzeNsfw: (text: string, name: string) =>
    api.post<{
      analysis_result: {
        overall?: string;
        perspectives: Array<{
          name: string;
          description: string;
          examples: string[];
        }>;
      };
      formatted_text: string;
      name: string;
    }>('/styles/analyze_nsfw/', { text, name }),
};
