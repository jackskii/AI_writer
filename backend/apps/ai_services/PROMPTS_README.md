# AI Prompts (`prompts.py`)

All LLM instructions live in `backend/apps/ai_services/prompts.py`. Edit that file to change AI behavior — no need to hunt through views/services.

## Main sections

| Area | Key symbols |
|------|-------------|
| Chapter / work chat | `CHAT_STREAM_SYSTEM_PROMPT`, `format_*` context helpers |
| Auto-edit | `AUTO_EDIT_PREFILLS`, `format_auto_edit_*` |
| Suggest | `SUGGEST_JSON_PROMPT`, `format_suggest_request` |
| Summary | `SUMMARY_SYSTEM_PROMPT`, `format_summary_request` |
| Lore auto-describe | `format_auto_describe_request` |
| Act synopsis | act synopsis templates in same file |
| Defaults | `DEFAULT_MODEL`, `DEFAULT_TEMPERATURE`, `DEFAULT_MAX_TOKENS` |
| Errors | `ERROR_*` constants (Chinese user messages) |

## “续写” (continue writing)

There is no separate continue-writing endpoint. The **续写** prefill in `AUTO_EDIT_PREFILLS` is used by the auto-edit modal — same flow as other edit prefills, user-managed via `/api/auth/edit-prefills/`.

## Providers

API calls go through `providers.py` (`get_provider`). User API keys and model choice are in `UserSettings`.

## After editing

1. Save `prompts.py` (backend bind-mount picks up changes; restart container if needed).
2. Test the relevant feature (chat, auto-edit, suggest, summary).
3. Check `backend/logs/django.log` on errors.

## Tips

- Prefer clear Chinese instructions for Chinese novel tasks.
- Tune `DEFAULT_TEMPERATURE` / `DEFAULT_MAX_TOKENS` before rewriting long prompts.
- Commit `prompts.py` before large experiments so you can revert.
