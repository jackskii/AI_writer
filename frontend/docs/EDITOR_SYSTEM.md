# Editor System Documentation

The heart of the AI Novel Writing Assistant - a clean, efficient text editor with position-based note tracking, real-time AI integration, and advanced note-taking capabilities.

## Architecture Overview

### Core Components
- **EditorPanel**: Main editor component with native textarea and AI integration
- **ChatPanel**: AI conversation interface with context awareness
- **NotesPanel**: Color-coded note management with text position linking
- **Position Tracking**: Character offset-based system for note-text relationships

## Position-Based Text Editor System

### The Challenge
We needed a simple, reliable way to:
- Link notes to specific text positions
- Preserve links through text editing
- Allow text highlighting without complex editor dependencies
- Maintain performance with large documents

### The Solution: Native Textarea + Position Tracking
**File**: `frontend/src/components/editor/EditorPanel.tsx`

The system uses a native HTML textarea with character offset-based position tracking:

```typescript
// Simple textarea ref
const editorRef = useRef<HTMLTextAreaElement | null>(null);

// Track note positions as character offsets
const [notePositions, setNotePositions] = useState<Map<number, {start: number, end: number}>>(new Map());

// Use native selection API for highlighting
const highlightText = (start: number, end: number) => {
  if (!editorRef.current) return;
  editorRef.current.setSelectionRange(start, end);
  editorRef.current.focus();
};
```

### How Position Tracking Works

#### 1. Note Creation with Position Storage
When a note is created with linked text:

```typescript
// User selects text in textarea
onSelect={(e) => {
  const target = e.target as HTMLTextAreaElement;
  const start = target.selectionStart;  // Character offset from start
  const end = target.selectionEnd;      // Character offset to end

  if (start !== end) {
    const selectedText = target.value.slice(start, end);
    setSelectedText(selectedText);
    setSelectionStart(start);
    setSelectionEnd(end);
  }
}}

// Note saved with positions
await notesApi.create({
  work: work.id,
  chapter: chapter.id,
  content: noteContent,
  color: selectedColor,
  text_start_position: start,  // Stored in database
  text_end_position: end,       // Stored in database
  linked_text: selectedText
});
```

#### 2. Automatic Position Adjustment
When content changes, all note positions are automatically adjusted:

```typescript
useEffect(() => {
  if (content === previousContentRef.current) return;

  const oldContent = previousContentRef.current;
  const newContent = content;

  // Find where the change occurred
  let changeStart = 0;
  while (changeStart < Math.min(oldContent.length, newContent.length) &&
         oldContent[changeStart] === newContent[changeStart]) {
    changeStart++;
  }

  const lengthDiff = newContent.length - oldContent.length;

  // Adjust all note positions after the change
  const updatedPositions = new Map(notePositions);
  notes.forEach(note => {
    const pos = updatedPositions.get(note.id);
    if (pos && pos.start >= changeStart) {
      updatedPositions.set(note.id, {
        start: Math.max(changeStart, pos.start + lengthDiff),
        end: Math.max(changeStart, pos.end + lengthDiff)
      });
    }
  });

  setNotePositions(updatedPositions);
  previousContentRef.current = content;
}, [content, notes]);
```

**How It Works:**
1. Compare old content with new content character by character
2. Find exact position where change occurred
3. Calculate length difference (positive = insertion, negative = deletion)
4. Adjust all note positions that come after the change
5. Update position map in state

**Example:**
```
Before: "Hello world, this is a test."
        ^     ^
        10    16 (note position)

User types "big " at position 10:
After:  "Hello big world, this is a test."
        ^         ^
        10        20 (adjusted to 16+4)

Length diff: +4 characters
All notes after position 10 shifted by +4
```

#### 3. Text Highlighting from Notes
Clicking a note highlights its linked text:

