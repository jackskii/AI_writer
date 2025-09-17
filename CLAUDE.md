# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Novel Writing Assistant (AI 小说写作助手) - A sophisticated Chinese AI-powered novel writing tool with intelligent suggestions, real-time chat features, and comprehensive world-building management.

## 📚 Documentation Navigation

### Quick Access to All Documentation:

#### 🏗️ Architecture & Setup
- **[CLAUDE.md](./CLAUDE.md)** - This file (main architecture & guidelines)
- **[Backend README](./backend/README.md)** - Django backend architecture & setup
- **[API Documentation](./backend/api_docs.md)** - Complete REST API reference

#### 🎨 Frontend Systems
- **[Editor System](./frontend/docs/EDITOR_SYSTEM.md)** - Marker-based highlighting & editor
- **[Streaming System](./frontend/docs/STREAMING.md)** - SSE implementation & authentication
- **[Authentication](./frontend/docs/AUTHENTICATION.md)** - Token management & security

#### 🔧 Component Details
- **[Editor Components](./frontend/src/components/editor/README.md)** - EditorPanel & ChatPanel
- **[Services Layer](./frontend/src/services/README.md)** - API communication & WebSocket
- **[AI Services](./backend/apps/ai_services/README.md)** - DeepSeek integration & context building

#### 🚨 Critical Systems Documentation
- **Marker System**: `frontend/docs/EDITOR_SYSTEM.md` (explains the fragile text highlighting)
- **Streaming Auth**: `frontend/docs/STREAMING.md` (EventSource token workaround)
- **AI Context**: `backend/apps/ai_services/README.md` (intelligent context building)

---

## Development Commands

### Backend (Django)
```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8001  # Runs on http://localhost:8001

# Testing
python manage.py test

# Environment setup
cp .env.example .env
# Edit .env with DEEPSEEK_API_KEY and other settings
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev         # Runs on http://localhost:5173
npm run build       # Build for production
npm run lint        # ESLint checking
npm run preview     # Preview production build
```

### Docker Development
```bash
docker-compose up -d    # Full stack with PostgreSQL and Redis
```

## Architecture Overview

