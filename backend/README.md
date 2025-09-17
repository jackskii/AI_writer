# AI Writer Backend Documentation

✅ **v1.0 Complete** - Django REST API backend for AI Novel Writing Assistant with sophisticated AI integration, WebSocket support, and advanced note-taking features.

## 🎉 Project Status: All Core Features Implemented

This backend now supports all initially planned features:
- ✅ Complete AI integration with streaming support
- ✅ Monaco Editor position-based note linking (replaces marker system)
- ✅ Authentication for both HTTP and EventSource endpoints
- ✅ Duplicate text detection and removal for AI continuation
- ✅ Comprehensive world-building and context management
- ✅ Real-time chat and collaboration features

## Architecture Overview

### Django Apps Structure

#### apps/works/
**Purpose**: Core novel and content management
**Key Models**:
- `Work`: Novel metadata and statistics
- `Chapter`: Individual chapter content with auto-save
- `Act`: Volume/book organization
- `LoreEntry`: World-building entries with trigger word system

**Critical Features**:
- Large ID generation with `generate_large_id()` for collision resistance
- Auto-calculated word counts and statistics
- Trigger word matching for context-aware AI integration

#### apps/ai_services/
**Purpose**: DeepSeek API integration and AI service management
**Key Components**:
- `DeepSeekAPI`: AsyncOpenAI client wrapper with fallback
- `ContextBuilder`: Intelligent context construction for AI requests
- `AIService`: High-level AI operations (chat, continue, suggest, summarize)

**Streaming Implementation**:
- Uses `AsyncOpenAI` for real-time response streaming
- Server-Sent Events (SSE) for frontend communication
- Custom authentication via query parameters for EventSource compatibility

#### apps/chat/
**Purpose**: Chat history management and WebSocket support
**Key Models**:
- `ChatMessage`: User-AI conversation history
- `AIRequest`: Request tracking and analytics

**Features**:
- Per-chapter chat history isolation
- Message persistence and retrieval
- WebSocket integration for real-time chat

#### apps/notes/
**Purpose**: Advanced note-taking with text position linking
**Key Models**:
- `Note`: Color-coded notes with Monaco Editor position tracking
- Text start/end position storage for character-offset based linking
- AI-generated vs user-created note classification

**Monaco Integration**: Position tracking uses character offsets that survive text edits, replacing the previous invisible marker system.

#### apps/core/
**Purpose**: Shared utilities and base functionality
- Custom authentication and permissions
- Shared model utilities
- Common validators and helpers

## AI Integration Deep Dive

### DeepSeek API Integration
**File**: `apps/ai_services/services.py`

```python
class DeepSeekAPI:
    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=settings.DEEPSEEK_API_BASE
        )

    async def chat_completion_stream(self, messages, model="deepseek-chat", max_tokens=2000):
        # Streaming implementation for real-time responses
```

**Key Features**:
- **Async/Await**: All AI operations are asynchronous for better performance
- **Streaming Support**: Real-time response streaming using AsyncOpenAI
- **Fallback Logic**: Mock responses when API key is not configured
- **Error Handling**: Comprehensive error handling and logging

### Context Building System
**File**: `apps/ai_services/services.py` - `ContextBuilder` class

The context builder intelligently constructs AI context from multiple sources:

```python
@staticmethod
def build_context(chapter: Chapter, include_current_content: bool = True) -> Dict:
    context = {
        "synopsis": work.synopsis,
        "work_title": work.title,
        "chapter_title": chapter.title,
        "current_chapter_content": chapter.content if include_current_content else "",
        "lore_entries": triggered_lore_entries,
        "recent_chapter_summaries": recent_summaries
    }
```

**Context Components**:
1. **Work Synopsis**: Overall story outline and setting
2. **Triggered Lore Entries**: World-building entries triggered by content keywords
3. **Recent Chapter Summaries**: Last 5 chapters for narrative continuity
4. **Current Content**: The text being worked on

**Trigger Word System**:
- Scans content for keywords defined in `LoreEntry.all_triggers`
- Automatically includes relevant world-building information
- Case-insensitive matching for natural language processing

### Four AI Service Types

