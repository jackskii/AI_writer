# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Novel Writing Assistant (AI 小说写作助手) - A sophisticated Chinese AI-powered novel writing tool with intelligent suggestions, real-time chat features, and comprehensive world-building management.

## 📚 Documentation Structure

This project has two main documentation files:

- **[CLAUDE.md](./CLAUDE.md)** (this file) - Complete developer guide for AI assistants and developers
- **[README.md](./README.md)** - User guide with setup instructions and common commands

### Additional Technical References:

#### Backend Documentation
- **[backend/README.md](./backend/README.md)** - Django architecture, API endpoints, troubleshooting
- **[backend/api_docs.md](./backend/api_docs.md)** - Complete REST API reference
- **[backend/apps/ai_services/README.md](./backend/apps/ai_services/README.md)** - DeepSeek integration & AI services

#### Frontend Documentation
- **[frontend/README.md](./frontend/README.md)** - React/TypeScript architecture overview
- **[frontend/docs/EDITOR_SYSTEM.md](./frontend/docs/EDITOR_SYSTEM.md)** - Monaco editor & position-based highlighting
- **[frontend/docs/STREAMING.md](./frontend/docs/STREAMING.md)** - SSE implementation & EventSource auth workaround
- **[frontend/docs/AUTHENTICATION.md](./frontend/docs/AUTHENTICATION.md)** - Token management & security
- **[frontend/src/components/editor/README.md](./frontend/src/components/editor/README.md)** - EditorPanel & ChatPanel components
- **[frontend/src/services/README.md](./frontend/src/services/README.md)** - API communication layer

#### Critical Systems (Must Read Before Editing)
- **Text Editor**: `frontend/docs/EDITOR_SYSTEM.md` - Position-based note tracking system (fragile)
- **Streaming Auth**: `frontend/docs/STREAMING.md` - EventSource token workaround (essential)
- **AI Context**: `backend/apps/ai_services/README.md` - Context building system
- **API Keys**: See "API Key Architecture" section below - Per-user encrypted storage

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
# Default configuration works out of the box
# Note: API keys are configured per-user in account settings after login
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

### Docker Development (Recommended)

Docker provides the easiest way to run the full stack with all dependencies configured.

#### Quick Start with Docker

```bash
# 1. Copy environment variables (optional - defaults work)
cp .env.example .env
# Note: API keys are configured per-user in account settings

# 2. Start all services (first time will build images)
docker-compose up -d

# 3. Check service status
docker-compose ps

# 4. View logs
docker-compose logs -f              # All services
docker-compose logs -f backend      # Backend only
docker-compose logs -f frontend     # Frontend only

# 5. Stop services
docker-compose down                 # Stop containers
docker-compose down -v              # Stop and remove volumes (data will be lost)
```

#### Services and Ports

After running `docker-compose up -d`:
- **Frontend**: http://localhost:3000 (Nginx serving React app)
- **Backend API**: http://localhost:8001 (Django + Daphne)
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

#### Docker Management Commands

```bash
# Rebuild after code changes
docker-compose up -d --build

# Restart specific service
docker-compose restart backend
docker-compose restart frontend

# Execute commands in containers
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py createsuperuser
docker-compose exec backend python manage.py shell
docker-compose exec postgres psql -U novel_user -d novel_ai_db

# View resource usage
docker-compose stats

# Clean up everything (including volumes)
docker-compose down -v
docker system prune -a
```

#### Data Persistence

All data is stored in Docker volumes:
- `postgres_data`: Database data (persists across restarts)
- `redis_data`: Redis cache data
- `static_volume`: Django static files
- `media_volume`: User uploaded media

To backup database:
```bash
docker-compose exec postgres pg_dump -U novel_user novel_ai_db > backup.sql
```

To restore database:
```bash
cat backup.sql | docker-compose exec -T postgres psql -U novel_user -d novel_ai_db
```

#### Environment Variables

The root `.env` file controls all Docker services:

```bash
# Database
DB_NAME=novel_ai_db
DB_USER=novel_user
DB_PASSWORD=novel_password

# Backend
BACKEND_PORT=8001
SECRET_KEY=your-secret-key
DEEPSEEK_API_BASE=https://api.deepseek.com/v1

# Frontend
FRONTEND_PORT=3000
VITE_API_URL=http://localhost:8001/api
```

#### Troubleshooting Docker

**Services won't start:**
```bash
docker-compose logs backend
docker-compose logs postgres
```

**Database connection issues:**
```bash
# Check if postgres is ready
docker-compose exec postgres pg_isready -U novel_user

# Restart backend after postgres is ready
docker-compose restart backend
```

**Frontend can't reach backend:**
- Check VITE_API_URL in .env matches BACKEND_PORT
- Rebuild frontend: `docker-compose up -d --build frontend`

**Clean slate (removes all data):**
```bash
docker-compose down -v
docker system prune -a
docker-compose up -d --build
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
- **components/editor/**: Text editor system with position-based note tracking
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
- `Note`: Color-coded notes with text position linking using character offsets
- `ChatMessage`: Chat history between user and AI
- `Suggestion`: AI-generated writing suggestions with targeting

**Important ID Strategy:**
- All models use `BigIntegerField` with `generate_large_id()` for collision-resistant IDs
- Large IDs enable safe concurrent operations and avoid ID conflicts

### Critical Features & Implementation Details

#### 1. Position-Based Text Editor & Note System
**Location**: `frontend/src/components/editor/EditorPanel.tsx`

The system uses a **native HTML textarea** with position-based note tracking for simplicity and reliability.

**Editor Implementation:**
```typescript
// Native textarea with position tracking
const editorRef = useRef<HTMLTextAreaElement | null>(null);

// Highlight text using native selection API
const highlightText = (start: number, end: number) => {
  if (!editorRef.current) return;
  editorRef.current.setSelectionRange(start, end);
  editorRef.current.focus();
};

// Handle text selection for note creation
onSelect={(e) => {
  const target = e.target as HTMLTextAreaElement;
  const start = target.selectionStart;
  const end = target.selectionEnd;

  if (start !== end) {
    const selectedText = target.value.slice(start, end);
    setSelectedText(selectedText);
    setSelectionStart(start);
    setSelectionEnd(end);
  }
}}
```

**Key Features:**
- Notes are linked to text using character offsets (start/end positions)
- Native textarea selection API for highlighting
- Position tracking automatically adjusts when text is edited
- Click note to highlight corresponding text (10-second auto-clear)
- Lightweight and fast - no heavy editor dependencies

**Position Tracking System:**
```typescript
// Track note positions dynamically
const [notePositions, setNotePositions] = useState<Map<number, {start: number, end: number}>>(new Map());