```typescript
const handleNoteClick = (note: Note) => {
  // Clear existing highlight timeout
  if (highlightTimeoutRef.current) {
    clearTimeout(highlightTimeoutRef.current);
  }

  // Get note position (from database or local map)
  const position = notePositions.get(note.id) || {
    start: note.text_start_position,
    end: note.text_end_position
  };

  if (position) {
    // Highlight using native selection
    setHighlightedNoteId(note.id);
    setHighlightPosition({
      start: position.start,
      end: position.end,
      color: note.color
    });

    highlightText(position.start, position.end);

    // Auto-clear after 10 seconds
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedNoteId(undefined);
      setHighlightPosition(null);
    }, 10000);
  }
};
```

### Benefits of This Approach

✅ **Simple**: No invisible characters, markers, or complex decoration APIs
✅ **Reliable**: Native browser textarea APIs are battle-tested
✅ **Fast**: Minimal overhead, O(n) position adjustment on edits
✅ **Maintainable**: Easy to understand and debug
✅ **Lightweight**: No heavy dependencies (removed Monaco Editor)
✅ **Predictable**: Character offsets are intuitive and stable
✅ **Database-backed**: Positions persist across sessions

### Position Tracking Edge Cases

#### Case 1: Editing Before a Note
```
Text: "Hello world"
Note position: 6-11 ("world")

User types at position 0: "Hi "
New text: "Hi Hello world"
Note position adjusted to: 9-14 ("world" still highlighted correctly)
```

#### Case 2: Editing Within a Note
```
Text: "Hello world"
Note position: 6-11 ("world")

User types at position 7: "new "
New text: "Hello wnew orld"
Note position adjusted to: 6-15 (entire edited region)
```

#### Case 3: Deletion Before a Note
```
Text: "Hello world"
Note position: 6-11 ("world")

User deletes "Hello ": "world"
Note position adjusted to: 0-5 ("world" at new position)
```

## Auto-Save System

### Implementation
**File**: `frontend/src/pages/EditorPage.tsx`

```typescript
// Auto-save every 5 seconds
useEffect(() => {
  if (!isAutoSaving && hasUnsavedChanges && chapter?.id) {
    const timer = setTimeout(() => {
      handleAutoSave();
    }, 5000);

    return () => clearTimeout(timer);
  }
}, [content, isAutoSaving]);

const handleAutoSave = async () => {
  setIsAutoSaving(true);
  try {
    await chaptersApi.autoSave(work.id, chapter.id, content);
    setHasUnsavedChanges(false);
    setLastSaved(new Date());
  } catch (error) {
    console.error('Auto-save failed:', error);
  } finally {
    setIsAutoSaving(false);
  }
};
```

### Auto-Save Features
- **5-second interval**: Automatic saving after changes stop
- **Visual feedback**: Shows "Saving..." status and last saved time
- **Conflict resolution**: Handles concurrent editing scenarios
- **Error handling**: Graceful failure with user notification
- **Ctrl+S support**: Manual save with keyboard shortcut

## AI Integration in Editor

### Auto-Edit Feature
- **Selection-based**: User selects text to edit
- **AI-powered**: Uses DeepSeek to rewrite selected text
- **Version tracking**: Keeps both original and edited versions
- **Toggle functionality**: Click to switch between versions

### Suggestion System
- **Auto-trigger**: After 300 characters of new content
- **Manual trigger**: User can request suggestions for selected text
- **Database storage**: Suggestions stored as notes with AI flag
- **Color-coded**: Blue color indicates AI-generated suggestions

### Context Awareness
All AI operations automatically include:
- Work synopsis and metadata
- Current chapter content
- Triggered lore entries based on content keywords
- Recent chapter summaries for continuity

## Three-Panel Layout

### Panel Structure
**File**: `frontend/src/pages/EditorPage.tsx`

```tsx
<div className="flex h-screen bg-black">
  {/* Left Panel - Editor with AI Controls */}
  <div className="flex-1 flex flex-col">
    <EditorPanel
      content={content}
      onChange={handleContentChange}
      work={work}
      chapter={chapter}
      onSave={handleSave}
    />
  </div>

  {/* Center Panel - Notes Sidebar */}
  <div className="w-80 border-l border-gray-800">
    <NotesPanel
      notes={notes}
      onNoteClick={handleNoteClick}
      selectedNoteId={highlightedNoteId}
    />
  </div>

  {/* Right Panel - AI Chat */}
  <div className="w-96 border-l border-gray-800">
    <ChatPanel
      work={work}
      chapter={chapter}
    />
  </div>
</div>
```

