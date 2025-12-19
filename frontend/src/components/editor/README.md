# Editor Components Documentation

Detailed documentation for the editor component system including EditorPanel, ChatPanel, and their integration with the marker system.

## EditorPanel Component

**File**: `frontend/src/components/editor/EditorPanel.tsx`

### Overview
The EditorPanel is the core text editing component that provides:
- Rich text editing with marker-based highlighting
- Real-time AI integration (continue writing, suggestions)
- Note creation and management
- Auto-save functionality
- Text selection handling

### Props Interface
```typescript
interface EditorPanelProps {
  content: string;                    // Clean content (no markers)
  onChange: (content: string) => void; // Content change handler
  work: Work;                         // Work object
  chapter: Chapter;                   // Chapter object
}
```

### Key State Variables
```typescript
// Content states
const [contentWithMarkers, setContentWithMarkers] = useState(''); // Database content
const [guideText, setGuideText] = useState('');                   // AI writing guide

// Selection states
const [selectedText, setSelectedText] = useState('');
const [selectionStart, setSelectionStart] = useState(0);
const [selectionEnd, setSelectionEnd] = useState(0);

// AI operation states
const [isStreaming, setIsStreaming] = useState(false);
const [streamEventSource, setStreamEventSource] = useState<EventSource | null>(null);

// Note creation states
const [isCreatingNote, setIsCreatingNote] = useState(false);
const [newNoteContent, setNewNoteContent] = useState('');
const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0].value);
const [selectedTextForNote, setSelectedTextForNote] = useState('');
```

### Critical Functions

#### Content Management
```typescript
// Handle textarea changes with marker preservation
const handleTextareaChange = (newContentWithMarkers: string) => {
  console.log('🔥 handleTextareaChange called - no restoration needed');

  // Just pass through - markers should be protected by keydown handler
  setContentWithMarkers(newContentWithMarkers);
  onChange(newContentWithMarkers); // Save with markers

  // Update previous content reference
  previousContentRef.current = newContentWithMarkers;
};

// Initialize contentWithMarkers from content prop
useEffect(() => {
  if (contentWithMarkers === '' && content) {
    console.log('🔄 Initializing contentWithMarkers from content:', content.substring(0, 100));
    setContentWithMarkers(content);
    previousContentRef.current = content;
  }
}, [content, contentWithMarkers]);
```

#### Text Selection with Marker Awareness
```typescript
const handleTextSelect = () => {
  if (!textareaRef.current) return;

  const rawStart = textareaRef.current.selectionStart;
  const rawEnd = textareaRef.current.selectionEnd;

  if (rawStart !== rawEnd) {
    // Adjust selection to exclude markers
    const adjusted = MarkerUtils.adjustSelectionToExcludeMarkers(
      contentWithMarkers || '',
      rawStart,
      rawEnd
    );

    // Use clean content for getting the selected text
    const cleanContent = MarkerUtils.stripAllMarkers(contentWithMarkers || '');
    const cleanStart = MarkerUtils.stripAllMarkers((contentWithMarkers || '').slice(0, adjusted.start)).length;
    const cleanEnd = cleanStart + MarkerUtils.stripAllMarkers((contentWithMarkers || '').slice(adjusted.start, adjusted.end)).length;

    const selected = cleanContent.slice(cleanStart, cleanEnd);

    setSelectedText(selected);
    setSelectionStart(cleanStart);
    setSelectionEnd(cleanEnd);
    setSelectedTextForNote(selected);
  }
};
```

#### Marker Protection System
```typescript
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Backspace' || e.key === 'Delete') {
    const textarea = e.currentTarget;
    const cursorPos = textarea.selectionStart;
    const text = contentWithMarkers || '';

    // Check if deletion would affect markers
    const markerRegex = /\u200B[\uFEFF\u200C\u200D\u2060\u180E]+\u200C|\u200D[\uFEFF\u200C\u200D\u2060\u180E]+\u2060/g;

    // For single cursor position - check if we're about to delete part of a marker
    let posToCheck = cursorPos;
    if (e.key === 'Backspace' && cursorPos > 0) {
      posToCheck = cursorPos - 1;
    }

    // Check surrounding text for markers and prevent deletion if needed
    const startCheck = Math.max(0, posToCheck - 20);
    const endCheck = Math.min(text.length, posToCheck + 20);
    const surroundingText = text.slice(startCheck, endCheck);
    // ... marker protection logic
  }
};
```

