# Streaming System Documentation

Real-time AI response streaming using Server-Sent Events (SSE) with custom authentication for EventSource compatibility.

## Overview

The AI Writer frontend uses Server-Sent Events (SSE) for real-time streaming of AI responses. This provides a much better user experience compared to waiting for complete responses, especially for longer AI-generated content.

## Architecture

### EventSource vs WebSocket
**Why EventSource?**
- Simpler than WebSocket for one-way communication
- Built-in reconnection handling
- Better integration with HTTP protocols
- Ideal for AI response streaming (server→client only)

**File**: `frontend/src/services/api.ts`

### Streaming Endpoints
All AI operations have both HTTP and streaming versions:

```javascript
// HTTP version (fallback)
aiApi.chat(workId, chapterId, message)

// Streaming version (primary)
aiApi.chatStream(workId, chapterId, message, onChunk, onStart, onEnd, onError)
```

## Authentication Challenge & Solution

### The Problem
EventSource cannot send custom headers, breaking standard token authentication:

```javascript
// This doesn't work with EventSource
const eventSource = new EventSource(url, {
  headers: {
    'Authorization': `Token ${token}`  // ❌ Not supported
  }
});
```

### The Solution: Query Parameter Authentication
**File**: `frontend/src/services/api.ts`

```javascript
chatStream: (workId, chapterId, message, onChunk, onStart, onEnd, onError) => {
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
        params.append('token', token);  // ✅ Token in query string
      }
    } catch (e) {
      console.error('Failed to parse auth storage:', e);
    }
  }

  const eventSource = new EventSource(
    `${API_BASE_URL}/ai/chat/stream/?${params.toString()}`,
    { withCredentials: true }
  );
```

### Backend Authentication Handling
**File**: `backend/apps/ai_services/views.py`

```python
@csrf_exempt
def ai_chat_stream(request):
    # Check authentication via token query parameter for EventSource compatibility
    user = None
    token = request.GET.get('token')
    if token:
        from rest_framework.authtoken.models import Token
        try:
            token_obj = Token.objects.get(key=token)
            user = token_obj.user
            request.user = user
        except Token.DoesNotExist:
            return HttpResponse(
                'data: {"type": "error", "message": "认证令牌无效"}\n\n',
                content_type='text/event-stream',
                status=401
            )
```

## SSE Message Format

### Consistent Message Structure
All streaming endpoints use the same message format:

```javascript
// Start of stream
{
  "type": "start"
}

// Content chunks
{
  "type": "chunk",
  "content": "piece of AI response"
}

// End of stream
{
  "type": "end",
  "summary": "complete response"  // optional, for summary endpoint
}

// Error occurred
{
  "type": "error",
  "message": "error description"
}
```

### Message Processing
```javascript
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
        onEnd?.(fullResponse);
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
```

## Streaming Implementation Examples

### 1. Chat Streaming
**File**: `frontend/src/components/editor/ChatPanel.tsx`

```javascript
const handleSendMessage = async () => {
  try {
    setIsStreamingChat(true);
    setStreamingMessage('');

    const eventSource = aiApi.chatStream(
      work.id,
      chapter.id,
      message,
      // onChunk - accumulate streaming response
      (chunk: string) => {
        setStreamingMessage(prev => prev + chunk);
      },
      // onStart
      () => {
        console.log('Chat streaming started');
      },
      // onEnd - finalize the message
      async (fullResponse: string) => {
        const aiResponse: ChatMessage = {
          id: Date.now().toString() + '_ai',
          role: 'assistant',
          content: fullResponse,
          timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, aiResponse]);
        setIsStreamingChat(false);
        setStreamingMessage('');

        // Save AI response to backend
        await chatApi.saveMessage(work.id, chapter.id, 'assistant', fullResponse);
      },
      // onError - fallback to HTTP API
      (error: string) => {
        console.error('Streaming chat error:', error);
        setIsStreamingChat(false);
        chatMutation.mutate(message);  // Fallback to HTTP
      }
    );

    setStreamEventSource(eventSource);
  } catch (error) {
    setIsStreamingChat(false);
    chatMutation.mutate(message);  // Fallback to HTTP
  }
};
```

