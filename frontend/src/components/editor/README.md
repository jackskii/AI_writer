# Editor Components Documentation

Documentation for `EditorPanel`, `ChatPanel`, and their integration with the position-based note system.

For full architecture details, see [`frontend/docs/EDITOR_SYSTEM.md`](../../../docs/EDITOR_SYSTEM.md).

## EditorPanel Component

**File**: `frontend/src/components/editor/EditorPanel.tsx`

### Overview

The EditorPanel is the core text editing component. It provides:

- Native `<textarea>` editing with a single `content` string (no embedded markers)
- Position-based note linking (`text_start_position`, `text_end_position`, `linked_text`)
- Native selection highlighting when clicking notes (`setSelectionRange`)
- Auto-edit via `AutoEditModal` and `aiApi.autoEditStream`
- AI suggestions for selected text
- Auto-save integration via parent `EditorPage`

### Props Interface

```typescript
interface EditorPanelProps {
  content: string;
  onChange: (content: string) => void;
  work: Work;
  chapter: Chapter;
  onSave?: (content?: string) => void;
  isMobile?: boolean;
  autoEditTriggerKey?: number;
}
```

### Key State

```typescript
const editorRef = useRef<HTMLTextAreaElement | null>(null);
const [notePositions, setNotePositions] = useState<Map<number, { start: number; end: number }>>(new Map());
const [highlightedNoteId, setHighlightedNoteId] = useState<number | undefined>();
const [selectedText, setSelectedText] = useState('');
const [selectionStart, setSelectionStart] = useState(0);
const [selectionEnd, setSelectionEnd] = useState(0);
```

### Note Position Tracking

Notes store character offsets in the database. The editor keeps an in-memory `notePositions` map and adjusts offsets when content changes via `adjustPositions()`.

#### Creating a note with linked text

```typescript
createNoteMutation.mutate({
  work: work.id,
  chapter: chapter.id,
  content: newNoteContent,
  color: selectedColor,
  note_type: 'user',
  text_start_position: selectedTextForNote ? noteSelectionStart : undefined,
  text_end_position: selectedTextForNote ? noteSelectionEnd : undefined,
  linked_text: selectedTextForNote || undefined,
});
```

#### Highlighting linked text on note click

```typescript
const handleNoteClick = (note: Note) => {
  const position = notePositions.get(note.id);
  if (position && position.end <= content.length) {
    setHighlightedNoteId(note.id);
    editorRef.current?.setSelectionRange(position.start, position.end);
    editorRef.current?.focus();
  }
};
```

### Auto-Edit Streaming

Auto-edit opens `AutoEditModal`, which streams results through `aiApi.autoEditStream`. Accepted edits replace the selection or insert at the cursor; note positions are adjusted automatically.

```typescript
await aiApi.autoEditStream(
  work.id,
  chapter.id,
  originalText,
  context,
  onChunk,
  onStart,
  onEnd,
  onError,
  signal
);
```

### Textarea

The textarea binds directly to `content` — no stripping or marker encoding:

```jsx
<textarea
  ref={editorRef}
  value={content}
  onChange={(e) => onChange(e.target.value)}
  onSelect={handleTextSelect}
  onClick={handleEditorClick}
/>
```

## ChatPanel Component

**File**: `frontend/src/components/editor/ChatPanel.tsx`

Provides chapter-scoped AI chat with SSE streaming via `aiApi.chatStream`, history persistence, and markdown rendering for assistant messages.

See [`frontend/docs/STREAMING.md`](../../../docs/STREAMING.md) for streaming implementation details.

## Integration (EditorPage)

```typescript
<EditorPanel
  content={editorContent}
  onChange={handleContentChange}
  work={work}
  chapter={chapter}
  onSave={handleManualSave}
/>
<ChatPanel work={work} chapter={chapter} />
```

## Common Issues

### Note highlight not showing

- Verify `notePositions` has a valid entry for the note ID
- Positions are character offsets; they drift if content changes outside `adjustPositions`
- See `EDITOR_SYSTEM.md` for position adjustment behavior

### Streaming connection problems

Ensure the auth token is passed (query param for EventSource). Check browser console for `EventSource` errors. HTTP fallback is used for chat when streaming fails.

### EventSource cleanup

Close connections in `useEffect` cleanup to avoid leaks when navigating away from the editor.
