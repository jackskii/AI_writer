# API Documentation

Complete REST API reference for AI Novel Writing Assistant backend with detailed request/response formats, authentication requirements, and streaming endpoints.

## Base Configuration

### Base URL
```
Development: http://localhost:8001/api
Production: https://your-domain.com/api
```

### Authentication
Most endpoints require Django REST Framework Token authentication:
```
Authorization: Token {your_token_here}
```

**Exception**: Streaming endpoints accept token via query parameter due to EventSource limitations.

### Response Format
All API responses follow this structure:
```json
{
  "status": "success|error",
  "data": { ... },
  "message": "optional message"
}
```

## Authentication Endpoints

### Login
```http
POST /auth/login/
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

**Response** (200):
```json
{
  "token": "40-character-token",
  "user": {
    "id": 123,
    "username": "user123",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe"
  }
}
```

**Errors**:
- 400: Invalid credentials
- 429: Too many login attempts

### Register
```http
POST /auth/register/
Content-Type: application/json

{
  "username": "string",
  "email": "string",
  "password": "string",
  "first_name": "string",
  "last_name": "string"
}
```

**Response** (201):
```json
{
  "token": "40-character-token",
  "user": {
    "id": 124,
    "username": "newuser",
    "email": "newuser@example.com",
    "first_name": "Jane",
    "last_name": "Smith"
  }
}
```

### Logout
```http
POST /auth/logout/
Authorization: Token {token}
```

**Response** (200):
```json
{
  "message": "Successfully logged out"
}
```

### Current User
```http
GET /auth/user/
Authorization: Token {token}
```

**Response** (200):
```json
{
  "id": 123,
  "username": "user123",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe"
}
```

## Works Management

### List Works
```http
GET /works/
Authorization: Token {token}
```

**Query Parameters**:
- `page`: Page number (default: 1)
- `page_size`: Results per page (default: 20, max: 100)
- `search`: Search in title and synopsis

**Response** (200):
```json
{
  "count": 42,
  "next": "http://localhost:8001/api/works/?page=3",
  "previous": "http://localhost:8001/api/works/?page=1",
  "results": [
    {
      "id": 123456789012345,
      "title": "My Novel",
      "synopsis": "A story about...",
      "author": 123,
      "total_word_count": 25000,
      "total_chapters": 15,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-20T15:45:00Z"
    }
  ]
}
```

### Create Work
```http
POST /works/
Authorization: Token {token}
Content-Type: application/json

{
  "title": "string (max 200 chars)",
  "synopsis": "string (optional)"
}
```

**Response** (201):
```json
{
  "id": 234567890123456,
  "title": "New Novel",
  "synopsis": "Description of the story",
  "author": 123,
  "total_word_count": 0,
  "total_chapters": 0,
  "created_at": "2024-01-21T09:15:00Z",
  "updated_at": "2024-01-21T09:15:00Z"
}
```

### Get Work Details
```http
GET /works/{work_id}/
Authorization: Token {token}
```

**Response** (200):
```json
{
  "id": 123456789012345,
  "title": "My Novel",
  "synopsis": "A story about...",
  "author": 123,
  "total_word_count": 25000,
  "total_chapters": 15,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-20T15:45:00Z",
  "chapters": [
    {
      "id": 345678901234567,
      "title": "Chapter 1",
      "order": 1,
      "word_count": 1500,
      "summary": "Chapter summary...",
      "created_at": "2024-01-15T11:00:00Z"
    }
  ],
  "lore_entries": [
    {
      "id": 456789012345678,
      "name": "Character Name",
      "description": "Character description",
      "all_triggers": ["name", "alias"]
    }
  ]
}
```

### Update Work
```http
PATCH /works/{work_id}/
Authorization: Token {token}
Content-Type: application/json

{
  "title": "Updated Title",
  "synopsis": "Updated synopsis"
}
```

### Delete Work
```http
DELETE /works/{work_id}/
Authorization: Token {token}
```

**Response** (204): No content

## Chapter Management

### List Chapters
```http
GET /works/{work_id}/chapters/
Authorization: Token {token}
```

**Response** (200):
```json
[
  {
    "id": 345678901234567,
    "title": "Chapter 1: The Beginning",
    "content": "Full chapter content with markers...",
    "order": 1,
    "summary": "AI-generated summary",
    "word_count": 1500,
    "auto_saved_at": "2024-01-20T14:30:00Z",
    "last_manual_save": "2024-01-20T14:25:00Z",
    "created_at": "2024-01-15T11:00:00Z",
    "updated_at": "2024-01-20T14:30:00Z"
  }
]
```

### Create Chapter
```http
POST /works/{work_id}/chapters/
Authorization: Token {token}
Content-Type: application/json