#### AI Continue Writing
```typescript
const handleAIContinue = async () => {
  if (isAIContinueLoading) return;

  try {
    setAIContinueLoading(true);
    let accumulatedContent = '';
    const startingContentWithMarkers = contentWithMarkers || content;

    const eventSource = aiApi.continueStream(
      work.id,
      chapter.id,
      // onChunk - called for each piece of text
      (chunk: string) => {
        accumulatedContent += chunk;
        const newContentWithMarkers = startingContentWithMarkers + accumulatedContent;

        setContentWithMarkers(newContentWithMarkers);
        onChange(newContentWithMarkers);

        // Keep cursor at end during streaming
        if (textareaRef.current) {
          setTimeout(() => {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(newContent.length, newContent.length);
          }, 0);
        }
      },
      // onStart, onEnd, onError callbacks...
    );

    setStreamEventSource(eventSource);
  } catch (error) {
    setIsStreaming(false);
    chatMutation.mutate(message);
  }
};
```

#### Note Management
```typescript
// Create note with text linking
const handleCreateNote = () => {
  if (!newNoteContent.trim()) return;

  createNoteMutation.mutate({
    work: work.id,
    chapter: chapter.id,
    content: newNoteContent,
    color: selectedColor,
    note_type: 'user',
    text_start_position: selectedTextForNote ? noteSelectionStart : undefined,
    text_end_position: selectedTextForNote ? noteSelectionEnd : undefined,
    linked_text: selectedTextForNote || undefined
  });
};

// Update note's text link
const handleUpdateNoteLink = (note: Note) => {
  if (!selectedText) {
    addNotification({
      type: 'info',
      message: '请先选择文本，然后点击"更新链接"按钮'
    });
    return;
  }

  // Remove old markers and wrap new text with markers
  const contentWithoutOldMarkers = MarkerUtils.removeMarkers(contentWithMarkers, note.id);
  const newContentWithMarkers = MarkerUtils.wrapWithMarkers(
    contentWithoutOldMarkers,
    selectedText,
    note.id
  );

  setContentWithMarkers(newContentWithMarkers);
  onChange(newContentWithMarkers);

  // Update note in database
  updateNoteMutation.mutate({
    id: note.id,
    data: {
      ...note,
      linked_text: selectedText,
      text_start_position: selectionStart,
      text_end_position: selectionEnd
    }
  });
};

// Handle note click to highlight linked text
const handleNoteClick = (note: Note) => {
  if (!textareaRef.current) return;

  const markerPositions = MarkerUtils.findMarkers(contentWithMarkers, note.id);

  if (markerPositions) {
    // Highlight the text between markers
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(markerPositions.start, markerPositions.end);

    // Scroll to position
    const textBeforePosition = contentWithMarkers.slice(0, markerPositions.start);
    const lines = textBeforePosition.split('\n');
    const lineNumber = lines.length - 1;
    textareaRef.current.scrollTop = Math.max(0, lineNumber * 30 - 100);

    // Update selection state
    const linkedText = MarkerUtils.getTextBetweenMarkers(contentWithMarkers, note.id) || '';
    setSelectedText(linkedText);
  }
};
```