### 2. Auto-Edit Streaming
**Files**: `frontend/src/components/editor/EditorPanel.tsx`, `frontend/src/components/modals/AutoEditModal.tsx`

Auto-edit uses `fetch` with a readable stream (not EventSource). Chunks are accumulated in the modal; the user confirms before text is applied to the chapter.

```typescript
await aiApi.autoEditStream(
  work.id,
  chapter.id,
  originalText,
  context,       // chapter/lore/style/reasoning options
  onChunk,       // append streamed text to modal output
  onStart,
  onEnd,
  onError,
  signal         // AbortController for cancel
);
```

On accept, `EditorPanel` replaces the selected range (or inserts at cursor) with the edited text. Note positions are adjusted via `adjustPositions()` — chapter content stays plain text with no embedded markers.

### 3. Summary Streaming
**File**: `frontend/src/services/api.ts`

```javascript
summarizeStream: (workId, chapterId, onChunk, onStart, onEnd, onError) => {
  const params = new URLSearchParams({
    work_id: workId.toString(),
    chapter_id: chapterId.toString(),
  });

  // Add authentication token
  const authStorage = localStorage.getItem('auth-storage');
  if (authStorage) {
    const parsedStorage = JSON.parse(authStorage);
    const token = parsedStorage?.state?.token;
    if (token) {
      params.append('token', token);
    }
  }

  const eventSource = new EventSource(
    `${API_BASE_URL}/ai/summarize/stream/?${params.toString()}`,
    { withCredentials: true }
  );

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'start':
        onStart?.();
        break;
      case 'chunk':
        onChunk(data.content);
        break;
      case 'end':
        onEnd?.(data.summary);  // Complete summary
        eventSource.close();
        break;
      case 'error':
        onError?.(data.message);
        eventSource.close();
        break;
    }
  };

  return eventSource;
}
```

## Error Handling & Fallbacks

### Connection Error Handling
```javascript
eventSource.onerror = (error) => {
  console.error('EventSource error:', error);
  onError?.('Connection error occurred');
  eventSource.close();
};
```

### Automatic Fallback Strategy
When streaming fails, the system automatically falls back to HTTP requests:

```javascript
// In ChatPanel.tsx
onError: (error: string) => {
  console.error('Streaming chat error:', error);
  setIsStreamingChat(false);
  setStreamingMessage('');

  // Fallback to regular API
  chatMutation.mutate(message);
}
```

### Manual Stream Cancellation
Users can cancel streaming operations:

```javascript
const handleCancelStreaming = () => {
  if (streamEventSource) {
    streamEventSource.close();
    setStreamEventSource(null);
  }
  setIsStreaming(false);
  setAIContinueLoading(false);
  addNotification({
    type: 'info',
    message: 'AI续写已取消'
  });
};
```

## State Management During Streaming

### Streaming State Variables
```javascript
// Chat streaming state
const [isStreamingChat, setIsStreamingChat] = useState(false);
const [streamingMessage, setStreamingMessage] = useState('');
const [streamEventSource, setStreamEventSource] = useState<EventSource | null>(null);

// Continue writing streaming state
const [isStreaming, setIsStreaming] = useState(false);

// Global AI loading states (from useUIStore)
const {
  isAIContinueLoading,
  setAIContinueLoading,
  isAISuggestLoading,
  setAISuggestLoading
} = useUIStore();
```

### State Synchronization
```javascript
// Cleanup on component unmount
useEffect(() => {
  return () => {
    if (streamEventSource) {
      streamEventSource.close();
    }
  };
}, [streamEventSource]);

// Prevent multiple concurrent operations
const handleSendMessage = async () => {
  if (isStreamingChat || chatMutation.isPending) return;
  // ... proceed with streaming
};
```

## UI Integration

### Real-time Response Display
During streaming, responses are shown in real-time:

```javascript
{/* Streaming message indicator */}
{isStreamingChat && (
  <div className="w-full">
    <div className="w-full bg-dark-surface border border-dark-border rounded-lg p-3 mb-1">
      <div className="prose prose-sm prose-invert max-w-none text-dark-text">
        <ReactMarkdown>{streamingMessage}</ReactMarkdown>
        <span className="inline-block w-2 h-4 bg-dark-primary animate-pulse ml-1" />
      </div>
    </div>
    <div className="text-xs opacity-70 mb-4 text-left text-dark-text-muted">
      正在输入...
    </div>
  </div>
)}
```