{
  "title": "string (max 200 chars)",
  "content": "string (optional)",
  "order": 1
}
```

**Response** (201):
```json
{
  "id": 456789012345678,
  "title": "New Chapter",
  "content": "",
  "order": 2,
  "summary": "",
  "word_count": 0,
  "auto_saved_at": null,
  "last_manual_save": null,
  "created_at": "2024-01-21T10:00:00Z",
  "updated_at": "2024-01-21T10:00:00Z"
}
```

### Get Chapter
```http
GET /works/{work_id}/chapters/{chapter_id}/
Authorization: Token {token}
```

### Update Chapter
```http
PATCH /works/{work_id}/chapters/{chapter_id}/
Authorization: Token {token}
Content-Type: application/json

{
  "title": "Updated Chapter Title",
  "content": "Updated content with markers...",
  "summary": "Updated summary"
}
```

### Auto-Save Chapter
```http
PATCH /works/{work_id}/chapters/{chapter_id}/autosave/
Authorization: Token {token}
Content-Type: application/json

{
  "content": "Auto-saved content with markers..."
}
```

**Response** (200):
```json
{
  "message": "Chapter auto-saved successfully",
  "auto_saved_at": "2024-01-21T10:30:00Z"
}
```

### Delete Chapter
```http
DELETE /works/{work_id}/chapters/{chapter_id}/
Authorization: Token {token}
```

## AI Services

### Chat (HTTP Fallback)
```http
POST /ai/chat/
Authorization: Token {token}
Content-Type: application/json

{
  "work_id": 123456789012345,
  "chapter_id": 345678901234567,
  "message": "How should I develop this character?"
}
```

**Response** (200):
```json
{
  "response": "AI response about character development..."
}
```

### Chat (Streaming - Primary)
```http
GET /ai/chat/stream/?token={token}&work_id={work_id}&chapter_id={chapter_id}&message={message}
Content-Type: text/event-stream
```

**SSE Response Stream**:
```
data: {"type": "start"}

data: {"type": "chunk", "content": "AI response "}

data: {"type": "chunk", "content": "continues here..."}

data: {"type": "end"}
```

**Error Response**:
```
data: {"type": "error", "message": "Error description"}
```

### Continue Writing (HTTP Fallback)
```http
POST /ai/continue/
Authorization: Token {token}
Content-Type: application/json

{
  "work_id": 123456789012345,
  "chapter_id": 345678901234567,
  "guide": "Make the dialogue more dramatic",
  "content": "Current chapter content...",
  "token_count": 200
}
```

**Response** (200):
```json
{
  "content": "AI-generated continuation text..."
}
```

### Continue Writing (Streaming - Primary)
```http
GET /ai/continue/stream/?token={token}&work_id={work_id}&chapter_id={chapter_id}&guide={guide}&content={content}&token_count={count}
Content-Type: text/event-stream
```

**Parameters**:
- `token`: Authentication token (required)
- `work_id`: Work ID (required)
- `chapter_id`: Chapter ID (required)
- `guide`: Writing guidance (optional)
- `content`: Current content (optional, uses chapter content if not provided)
- `token_count`: Token limit (optional, default: 160)

### Generate Suggestions
```http
POST /ai/suggest/
Authorization: Token {token}
Content-Type: application/json

{
  "work_id": 123456789012345,
  "chapter_id": 345678901234567,
  "target_text": "Selected text for suggestion (optional)"
}
```

**Response** (200):
```json
{
  "suggestions": [
    {
      "id": 567890123456789,
      "type": "improve",
      "content": "Consider adding more descriptive language to enhance the scene.",
      "target_text": "Selected text that was analyzed"
    }
  ]
}
```

### Summarize Chapter (HTTP)
```http
POST /ai/summarize/
Authorization: Token {token}
Content-Type: application/json

{
  "work_id": 123456789012345,
  "chapter_id": 345678901234567
}
```

**Response** (200):
```json
{
  "summary": "AI-generated chapter summary..."
}
```

### Summarize Chapter (Streaming)
```http
GET /ai/summarize/stream/?token={token}&work_id={work_id}&chapter_id={chapter_id}
Content-Type: text/event-stream
```

**SSE Response includes summary in end event**:
```
data: {"type": "start"}

data: {"type": "chunk", "content": "Chapter summary "}

data: {"type": "chunk", "content": "continues..."}

data: {"type": "end", "summary": "Complete chapter summary"}
```

## Notes Management

### List Notes
```http
GET /notes/
Authorization: Token {token}
```

**Query Parameters**:
- `work`: Filter by work ID
- `chapter`: Filter by chapter ID

**Response** (200):
```json
{
  "results": [
    {
      "id": 678901234567890,
      "work": 123456789012345,
      "chapter": 345678901234567,
      "content": "Note content",
      "color": "#f59e0b",
      "text_start_position": 150,
      "text_end_position": 170,
      "linked_text": "selected text",
      "is_ai_generated": false,
      "note_type": "user",
      "created_at": "2024-01-20T09:00:00Z",
      "updated_at": "2024-01-20T09:00:00Z"
    }
  ]
}
```

### Create Note
```http
POST /notes/
Authorization: Token {token}
Content-Type: application/json