### UI Structure
```jsx
return (
  <div className="flex-1 flex flex-col bg-dark-bg">
    {/* AI Continue Writing Section */}
    <div className="flex-shrink-0 p-4 bg-dark-surface border-b border-dark-border">
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <Input
            placeholder="为AI续写提供指导（可选）"
            value={guideText}
            onChange={(e) => setGuideText(e.target.value)}
          />
        </div>
        <LoadingButton
          onClick={handleAIContinue}
          loading={isAIContinueLoading}
          disabled={isAIContinueLoading}
        >
          <Sparkles size={16} className="mr-2" />
          AI续写
        </LoadingButton>
        {isStreaming && (
          <Button onClick={handleCancelStreaming} variant="ghost">
            <X size={16} />
          </Button>
        )}
      </div>
    </div>

    {/* Main Editor Area */}
    <div className="flex-1 p-4 overflow-hidden">
      <textarea
        ref={textareaRef}
        value={MarkerUtils.stripAllMarkers(contentWithMarkers || '')}
        onChange={(e) => handleTextareaChange(e.target.value)}
        onSelect={handleTextSelect}
        onKeyDown={handleKeyDown}
        className="w-full h-full resize-none bg-transparent text-dark-text border-0 outline-0"
        placeholder="开始写作..."
      />
    </div>

    {/* Note Creation Panel */}
    {selectedTextForNote && !isCreatingNote && (
      <div className="flex-shrink-0 p-4 bg-dark-surface border-t border-dark-border">
        <div className="flex items-center gap-3">
          <span className="text-sm text-dark-text-muted">
            已选择: "{selectedTextForNote}"
          </span>
          <Button onClick={handleStartCreateNote} size="sm">
            <StickyNote size={16} className="mr-2" />
            创建笔记
          </Button>
        </div>
      </div>
    )}

    {/* Note Creation Form */}
    {isCreatingNote && (
      <div className="flex-shrink-0 p-4 bg-dark-surface border-t border-dark-border">
        {/* Note creation form UI */}
      </div>
    )}
  </div>
);
```

## ChatPanel Component

**File**: `frontend/src/components/editor/ChatPanel.tsx`

### Overview
The ChatPanel provides AI conversation functionality with:
- Real-time streaming chat responses
- Chat history persistence
- Context-aware AI responses
- Markdown rendering for AI responses

### Props Interface
```typescript
interface ChatPanelProps {
  work: Work;
  chapter: Chapter;
}
```

### Key Features

#### Streaming Chat Implementation
```typescript
const handleSendMessage = async () => {
  const message = inputMessage.trim();
  if (!message || isStreamingChat || chatMutation.isPending) return;

  setInputMessage('');

  // Add user message immediately
  const userMessage: ChatMessage = {
    id: Date.now().toString() + '_user',
    role: 'user',
    content: message,
    timestamp: new Date().toISOString()
  };
  setMessages(prev => [...prev, userMessage]);

  // Save user message to backend
  await chatApi.saveMessage(work.id, chapter.id, 'user', message);

  // Try streaming first, fallback to regular API
  try {
    setIsStreamingChat(true);
    setStreamingMessage('');

    const eventSource = aiApi.chatStream(
      work.id,
      chapter.id,
      message,
      // onChunk
      (chunk: string) => {
        setStreamingMessage(prev => prev + chunk);
      },
      // onStart
      () => {
        console.log('Chat streaming started');
      },
      // onEnd
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
      // onError - fallback to HTTP
      (error: string) => {
        console.error('Streaming chat error:', error);
        setIsStreamingChat(false);
        chatMutation.mutate(message);
      }
    );

    setStreamEventSource(eventSource);
  } catch (error) {
    setIsStreamingChat(false);
    chatMutation.mutate(message);
  }
};
```

#### Chat History Loading
```typescript
useEffect(() => {
  const loadChatHistory = async () => {
    if (!work?.id || !chapter?.id) return;

    try {
      const response = await chatApi.getHistory(work.id, chapter.id);
      const history = response.data.messages;

      if (history.length > 0) {
        setMessages(history);
      } else {
        // Show initial greeting if no history
        const greeting: ChatMessage = {
          id: 'greeting',
          role: 'assistant',
          content: `你好！我是你的AI写作助手。我已经了解了你的作品《${work.title}》和当前章节《${chapter.title}》的内容。`,
          timestamp: new Date().toISOString()
        };
        setMessages([greeting]);
        await chatApi.saveMessage(work.id, chapter.id, 'assistant', greeting.content);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };

  if (messages.length === 0) {
    loadChatHistory();
  }
}, [work?.id, chapter?.id]);
```

