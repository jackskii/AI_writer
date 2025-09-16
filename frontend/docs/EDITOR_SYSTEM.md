# Editor System Documentation

The heart of the AI Novel Writing Assistant - a sophisticated text editor with marker-based highlighting, real-time AI integration, and advanced note-taking capabilities.

## Architecture Overview

### Core Components
- **EditorPanel**: Main editor component with text input and AI integration
- **ChatPanel**: AI conversation interface with context awareness
- **NotesPanel**: Color-coded note management with text linking
- **MarkerUtils**: Invisible Unicode marker system for text-note relationships

## Marker-Based Text Highlighting System

### The Challenge
Traditional HTML-based text highlighting doesn't work in textarea elements. The system needed a way to:
- Link notes to specific text positions
- Preserve links through text editing
- Allow text highlighting without HTML markup
- Survive copy/paste operations

### The Solution: Invisible Unicode Markers
**File**: `frontend/src/components/editor/EditorPanel.tsx`

The system uses invisible Unicode characters as text markers:

```javascript
const MARKER_BASE_CHARS = [
  '\u200B', // Zero-width space
  '\u200C', // Zero-width non-joiner
  '\u200D', // Zero-width joiner
  '\u2060', // Word joiner (invisible)
  '\uFEFF', // Zero-width no-break space
];
```

### How Markers Work

#### 1. Marker Creation
```javascript
const MarkerUtils = {
  // Encode note ID as invisible characters
  encodeId: (noteId: number): string => {
    const chars = ['\uFEFF', '\u200C', '\u200D', '\u2060', '\u180E'];
    let result = '';
    let id = noteId;

    // Base-5 encoding using invisible characters
    while (id > 0) {
      result = chars[id % 5] + result;
      id = Math.floor(id / 5);
    }
    return result;
  },

  // Create start marker: Zero-width space + encoded ID + Zero-width non-joiner
  createStartMarker: (noteId: number): string => {
    const encoded = MarkerUtils.encodeId(noteId);
    return `\u200B${encoded}\u200C`;
  },

  // Create end marker: Zero-width joiner + encoded ID + Word joiner
  createEndMarker: (noteId: number): string => {
    const encoded = MarkerUtils.encodeId(noteId);
    return `\u200D${encoded}\u2060`;
  }
};
```

#### 2. Text Wrapping Process
When a note is created with linked text:

```javascript
wrapWithMarkers: (content: string, textToWrap: string, noteId: number): string => {
  const index = content.indexOf(textToWrap);
  if (index === -1) return content;

  const startMarker = MarkerUtils.createStartMarker(noteId);
  const endMarker = MarkerUtils.createEndMarker(noteId);

  return content.slice(0, index) +
         startMarker +
         textToWrap +
         endMarker +
         content.slice(index + textToWrap.length);
}
```

**Example**:
- Original: `"Hello world, this is a test."`
- After wrapping "world": `"Hello \u200B{encoded_id}\u200Cworld\u200D{encoded_id}\u2060, this is a test."`
- Display: Still shows as `"Hello world, this is a test."` (markers are invisible)

#### 3. Marker Detection and Navigation
```javascript
findMarkers: (content: string, noteId: number): { start: number; end: number } | null => {
  const startMarker = MarkerUtils.createStartMarker(noteId);
  const endMarker = MarkerUtils.createEndMarker(noteId);

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) return null;

  return {
    start: startIdx + startMarker.length,  // Position after start marker
    end: endIdx                            // Position before end marker
  };
}
```

### Critical Issues with Markers

#### Problem 1: Text Boundary Insertion
**Issue**: When users type at the exact end of highlighted text, the insertion can break markers.

**Example**:
- Text: `"Hello \u200B{id}\u200Cworld\u200D{id}\u2060!"`
- User places cursor after "world" and types "s"
- Result: `"Hello \u200B{id}\u200Cworlds\u200D{id}\u2060!"` ✅ (works)
- BUT if cursor is after end marker: `"Hello \u200B{id}\u200Cworld\u200D{id}\u2060s!"` ❌ (breaks link)