#### 1. Chat AI (`chat_with_ai_stream`)
- **Model**: `deepseek-chat`
- **Purpose**: Context-aware conversation about story
- **Features**: Chat history support, streaming responses
- **Prompt**: Optimized for helpful writing assistance

#### 2. Continuation AI (`continue_writing_stream`)
- **Model**: `deepseek-chat`
- **Purpose**: Story continuation from current text
- **Features**: Configurable token count, writing guide support
- **Special Handling**: Seamless text continuation without formatting

#### 3. Suggestion AI (`generate_suggestions`)
- **Model**: `deepseek-chat`
- **Purpose**: Writing improvement suggestions
- **Features**: JSON-formatted responses, database persistence
- **Target**: Can target specific text sections

#### 4. Summary AI (`generate_summary_stream`)
- **Model**: `deepseek-chat`
- **Purpose**: Chapter summarization for context building
- **Features**: Automatic chapter summary generation
- **Integration**: Summaries stored in `Chapter.summary` field

## Streaming Authentication System

### The Challenge
EventSource (used for SSE) cannot send custom headers, breaking standard Django REST Framework token authentication.

### The Solution
**File**: `apps/ai_services/views.py`

```python
@csrf_exempt
def ai_chat_stream(request):
    # Accept token via query parameter for EventSource compatibility
    token = request.GET.get('token')
    if token:
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

**Security Considerations**:
- Token in query string is logged in server access logs
- HTTPS required in production to prevent token exposure
- Token validation still uses Django's built-in Token model

### Streaming Response Format
All streaming endpoints use consistent SSE format:

```javascript
// Message types sent via SSE
{
  "type": "start",     // Stream beginning
  "type": "chunk",     // Content piece
  "content": "text"
}
{
  "type": "end",       // Stream completion
  "type": "error",     // Error occurred
  "message": "error"
}
```

## Database Schema Details

### Work Model
```python
class Work(models.Model):
    id = BigIntegerField(primary_key=True, default=generate_large_id)
    title = CharField(max_length=200)
    synopsis = TextField(blank=True)
    author = ForeignKey(User, on_delete=CASCADE)

    # Computed fields (auto-updated)
    total_word_count = IntegerField(default=0)
    total_chapters = IntegerField(default=0)

    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

### Chapter Model
```python
class Chapter(models.Model):
    id = BigIntegerField(primary_key=True, default=generate_large_id)
    work = ForeignKey(Work, on_delete=CASCADE, related_name='chapters')
    title = CharField(max_length=200)
    content = TextField(default='')
    order = PositiveIntegerField()

    # AI-generated content
    summary = TextField(blank=True)

    # Auto-save tracking
    auto_saved_at = DateTimeField(null=True, blank=True)
    last_manual_save = DateTimeField(null=True, blank=True)

    word_count = IntegerField(default=0)
```

**Important**: Content field stores plain text. Note linking now uses character position offsets tracked by Monaco Editor decorations instead of invisible markers.

### Note Model
```python
class Note(models.Model):
    id = BigIntegerField(primary_key=True, default=generate_large_id)
    work = ForeignKey(Work, on_delete=CASCADE, related_name='notes')
    chapter = ForeignKey(Chapter, on_delete=CASCADE, related_name='notes')
    content = TextField()
    color = CharField(max_length=7, choices=NOTE_COLORS, default='#f59e0b')

    # Text position linking (for marker system)
    text_start_position = PositiveIntegerField(null=True, blank=True)
    text_end_position = PositiveIntegerField(null=True, blank=True)
    linked_text = TextField(blank=True)

    # AI integration
    is_ai_generated = BooleanField(default=False)
    note_type = CharField(max_length=50, choices=NOTE_TYPES, default='user')
```

**Critical**: The Monaco Editor system in frontend relies on these position fields to maintain text-note relationships through character offset tracking.

## API Endpoint Details

### Authentication
All endpoints except streaming use standard DRF Token authentication:
```
Authorization: Token {user_token}
```

Streaming endpoints use query parameter:
```
GET /api/ai/chat/stream/?token={user_token}&work_id=123&chapter_id=456&message=hello
```

### Core Endpoints

#### Work Management
- `GET /api/works/` - List user's works (paginated)
- `POST /api/works/` - Create new work
- `GET /api/works/{id}/` - Get work details
- `PATCH /api/works/{id}/` - Update work
- `DELETE /api/works/{id}/` - Delete work