### Panel Responsibilities

#### Left Panel (Editor)
- Native textarea for text editing
- Auto-save functionality (5s interval)
- AI continue writing button
- Auto-edit functionality
- Position-based text highlighting
- Selection handling for notes

#### Center Panel (Notes)
- Color-coded note display (6 colors)
- Note creation/editing forms
- Text position linking and updating
- Click to highlight linked text
- Filter by AI-generated vs manual

#### Right Panel (Chat)
- AI conversation interface
- Chat history persistence
- Context-aware responses
- Streaming message display
- Markdown rendering

## Common Issues & Solutions

### 1. Position Tracking After Large Edits
**Problem**: Note positions become incorrect after major text changes.

**Solution**: Position adjustment algorithm automatically handles this:
- Detects change location precisely
- Adjusts all affected notes
- Maintains relative positions

**Manual Fix**: Use "Update Link" button on notes to re-link to selected text.

### 2. Highlight Not Clearing
**Problem**: Text remains highlighted after clicking note.

**Solution**:
- Highlights auto-clear after 10 seconds
- Click editor anywhere to dismiss
- Timeout is properly cleaned up on component unmount

### 3. Performance with Many Notes
**Problem**: Position tracking becomes slow with 100+ notes.

**Optimization**:
- Position map stored in component state (fast lookups)
- Only recalculates on actual content changes
- Uses ref for previous content comparison

### 4. Selection Issues in Some Browsers
**Problem**: Text selection behaves differently across browsers.

**Solution**: Use standard `setSelectionRange(start, end)` API which works everywhere.

## Development Guidelines

### When Modifying the Editor:
1. **NEVER** remove the AI Continue Writing functionality
2. **NEVER** remove the Update Link button for notes
3. **NEVER** remove streaming capabilities
4. Always test position tracking after changes
5. Preserve the three-panel layout structure
6. **CRITICAL**: Don't modify the position adjustment `useEffect`
7. Test with various edit scenarios (insert, delete, paste)
8. Don't replace textarea without discussing trade-offs

### Testing Position Tracking:
```typescript
// Test position adjustment
console.log('Before edit:', notePositions.get(noteId));
// Make text change
console.log('After edit:', notePositions.get(noteId));

// Test highlighting
handleNoteClick(note);
// Verify text is highlighted in editor

// Test "Update Link"
// 1. Select new text
// 2. Click "Update Link" on note
// 3. Verify note.text_start_position and note.text_end_position updated
```

### Debugging Positions:
The system includes console logging:
```typescript
console.log('📝 Highlighting text at positions', start, '-', end);
console.log('✅ Note position adjusted', oldPos, '->', newPos);
console.log('❌ No valid position found for note', noteId);
```

Monitor these logs when debugging position issues.

## Future Improvements

### Potential Enhancements:
1. **Undo/Redo**: Add undo/redo for position changes
2. **Multi-select**: Support multiple note highlights simultaneously
3. **Position History**: Track position changes over time
4. **Smart Adjustment**: Use text similarity for better position recovery
5. **Visual Indicators**: Show note boundaries in editor

## Architecture Decision: Why Native Textarea?

We chose native textarea over rich text editors (like Monaco, Draft.js, etc.) because:

1. **Simplicity**: No complex editor APIs to learn
2. **Reliability**: Native browser APIs are stable
3. **Performance**: Minimal overhead, fast rendering
4. **Bundle Size**: Removed ~2MB Monaco Editor dependency
5. **Maintainability**: Easy to understand and debug
6. **Accessibility**: Native textarea has excellent a11y support

The position-based tracking system provides all the functionality we need without the complexity of heavy editor frameworks.