**Current Protection**:
```javascript
handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Backspace' || e.key === 'Delete') {
    // Check if deletion would affect markers
    const markerRegex = /\u200B[\uFEFF\u200C\u200D\u2060\u180E]+\u200C|\u200D[\uFEFF\u200C\u200D\u2060\u180E]+\u2060/g;
    // Prevent deletion and move cursor to safe position
  }
}
```

#### Problem 2: Marker Restoration Complexity
**Issue**: When markers break, restoring them is complex and error-prone.

**Current Approach**:
- Store previous content state
- Detect when markers are missing
- Attempt to restore based on stored positions
- **This approach is fragile and often fails**

#### Problem 3: Invisible Character Handling
**Issue**: Different text operations handle invisible characters differently.

**Examples**:
- Copy/paste may or may not preserve markers
- Find/replace operations can corrupt marker sequences
- Some text processing removes invisible characters

### Marker System Functions

#### Core Functions
```javascript
// Text wrapping and unwrapping
wrapWithMarkers(content, textToWrap, noteId)
removeMarkers(content, noteId)

// Marker detection and positioning
findMarkers(content, noteId)
hasMarkers(content, noteId)

// Content processing
stripAllMarkers(text)  // Remove all markers for display
getTextBetweenMarkers(content, noteId)

// Selection handling
adjustSelectionToExcludeMarkers(text, start, end)
```

#### Usage in Note Operations
```javascript
// Creating a note with text link
const handleCreateNote = () => {
  createNoteMutation.mutate({
    // ... note data
    linked_text: selectedTextForNote
  });
};

// On successful creation
onSuccess: (response) => {
  if (selectedTextForNote) {
    wrapTextWithMarkers(createdNote.id, selectedTextForNote);
  }
}

// Clicking a note to highlight linked text
const handleNoteClick = (note: Note) => {
  const markerPositions = MarkerUtils.findMarkers(contentWithMarkers, note.id);
  if (markerPositions) {
    textareaRef.current.setSelectionRange(markerPositions.start, markerPositions.end);
  }
}
```

## Auto-Save System

### Implementation
**File**: `frontend/src/pages/EditorPage.tsx`

```javascript
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
- **5-second interval**: Automatic saving every 5 seconds after changes
- **Visual feedback**: Shows "Saving..." status and last saved time
- **Conflict resolution**: Handles concurrent editing scenarios
- **Error handling**: Graceful failure with user notification

### Content State Management
```javascript
// Two content states for marker system
const [content, setContent] = useState('');                    // Clean content (no markers)
const [contentWithMarkers, setContentWithMarkers] = useState(''); // Content with markers

// Synchronization
useEffect(() => {
  // Strip markers for display but save with markers
  const cleanContent = MarkerUtils.stripAllMarkers(contentWithMarkers);
  setContent(cleanContent);
}, [contentWithMarkers]);
```

## AI Integration in Editor

### Continue Writing Feature
```javascript
const handleAIContinue = async () => {
  const eventSource = aiApi.continueStream(
    work.id,
    chapter.id,
    // onChunk - called for each piece of text
    (chunk: string) => {
      accumulatedContent += chunk;
      const newContent = startingContent + accumulatedContent;
      setContentWithMarkers(startingContentWithMarkers + accumulatedContent);
      onChange(newContentWithMarkers);
    },
    // onStart
    () => {
      setIsStreaming(true);
    },
    // onEnd
    () => {
      setIsStreaming(false);
    }
  );
};
```

### Suggestion System
- **Auto-trigger**: After 300 characters of new content
- **Manual trigger**: User can request suggestions for selected text
- **Integration**: Suggestions stored in database and linked to specific text positions

### Context Awareness
All AI operations automatically include:
- Work synopsis and metadata
- Current chapter content
- Triggered lore entries based on content keywords
- Recent chapter summaries for continuity

## Three-Panel Layout

### Panel Structure
**File**: `frontend/src/pages/EditorPage.tsx`

```javascript
<div className="flex h-screen bg-dark-bg">
  {/* Left Panel - Editor */}
  <div className="flex-1 flex flex-col">
    <EditorPanel
      content={content}
      onChange={handleContentChange}
      work={work}
      chapter={chapter}
    />
  </div>

  {/* Center Panel - Notes */}
  <div className="w-80 border-l border-dark-border">
    <NotesPanel
      notes={notes}
      onNoteClick={handleNoteClick}
    />
  </div>

  {/* Right Panel - Chat */}
  <div className="w-96 border-l border-dark-border">
    <ChatPanel
      work={work}
      chapter={chapter}
    />
  </div>