### Message Rendering
```typescript
{messages.map((message) => (
  <div key={message.id} className="w-full">
    {/* Avatar and role indicator */}
    <div className={`flex items-center mb-2 ${
      message.role === 'user' ? 'justify-end' : 'justify-start'
    }`}>
      <div className={`flex items-center gap-2 ${
        message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
      }`}>
        <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
          message.role === 'assistant'
            ? 'bg-dark-primary'
            : 'bg-dark-secondary'
        }`}>
          {message.role === 'assistant' ? (
            <Bot size={12} className="text-white" />
          ) : (
            <User size={12} className="text-white" />
          )}
        </div>
        <span className="text-xs text-dark-text-muted">
          {message.role === 'assistant' ? 'AI助手' : '你'}
        </span>
      </div>
    </div>

    {/* Message content */}
    <div className={`w-full p-3 rounded-lg text-sm mb-1 ${
      message.role === 'user'
        ? 'bg-dark-primary text-white'
        : 'bg-dark-surface border border-dark-border text-dark-text'
    }`}>
      {message.role === 'assistant' ? (
        <div className="prose prose-sm prose-invert max-w-none">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      ) : (
        <div className="whitespace-pre-wrap">{message.content}</div>
      )}
    </div>
  </div>
))}
```

## Integration Patterns

### EditorPanel ↔ ChatPanel
The components are integrated through the parent EditorPage:

```typescript
// In EditorPage.tsx
const EditorPage = () => {
  const [content, setContent] = useState('');

  return (
    <div className="flex h-screen">
      <div className="flex-1">
        <EditorPanel
          content={content}
          onChange={setContent}
          work={work}
          chapter={chapter}
        />
      </div>
      <div className="w-96">
        <ChatPanel work={work} chapter={chapter} />
      </div>
    </div>
  );
};
```

### Shared Context
Both components have access to:
- Current work and chapter
- AI services API
- Authentication state
- UI notifications

### State Synchronization
- EditorPanel manages content state
- ChatPanel manages conversation state
- Both components save data independently
- Real-time updates through React Query invalidation

## Common Issues & Solutions

### 1. Marker System Issues
**See**: `frontend/docs/EDITOR_SYSTEM.md` for detailed marker documentation

### 2. Streaming Connection Problems
**Problem**: EventSource connections fail or timeout
**Debug**:
```typescript
// Add connection logging
const eventSource = aiApi.chatStream(/* ... */);
eventSource.onopen = () => console.log('Connection opened');
eventSource.onerror = (error) => console.error('Connection error:', error);
```

### 3. Content Synchronization
**Problem**: Content state gets out of sync between clean and marker versions
**Solution**: Always use the established pattern:
```typescript
// Always update both states together
setContentWithMarkers(newContentWithMarkers);
onChange(newContentWithMarkers);
```

### 4. Memory Leaks
**Problem**: EventSource connections not properly closed
**Solution**: Always clean up in useEffect:
```typescript
useEffect(() => {
  return () => {
    if (streamEventSource) {
      streamEventSource.close();
      setStreamEventSource(null);
    }
  };
}, [streamEventSource]);
```

## Testing Components

### Unit Testing
```typescript
// Test marker functionality
describe('MarkerUtils', () => {
  it('should wrap text with markers correctly', () => {
    const content = "Hello world";
    const noteId = 123;
    const wrapped = MarkerUtils.wrapWithMarkers(content, "world", noteId);
    const positions = MarkerUtils.findMarkers(wrapped, noteId);
    expect(positions).toBeTruthy();
  });
});

// Test EditorPanel
describe('EditorPanel', () => {
  it('should handle text selection', () => {
    render(<EditorPanel {...props} />);
    const textarea = screen.getByRole('textbox');

    // Simulate text selection
    fireEvent.select(textarea, { target: { selectionStart: 0, selectionEnd: 5 } });

    expect(screen.getByText('已选择:')).toBeInTheDocument();
  });
});
```

### Integration Testing
```typescript
// Test EditorPanel + ChatPanel integration
describe('Editor Integration', () => {
  it('should maintain content consistency during AI operations', async () => {
    render(<EditorPage />);

    // Type in editor
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Test content' } });

    // Trigger AI continue
    const continueButton = screen.getByText('AI续写');
    fireEvent.click(continueButton);

    // Verify content is preserved
    await waitFor(() => {
      expect(textarea.value).toContain('Test content');
    });
  });
});
```

These components form the core of the writing experience, providing seamless integration between text editing, AI assistance, and note-taking functionality.