### Backend Structure (Django)
- **apps/works/**: Novel and chapter management (Work, Chapter, Act, LoreEntry models)
- **apps/ai_services/**: AI integration with DeepSeek API (4 specialized AI assistants)
- **apps/chat/**: WebSocket chat system and message history management
- **apps/notes/**: Advanced note-taking system with color coding and text position linking
- **apps/core/**: Shared utilities and base models

### Frontend Structure (React + TypeScript)
- **components/ui/**: Reusable UI components with Tailwind CSS
- **components/editor/**: Complex editor system with marker-based text highlighting
- **components/modals/**: Modal dialogs for various operations
- **pages/**: Main application pages (Auth, Home, WorkDetail, Editor)
- **stores/**: Zustand state management for UI and authentication
- **services/**: API communication layer with axios interceptors

### AI Integration Architecture
Four specialized AI assistants using DeepSeek API with different models and purposes:

1. **General Chat AI** (`deepseek-chat`) - Context-aware conversations about story
2. **Continuation AI** (`deepseek-chat`) - Story continuation based on context and guide
3. **Suggestion AI** (`deepseek-chat`) - Writing improvement suggestions
4. **Summary AI** (`deepseek-chat`) - Chapter summarization for context building

**Key AI Features:**
- **Context Building**: Automatically constructs context from work synopsis, triggered lore entries, and recent chapter summaries
- **Streaming Responses**: All AI interactions use Server-Sent Events (SSE) for real-time streaming
- **Token Management**: Configurable token limits for different AI operations
- **Fallback Mechanisms**: HTTP fallback when streaming fails

### Database Schema

**Core Models:**
- `Work`: Novel metadata (title, synopsis, author, computed statistics)
- `Chapter`: Chapter content with auto-save, AI summaries, and order management
- `Act`: Volume/book organization within works
- `LoreEntry`: World-building entries with trigger word matching system
- `Note`: Color-coded notes with text position linking using invisible markers
- `ChatMessage`: Chat history between user and AI
- `Suggestion`: AI-generated writing suggestions with targeting

**Important ID Strategy:**
- All models use `BigIntegerField` with `generate_large_id()` for collision-resistant IDs
- Large IDs enable safe concurrent operations and avoid ID conflicts

### Critical Features & Implementation Details

#### 1. Monaco Editor-Based Text Highlighting System
**Location**: `frontend/src/components/editor/EditorPanel.tsx`

The system has been migrated from marker-based to Monaco Editor's native decoration API for better stability:

**Monaco Editor Integration:**
```typescript
// Position tracking using character offsets
const offsetToPosition = (offset: number): { lineNumber: number; column: number } => {
  const lines = content.slice(0, offset).split('\n');
  return {
    lineNumber: lines.length,
    column: lines[lines.length - 1].length + 1
  };
};

// Monaco decoration for highlights
const addHighlight = (start: number, end: number, color: string) => {
  const decoration = {
    range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
    options: {
      inlineClassName: 'monaco-highlight',
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    }
  };
  currentDecorationsRef.current = editorRef.current.deltaDecorations(currentDecorationsRef.current, [decoration]);
};
```

**Key Features:**
- Notes are linked to text using position-based tracking (start/end character offsets)
- Monaco's native decoration API provides stable highlighting
- Position tracking survives text edits through intelligent adjustment
- Toggle behavior: click note to highlight, click again to unhighlight
- Monaco options configured to disable unwanted highlighting features

**Important Monaco Configuration:**
```typescript
options={{
  // Disable unwanted highlighting features
  matchBrackets: 'never',              // No bracket/quote matching
  selectionHighlight: false,           // No selection occurrence highlighting
  occurrencesHighlight: false,         // No text occurrence highlighting
  unicodeHighlight: {                  // No special character highlighting
    nonBasicASCII: false,
    invisibleCharacters: false,
    ambiguousCharacters: false
  }
}}
```

**Position Adjustment Logic:**
- Tracks content changes to adjust note positions dynamically
- Uses reference-based comparison to detect changes
- Adjusts positions based on change location and length difference
- Maintains note position map for efficient lookups

**Critical Improvements Over Marker System:**
- No invisible characters that can break or corrupt
- Uses Monaco's battle-tested decoration system
- Better performance and reliability
- Proper handling of line/column positions
- Toggle functionality for better UX

#### 2. Streaming Authentication System
**Location**: `backend/apps/ai_services/views.py`, `frontend/src/services/api.ts`

**The Problem**: EventSource (used for SSE) cannot send custom headers, breaking standard token authentication.

**The Solution**: Token passed via query parameters for streaming endpoints:

```javascript
// Frontend: Add token to EventSource URL
const authStorage = localStorage.getItem('auth-storage');
const token = parsedStorage?.state?.token;
if (token) {
  params.append('token', token);
}
const eventSource = new EventSource(`${API_BASE_URL}/ai/chat/stream/?${params.toString()}`);
```

```python
# Backend: Accept token via query params
token = request.GET.get('token')
if token:
    token_obj = Token.objects.get(key=token)
    user = token_obj.user
    request.user = user
```

#### 3. Three-Panel Layout System
**Location**: `frontend/src/pages/EditorPage.tsx`

The main writing interface consists of:
- **Left Panel**: Editor with syntax highlighting and auto-save
- **Center Panel**: Notes sidebar with color-coded annotations
- **Right Panel**: AI chat interface with context awareness

**Auto-save Implementation**: 5-second intervals with visual feedback and conflict resolution.

#### 4. AI Context Building
**Location**: `backend/apps/ai_services/services.py` (`ContextBuilder` class)

Context construction for AI requests includes:
- Work synopsis and metadata
- Triggered lore entries (based on content scanning for trigger words)
- Recent chapter summaries (last 5 chapters)
- Current chapter content

**Trigger Word System**: Automatically includes relevant world-building information when specific words appear in content.

### Environment Configuration

#### Backend (.env)
```bash
DEEPSEEK_API_KEY=your_api_key_here          # Required for AI functionality
DEEPSEEK_API_BASE=https://api.deepseek.com  # DeepSeek API endpoint
DEBUG=True                                   # Development mode
SECRET_KEY=your_secret_key                   # Django secret key
DATABASE_URL=sqlite:///db.sqlite3            # Database connection
ALLOWED_HOSTS=localhost,127.0.0.1            # Allowed hosts
```

#### Frontend (.env)
```bash
VITE_API_URL=http://127.0.0.1:8001/api      # Backend API URL
VITE_WS_HOST=localhost:8001                  # WebSocket host
```

### API Endpoints Structure

#### Core Data APIs
- `GET/POST /api/works/` - Work management
- `GET/POST/PATCH/DELETE /api/works/{id}/chapters/` - Chapter operations
- `PATCH /api/works/{id}/chapters/{id}/autosave/` - Auto-save endpoint
- `GET/POST/PATCH/DELETE /api/notes/` - Note management with filtering

#### AI Service APIs
- `POST /api/ai/chat/` - Standard AI chat (HTTP)
- `GET /api/ai/chat/stream/` - Streaming AI chat (SSE)
- `POST /api/ai/continue/` - Story continuation (HTTP)
- `GET /api/ai/continue/stream/` - Streaming continuation (SSE)
- `POST /api/ai/suggest/` - Writing suggestions
- `POST /api/ai/summarize/` - Chapter summarization
- `GET /api/ai/summarize/stream/` - Streaming summarization (SSE)

#### Chat System APIs
- `GET /api/chat/{work_id}/{chapter_id}/` - Get chat history
- `POST /api/chat/{work_id}/{chapter_id}/save/` - Save message
- `DELETE /api/chat/{work_id}/{chapter_id}/clear/` - Clear history

### Common Issues & Solutions

#### 1. Monaco Editor Highlighting Issues
**Problem**: Highlights not clearing properly or unwanted text highlighting
**Root Cause**: Monaco's built-in highlighting features (bracket matching, selection highlighting)
**Prevention**:
- Ensure all highlighting features are disabled in Monaco options
- Use proper click handlers that check highlight state
- Implement toggle behavior for note highlights

**Position Tracking Issues**:
**Problem**: Note positions becoming incorrect after text edits
**Root Cause**: Position offsets not being updated when content changes
**Solution**: Use the position adjustment logic that tracks content changes

#### 2. Streaming Authentication Failures
**Problem**: 401 errors on streaming endpoints
**Root Cause**: EventSource can't send Authorization headers
**Solution**: Use token query parameter authentication (already implemented)

#### 3. AI Context Too Large
**Problem**: AI requests failing due to context size
**Solution**:
- Limit recent chapter summaries (currently 5)
- Truncate large content sections
- Use intelligent lore entry filtering

#### 4. Auto-save Conflicts
**Problem**: Multiple auto-save requests creating conflicts
**Solution**: Debounce save operations and handle concurrent updates gracefully

### Development Guidelines

#### When Working on the Editor:
1. **NEVER** remove the AI Continue Writing section
2. **NEVER** remove the Update Link functionality for notes
3. **NEVER** remove streaming functionality without explicit request
4. Test Monaco Editor highlighting functionality after any changes
5. Preserve the three-panel layout structure
6. **CRITICAL**: Maintain Monaco Editor configuration that disables unwanted highlighting
7. Ensure position tracking logic remains intact for note linking
8. Test toggle behavior for note highlights

#### When Working on AI Services:
1. Always test both HTTP and streaming endpoints
2. Verify authentication works for both regular and streaming requests
3. Monitor token usage and context size
4. Test fallback mechanisms

#### When Working on Authentication:
1. Remember that streaming endpoints use query parameter tokens
2. Test both regular API calls and EventSource connections
3. Verify token refresh and logout scenarios

### Testing Approach

#### Backend Testing
```bash
cd backend
python manage.py test
```

#### Frontend Testing
```bash
cd frontend
npm run lint
npm run build  # Verify build succeeds
```

#### Integration Testing
1. Test complete user workflow: auth → create work → write content → AI interactions
2. Verify marker system doesn't break with various text editing scenarios
3. Test streaming authentication across all AI endpoints
4. Verify auto-save functionality under various conditions

### Debugging Tools

#### Backend Debugging
- Set `DEBUG=True` in `.env`
- Check Django logs for AI service errors
- Monitor database queries with Django Debug Toolbar

#### Frontend Debugging
- Browser DevTools Network tab for API calls
- Console logs for marker system debugging (extensive logging already in place)
- React DevTools for component state inspection

### Architecture Decisions & Rationale

#### Why Invisible Unicode Markers?
- Allows precise text-to-note linking without affecting content display
- Survives copy/paste operations
- Enables complex text highlighting without HTML markup

#### Why Server-Sent Events for AI?
- Real-time streaming improves user experience
- Better than WebSocket for one-way AI responses
- Simpler than polling approaches

#### Why Django Channels for Chat?
- Real-time bidirectional communication
- Integrates well with Django authentication
- Supports both HTTP and WebSocket protocols

This documentation should prevent future issues by clearly explaining how each critical system works and what to avoid when making changes.