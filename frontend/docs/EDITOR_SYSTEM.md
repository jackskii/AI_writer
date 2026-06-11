# Editor System

Native `<textarea>` editor with position-based note linking and AI tools in `EditorPanel`.

## Components

| Component | Role |
|-----------|------|
| `EditorPage` | Layout: editor + chat (desktop side-by-side, mobile tabs) |
| `EditorPanel` | Textarea, notes sidebar, auto-edit, suggest, version popup |
| `ChatPanel` | Chapter-scoped SSE chat |
| `AutoEditModal` | Streaming rewrite with lore/style/context pickers |

## Note positions

1. User selects text → `selectionStart` / `selectionEnd` character offsets.
2. Note saved with `text_start_position`, `text_end_position`, `linked_text`.
3. `adjustPositions()` updates offsets when chapter content changes.
4. Clicking a note calls `setSelectionRange` to highlight linked text (10s timeout).

No invisible markers or embedded Unicode in chapter content.

## AI in editor

- **Auto-edit:** `aiApi.autoEditStream` via `AutoEditModal`; optional inline version history via `autoEditApi`.
- **Suggest:** `aiApi.suggest` → creates a blue suggestion note.
- **Auto-save:** parent `EditorPage` debounces `chaptersApi.autoSave`.

## Layout

```
EditorPage
├── EditorPanel (notes + textarea + AI tools)
└── ChatPanel
```

Do not replace the textarea without evaluating position-tracking impact. Preserve `adjustPositions` when editing content-change logic.