// Update positions when content changes
useEffect(() => {
  if (content === previousContentRef.current) return;

  const oldContent = previousContentRef.current;
  const newContent = content;

  // Find change location
  let changeStart = 0;
  while (changeStart < Math.min(oldContent.length, newContent.length) &&
         oldContent[changeStart] === newContent[changeStart]) {
    changeStart++;
  }

  const lengthDiff = newContent.length - oldContent.length;

  // Adjust all note positions after change
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

**Position Adjustment Logic:**
- Tracks content changes by comparing with previous version
- Finds exact change location using character comparison
- Adjusts all note positions that come after the change
- Maintains position map in component state
- Survives edits, pastes, and AI continuations

**Benefits of Native Textarea:**
- ✅ No heavy dependencies (Monaco Editor removed)
- ✅ Simple and predictable behavior
- ✅ Fast rendering and minimal bundle size
- ✅ Native browser APIs for selection/highlighting
- ✅ No complex decoration/widget systems
- ✅ Easy to debug and maintain

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
# Note: API keys are stored per-user in UserSettings model
DEEPSEEK_API_BASE=https://api.deepseek.com/v1  # DeepSeek API endpoint
DEBUG=True                                      # Development mode
SECRET_KEY=your_secret_key                      # Django secret key
DATABASE_URL=sqlite:///db.sqlite3               # Database connection
ALLOWED_HOSTS=localhost,127.0.0.0.1             # Allowed hosts
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

#### 1. Text Editor & Position Tracking Issues
**Problem**: Note positions becoming incorrect after text edits
**Root Cause**: Position offsets not being updated when content changes
**Solution**:
- The position adjustment logic automatically tracks content changes
- Uses `useEffect` to detect changes and recalculate positions
- Compares previous content with current content to find change location

**Highlight Clearing**:
**Problem**: Highlights not clearing after clicking note
**Root Cause**: Timeout not being cleared properly
**Solution**:
- Store timeout ref: `highlightTimeoutRef.current = setTimeout(...)`
- Clear existing timeout before setting new one
- Auto-clear after 10 seconds

**Selection Issues**:
**Problem**: Text selection not working in certain browsers
**Root Cause**: Native textarea selection API differences
**Solution**: Use standardized `setSelectionRange(start, end)` method

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
4. Test text highlighting and note functionality after any changes
5. Preserve the three-panel layout structure
6. **CRITICAL**: Maintain position tracking logic that adjusts note positions on content changes
7. Ensure position adjustment `useEffect` remains intact for note linking
8. Test note highlighting behavior (click to highlight, 10s auto-clear)
9. Don't replace textarea with complex editor components without discussion

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

## API Key Architecture (Per-User Storage)

### Implementation Details

API keys are stored **per-user** in the UserSettings model, not in environment variables.

**Model**: `backend/apps/user_auth/models.py`
```python
class UserSettings(models.Model):
    user = models.OneToOneField(User, related_name='settings')
    _encrypted_deepseek_api_key = models.TextField(blank=True, default='')

    @property
    def deepseek_api_key(self):
        # Decrypts and returns API key

    @deepseek_api_key.setter
    def deepseek_api_key(self, value):
        # Encrypts and stores API key using Fernet
```

**Key Retrieval**: `backend/apps/ai_services/views.py`, `backend/apps/works/views.py`
```python
def get_user_api_key(user):
    try:
        settings = user.settings
        api_key = settings.deepseek_api_key
        if not api_key:
            raise ValueError("Please configure your DeepSeek API key in account settings")
        return api_key
    except UserSettings.DoesNotExist:
        raise ValueError("User settings not found")

# Usage in views
api_key = get_user_api_key(request.user)
ai_service = AIService(api_key=api_key)
```

**AI Service Integration**: `backend/apps/ai_services/services.py`
```python
class DeepSeekAPI:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or getattr(settings, 'DEEPSEEK_API_KEY', None)
        if not self.api_key:
            raise ValueError("API密钥未配置。请在设置中配置您的DeepSeek API密钥。")

        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=settings.DEEPSEEK_API_BASE
        )

class AIService:
    def __init__(self, api_key: str = None):
        self.deepseek = DeepSeekAPI(api_key=api_key)
```

**Security**:
- Encryption: Fernet symmetric encryption
- Storage: Database only, never in logs or .env
- Display: Masked (sk-...****...)
- Isolation: Each user has separate encrypted key

**IMPORTANT**: Never add `DEEPSEEK_API_KEY` to environment variables or .env files. This is now a per-user setting.

## Commit Guidelines

Keep commits concise and descriptive:
- Use imperative mood: `fix textbox ui`, `add user settings`, `backend: refresh lore triggers`
- Group related changes in single commit
- Skip drive-by formatting unless specifically requested
- Reference issue IDs when relevant
- For PRs: include change description, verification commands, UI evidence

## Testing Workflow

Before completing any task:

1. **Run Linters**
```bash
# Frontend
cd frontend && npm run lint

# Backend (if configured)
cd backend && python manage.py check
```

2. **Run Tests**
```bash
# Backend
cd backend && python manage.py test

# Frontend (if configured)
cd frontend && npm test
```

3. **Verify Functionality**
- Test the specific feature changed
- Check related features aren't broken
- Verify in browser for UI changes
- Test API endpoints with curl/Postman for backend changes

4. **Check System Reminders**
- Fix all diagnostics shown in system reminder messages
- Address any errors or warnings

This documentation should prevent future issues by clearly explaining how each critical system works and what to avoid when making changes.