### Loading States and Feedback
```javascript
{/* Loading indicator for HTTP requests (fallback) */}
{chatMutation.isPending && !isStreamingChat && (
  <div className="w-full">
    <div className="w-full bg-dark-surface border border-dark-border rounded-lg p-3">
      <div className="flex items-center gap-2 text-dark-text-muted">
        <LoadingSpinner size="sm" />
        <span className="text-sm">AI正在思考...</span>
      </div>
    </div>
  </div>
)}
```

## Security Considerations

### Token in Query String
**Security Risk**: Tokens in query strings are logged in server access logs.

**Mitigation**:
- Use HTTPS in production to encrypt query strings
- Configure server to not log query parameters containing tokens
- Consider token rotation for enhanced security

### CORS Configuration
```javascript
const eventSource = new EventSource(url, {
  withCredentials: true  // Include cookies for CORS
});
```

Backend must configure CORS to allow credentials:
```python
# In Django settings
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = ['http://localhost:5173']
```

## Performance Optimization

### Memory Management
```javascript
// Always clean up EventSource connections
useEffect(() => {
  return () => {
    if (streamEventSource) {
      streamEventSource.close();
      setStreamEventSource(null);
    }
  };
}, []);
```

### Chunked Processing
Large responses are processed in chunks to maintain UI responsiveness:

```javascript
onChunk: (chunk: string) => {
  // Process chunk immediately for real-time display
  setStreamingMessage(prev => prev + chunk);

  // Batch DOM updates to avoid performance issues
  requestAnimationFrame(() => {
    // Update UI elements that depend on the content
  });
}
```

## Common Issues & Troubleshooting

### 1. 401 Authentication Errors
**Symptoms**: Streaming requests fail with 401
**Cause**: Token not properly included in query parameters
**Debug**:
```javascript
console.log('Token being sent:', params.get('token')?.substring(0, 10) + '...');
```

### 2. Connection Timeouts
**Symptoms**: EventSource connections close unexpectedly
**Cause**: Server timeouts or network issues
**Solution**: Implement reconnection logic (EventSource handles this automatically)

### 3. Malformed JSON in SSE
**Symptoms**: JSON parsing errors in message handler
**Cause**: Server sending invalid JSON
**Debug**:
```javascript
eventSource.onmessage = (event) => {
  console.log('Raw SSE data:', event.data);
  try {
    const data = JSON.parse(event.data);
    // ... process data
  } catch (error) {
    console.error('JSON parse error:', error, 'Data:', event.data);
  }
};
```

### 4. Memory Leaks from Unclosed Connections
**Symptoms**: Browser running out of memory after many operations
**Cause**: EventSource connections not properly closed
**Solution**: Always close connections in cleanup functions

## Testing Streaming

### Manual Testing
```javascript
// Test streaming endpoint directly
const testStream = () => {
  const eventSource = new EventSource('/api/ai/chat/stream/?token=your_token&work_id=1&chapter_id=1&message=test');

  eventSource.onmessage = (event) => {
    console.log('Received:', event.data);
  };

  eventSource.onerror = (error) => {
    console.error('Stream error:', error);
  };

  // Clean up after 10 seconds
  setTimeout(() => {
    eventSource.close();
  }, 10000);
};
```

### Automated Testing
```javascript
// Mock EventSource for testing
class MockEventSource {
  constructor(url) {
    this.url = url;
    setTimeout(() => {
      this.onmessage?.({ data: '{"type": "start"}' });
      this.onmessage?.({ data: '{"type": "chunk", "content": "test chunk"}' });
      this.onmessage?.({ data: '{"type": "end"}' });
    }, 100);
  }

  close() {
    // Mock close
  }
}

// Use in tests
global.EventSource = MockEventSource;
```

The streaming system provides excellent user experience with real-time AI responses while maintaining robust error handling and fallback mechanisms.