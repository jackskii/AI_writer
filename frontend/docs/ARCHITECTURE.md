# Frontend Architecture

## Auth

- Login/register via `authApi` → DRF token stored in Zustand persist (`auth-storage` in localStorage).
- Regular API calls: axios interceptor adds `Authorization: Token …` header (`frontend/src/services/api.ts`).
- On 401: clear storage and redirect to `/auth`.

## Streaming (SSE)

AI responses stream over Server-Sent Events (not WebSocket).

**Why query-param token?** `EventSource` cannot send custom headers, so streaming endpoints accept `?token=` from `auth-storage`.

**Chapter chat:** `aiApi.chatStream` → `GET /api/ai/chat/stream/`

**Work chat:** `aiApi.workChatStream` → `GET /api/ai/work/chat/stream/`

**Auto-edit:** `aiApi.autoEditStream` → `POST /api/ai/auto-edit/stream/` (fetch + readable stream)

**Summaries / act synopsis:** `summarizeStream`, `generateActSynopsisStream`

### SSE message shape

```json
{"type": "chunk", "content": "..."}
{"type": "end", "full_response": "..."}
{"type": "error", "message": "..."}
```

Chat history is persisted separately via `chatApi` REST endpoints.

## Editor layout

**Desktop:** `EditorPanel` (left) + `ChatPanel` (right).

**Mobile:** tab bar — editor | AI chat.

Notes live inside `EditorPanel` sidebar, not a separate panel.

## Position-based notes

Notes store `text_start_position`, `text_end_position`, and `linked_text` in the DB. The editor adjusts offsets on edit and highlights via native `setSelectionRange`. See `EDITOR_SYSTEM.md`.

## Edit prefills

User-customizable auto-edit prompts: `editPrefillsApi` → `/api/auth/edit-prefills/`.