</div>
```

### Panel Responsibilities

#### Left Panel (Editor)
- Text editing with syntax highlighting
- Auto-save functionality
- AI continue writing
- Marker-based text highlighting
- Selection handling for notes

#### Center Panel (Notes)
- Color-coded note display
- Note creation/editing forms
- Text position linking
- Note filtering and search

#### Right Panel (Chat)
- AI conversation interface
- Chat history persistence
- Context-aware responses
- Streaming message display

## Common Issues & Solutions

### 1. Markers Breaking During Editing
**Problem**: Users type at text boundaries, breaking marker integrity.

**Current Protection**:
- `handleKeyDown` prevents deletion of marker characters
- Cursor positioning moves away from markers during problematic operations

**Limitations**: Protection is not foolproof and complex editing can still break markers.

### 2. Performance with Large Content
**Problem**: Marker scanning becomes slow with very large documents.

**Solution**: Consider implementing:
- Marker indexing for faster lookups
- Content chunking for better performance
- Lazy loading of notes and markers

### 3. Copy/Paste Marker Preservation
**Problem**: Copy/paste operations may not preserve markers correctly.

**Current Behavior**: Markers are preserved in most cases but may be lost in some text operations.

### 4. Marker Cleanup on Note Deletion
**Problem**: Deleted notes leave orphaned markers in content.

**Solution**: Already implemented in `deleteNoteMutation`:
```javascript
onSuccess: (_, deletedNote) => {
  const newContentWithMarkers = MarkerUtils.removeMarkers(contentWithMarkers, deletedNote.id);
  setContentWithMarkers(newContentWithMarkers);
  onChange(newContentWithMarkers);
}
```

## Development Guidelines

### When Modifying the Editor:
1. **NEVER** remove the AI Continue Writing functionality
2. **NEVER** remove the Update Link button for notes
3. **NEVER** remove streaming capabilities
4. Always test marker functionality after changes
5. Preserve the three-panel layout structure

### Testing Marker System:
```javascript
// Test marker creation
const testText = "Hello world";
const noteId = 123;
const wrapped = MarkerUtils.wrapWithMarkers(content, testText, noteId);
const positions = MarkerUtils.findMarkers(wrapped, noteId);
console.log('Marker positions:', positions);

// Test marker removal
const cleaned = MarkerUtils.removeMarkers(wrapped, noteId);
console.log('Original content restored:', cleaned === content);
```

### Debugging Markers:
The system includes extensive console logging:
```javascript
console.log('🔄 Wrapping text with markers for note', noteId);
console.log('✅ Found markers for note', noteId, 'at positions', start, '-', end);
console.log('❌ Markers not found for note', noteId);
```

Monitor these logs when debugging marker issues.

## Future Improvements

### Potential Enhancements:
1. **Marker Versioning**: Store marker versions to enable better restoration
2. **Alternative Linking**: Consider DOM-based highlighting for better reliability
3. **Performance Optimization**: Implement marker indexing for large documents
4. **Better Error Recovery**: Improved marker restoration algorithms
5. **Visual Indicators**: Show marker boundaries in debug mode

The editor system is complex but powerful, providing seamless integration between text editing, note-taking, and AI assistance while maintaining data integrity through the challenging marker system.