#### Chapter Management
- `GET /api/works/{work_id}/chapters/` - List chapters
- `POST /api/works/{work_id}/chapters/` - Create chapter
- `GET /api/works/{work_id}/chapters/{id}/` - Get chapter
- `PATCH /api/works/{work_id}/chapters/{id}/` - Update chapter
- `PATCH /api/works/{work_id}/chapters/{id}/autosave/` - Auto-save content

#### AI Services
- `POST /api/ai/chat/` - HTTP chat (fallback)
- `GET /api/ai/chat/stream/` - Streaming chat (primary)
- `POST /api/ai/continue/` - HTTP continuation (fallback)
- `GET /api/ai/continue/stream/` - Streaming continuation (primary)
- `POST /api/ai/suggest/` - Generate suggestions
- `POST /api/ai/summarize/` - Generate summary
- `GET /api/ai/summarize/stream/` - Streaming summary

#### Notes
- `GET /api/notes/?work={id}&chapter={id}` - List filtered notes
- `POST /api/notes/` - Create note
- `PATCH /api/notes/{id}/` - Update note
- `DELETE /api/notes/{id}/` - Delete note

## Environment Configuration

### Required Settings
```bash
# API Keys
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_API_BASE=https://api.deepseek.com

# Django Settings
DEBUG=True
SECRET_KEY=your-secret-key
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (SQLite for dev, PostgreSQL for prod)
DATABASE_URL=sqlite:///db.sqlite3

# Channels (for WebSocket support)
REDIS_URL=redis://localhost:6379/0
```

### Production Considerations
- Use PostgreSQL instead of SQLite
- Set `DEBUG=False`
- Configure proper `ALLOWED_HOSTS`
- Use environment variables for secrets
- Set up Redis for Django Channels
- Configure HTTPS for secure token transmission

## Common Issues & Troubleshooting

### 1. AI Services Not Working
**Symptoms**: Mock responses, no actual AI
**Cause**: Missing or invalid `DEEPSEEK_API_KEY`
**Solution**:
```bash
# Check .env file
echo $DEEPSEEK_API_KEY
# Should output your API key, not empty
```

### 2. Streaming Authentication Fails
**Symptoms**: 401 errors on `/stream/` endpoints
**Cause**: Token not properly passed in query parameters
**Debug**:
```python
# In views.py, add logging
import logging
logger = logging.getLogger(__name__)

def ai_chat_stream(request):
    token = request.GET.get('token')
    logger.info(f"Received token: {token[:10]}..." if token else "No token")
```

### 3. Context Too Large Errors
**Symptoms**: AI requests failing with context size errors
**Cause**: Too much content in context building
**Solution**: Modify `ContextBuilder` to truncate content:
```python
# Limit content size
if len(current_content) > 5000:
    current_content = current_content[-5000:]  # Last 5000 chars
```

### 4. Large ID Generation Issues
**Symptoms**: Database integrity errors, duplicate IDs
**Cause**: ID collision (rare but possible)
**Solution**: The `generate_large_id()` function uses timestamp + random bits for uniqueness

### 5. Auto-save Conflicts
**Symptoms**: Lost content, conflicting saves
**Cause**: Multiple auto-save requests
**Solution**: Frontend should debounce auto-save requests

## Development Guidelines

### AI Service Development
1. Always implement both HTTP and streaming versions
2. Test authentication for both regular and streaming endpoints
3. Monitor context size and token usage
4. Implement proper error handling and fallbacks

### Model Changes
1. Always use migrations for schema changes
2. Be careful with `BigIntegerField` ID modifications
3. Test with existing data when changing relationships

### Testing
```bash
# Run specific app tests
python manage.py test apps.ai_services
python manage.py test apps.works
python manage.py test apps.notes

# Run with coverage
coverage run --source='.' manage.py test
coverage report
```

### Debugging
```bash
# Enable debug mode
export DEBUG=True

# Show SQL queries
export DJANGO_LOG_LEVEL=DEBUG

# Test AI services without API key
unset DEEPSEEK_API_KEY
# Should show mock responses
```

This backend is designed to be robust, scalable, and maintainable with clear separation of concerns and comprehensive error handling.