{
  "work": 123456789012345,
  "chapter": 345678901234567,
  "content": "Note content",
  "color": "#f59e0b",
  "text_start_position": 150,
  "text_end_position": 170,
  "linked_text": "selected text",
  "note_type": "user"
}
```

**Response** (201):
```json
{
  "id": 789012345678901,
  "work": 123456789012345,
  "chapter": 345678901234567,
  "content": "Note content",
  "color": "#f59e0b",
  "text_start_position": 150,
  "text_end_position": 170,
  "linked_text": "selected text",
  "is_ai_generated": false,
  "note_type": "user",
  "created_at": "2024-01-21T11:00:00Z",
  "updated_at": "2024-01-21T11:00:00Z"
}
```

### Update Note
```http
PATCH /notes/{note_id}/
Authorization: Token {token}
Content-Type: application/json

{
  "content": "Updated note content",
  "color": "#ef4444",
  "linked_text": "updated linked text"
}
```

### Delete Note
```http
DELETE /notes/{note_id}/
Authorization: Token {token}
```

**Response** (204): No content

## Chat History

### Get Chat History
```http
GET /chat/{work_id}/{chapter_id}/
Authorization: Token {token}
```

**Response** (200):
```json
{
  "session_id": "unique-session-id",
  "messages": [
    {
      "id": "message-id-1",
      "role": "user",
      "content": "How should I develop this character?",
      "timestamp": "2024-01-20T10:00:00Z"
    },
    {
      "id": "message-id-2",
      "role": "assistant",
      "content": "Consider the character's background...",
      "timestamp": "2024-01-20T10:00:30Z"
    }
  ]
}
```

### Save Message
```http
POST /chat/{work_id}/{chapter_id}/save/
Authorization: Token {token}
Content-Type: application/json

{
  "role": "user|assistant",
  "content": "Message content"
}
```

**Response** (201):
```json
{
  "id": "message-id-3",
  "role": "user",
  "content": "Message content",
  "timestamp": "2024-01-21T12:00:00Z"
}
```

### Clear Chat History
```http
DELETE /chat/{work_id}/{chapter_id}/clear/
Authorization: Token {token}
```

**Response** (200):
```json
{
  "message": "Chat history cleared successfully"
}
```

## Error Responses

### Standard Error Format
```json
{
  "error": "Error message",
  "details": {
    "field_name": ["Field-specific error message"]
  }
}
```

### Common HTTP Status Codes

#### 400 Bad Request
```json
{
  "error": "Invalid input data",
  "details": {
    "title": ["This field is required."],
    "content": ["Ensure this field has no more than 100000 characters."]
  }
}
```

#### 401 Unauthorized
```json
{
  "error": "Authentication credentials were not provided."
}
```

#### 403 Forbidden
```json
{
  "error": "You do not have permission to perform this action."
}
```

#### 404 Not Found
```json
{
  "error": "Work not found."
}
```

#### 429 Too Many Requests
```json
{
  "error": "Request was throttled. Expected available in 60 seconds."
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal server error occurred."
}
```

## Rate Limiting

### Default Limits
- Authenticated users: 1000 requests/hour
- AI endpoints: 100 requests/hour
- Authentication endpoints: 10 requests/minute

### Rate Limit Headers
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1642780800
```

## Pagination

### Query Parameters
- `page`: Page number (1-based)
- `page_size`: Results per page (default: 20, max: 100)

### Response Format
```json
{
  "count": 150,
  "next": "http://localhost:8001/api/works/?page=3",
  "previous": "http://localhost:8001/api/works/?page=1",
  "results": [...]
}
```

## Field Validation

### Work Fields
- `title`: Required, max 200 characters
- `synopsis`: Optional, max 10000 characters

### Chapter Fields
- `title`: Required, max 200 characters
- `content`: Optional, max 100000 characters
- `order`: Required, positive integer

### Note Fields
- `content`: Required, max 1000 characters
- `color`: Required, hex color format (#rrggbb)
- `note_type`: Required, choices: user, suggestion, reminder, character, plot, setting

## WebSocket Endpoints

### Chat WebSocket
```
ws://localhost:8001/ws/chat/{work_id}/{chapter_id}/
```

**Message Format**:
```json
{
  "type": "chat|typing",
  "message": "content",
  "is_typing": true
}
```

### Notifications WebSocket
```
ws://localhost:8001/ws/notifications/{work_id}/
```

**Notification Types**:
- `auto_save_complete`
- `ai_suggestion_ready`
- `collaboration_update`

## Development & Testing

### API Testing with curl

#### Login
```bash
curl -X POST http://localhost:8001/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "testpass"}'
```

#### Create Work
```bash
curl -X POST http://localhost:8001/api/works/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Token your_token_here" \
  -d '{"title": "Test Novel", "synopsis": "A test story"}'
```

#### Stream Chat
```bash
curl -N http://localhost:8001/api/ai/chat/stream/?token=your_token&work_id=123&chapter_id=456&message=hello
```

### Postman Collection
Import the provided Postman collection for comprehensive API testing:
- Authentication flows
- CRUD operations
- Streaming endpoints
- Error scenarios

This API provides comprehensive functionality for novel writing with AI assistance, real-time collaboration, and advanced note-taking capabilities.