# Work Overview Chat

This document summarizes how the work-level chatbot is wired so future changes stay aligned with the chapter chat experience.

## Purpose
- Lives on the work synopsis tab (`WorkDetailPage.tsx`) and focuses on plot-wide questions.
- Shares UI patterns with `ChatPanel`, but only requires a `Work` object.
- Streams DeepSeek responses via `/api/ai/work/chat/stream/` (no HTTP fallback).

## Frontend Flow
1. `WorkChatPanel` bootstraps by calling `chatApi.getWorkHistory(work.id)`. If no history exists, it seeds a greeting and persists it with `chatApi.saveWorkMessage`.
2. When the user sends a message, the component saves the user entry, opens an SSE connection with `aiApi.workChatStream`, and streams chunks into `streamingMessage`.
3. Each AI response is persisted to `/chat/work/<work_id>/save/`.
4. `clearWorkHistory` wipes the session and the UI mirrors the empty state.

## Backend Context
- Work-level conversations live in `WorkChatSession` / `WorkChatMessage`, ensuring one overview session per user & work.
- `ContextBuilder.build_work_overview_context` bundles:
  - Work synopsis text.
  - Every lore entry (name, description, triggers).
  - For each chapter: `summary` if present, otherwise a 200 character preview of `content`.
- `AIService.chat_with_ai_stream` detects `context_scope == "work_overview"` and applies the shared `CHAT_STREAM_SYSTEM_PROMPT` from `prompts.py`.

## Endpoints
- New AI routes: `/api/ai/work/chat/` + `/api/ai/work/chat/stream/`.
- New chat routes: `/api/chat/work/<work_id>/`, `/save/`, `/clear/`.
- Streaming responses mirror the chapter chat payloads: `{type: "start"|"chunk"|"end"|"error"}`.

## Editing Tips
- Keep `WorkChatPanel` intentionally lightweight: no WebSocket, just SSE + REST.
- If you extend stored metadata, adjust both the serializer payloads and `ChatMessage` typing.
- Validate prompt updates against both macro and chapter chats; they now share formatting helpers in `prompts.py`.
