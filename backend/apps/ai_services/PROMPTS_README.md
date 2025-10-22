# AI Prompts Configuration Guide

## Overview

All AI prompts and instructions have been centralized in `prompts.py` for easy editing and customization. This file contains all the text that controls how the AI assistants behave.

## File Structure

### `prompts.py` - Centralized Prompts Configuration

This file is organized into the following sections:

#### 1. System Prompts
These control the overall behavior of each AI assistant:

- **`CHAT_SYSTEM_PROMPT`** - Controls the general chat assistant behavior
- **`CHAT_STREAM_SYSTEM_PROMPT`** - Shorter version for streaming chat (limits responses to ~100 characters)
- **`get_continue_prompt(token_count)`** - Controls story continuation behavior (configurable token count)
- **`SUGGEST_SYSTEM_PROMPT`** - Controls writing suggestion behavior
- **`SUGGEST_JSON_PROMPT`** - JSON-formatted suggestion prompt
- **`SUMMARY_SYSTEM_PROMPT`** - Controls chapter summary behavior

#### 2. Request Templates
Helper functions to format AI requests:

- **`format_continue_request()`** - Formats continuation writing requests
- **`format_summary_request()`** - Formats summary generation requests
- **`format_suggest_request()`** - Formats suggestion generation requests

#### 3. Context Formatting
Helper functions to format story context:

- **`format_work_info()`** - Formats work title and synopsis
- **`format_lore_entries()`** - Formats world-building entries
- **`format_chapter_summaries()`** - Formats recent chapter summaries
- **`format_current_chapter()`** - Formats current chapter information

#### 4. Model Configuration
Default settings for AI API calls:

- **`DEFAULT_MODEL`** - Default DeepSeek model ("deepseek-chat")
- **`DEFAULT_TEMPERATURE`** - Creativity level (0.7)
- **`DEFAULT_MAX_TOKENS`** - Maximum response length (2000 tokens)
- **`DEFAULT_CONTINUE_TOKENS`** - Default continuation length (160 tokens)

#### 5. Error Messages
User-facing error messages in Chinese:

- **`ERROR_API_KEY_MISSING`** - API key not configured
- **`ERROR_API_FAILED`** - General API failure
- **`ERROR_CHAT_FAILED`** - Chat failure
- **`ERROR_CONTINUE_FAILED`** - Continuation failure
- **`ERROR_SUGGEST_FAILED`** - Suggestion generation failure
- **`ERROR_SUMMARY_FAILED`** - Summary generation failure

## How to Edit Prompts

### Example 1: Change Chat Assistant Behavior

To make the chat assistant more concise:

```python
# In prompts.py, change:
CHAT_SYSTEM_PROMPT = """你是一个专业的中文小说写作助手。请根据用户提供的上下文信息，帮助用户解答写作相关的问题，提供创意建议，讨论情节发展，或协助解决写作困难。你的回答应该专业、有建设性，并且符合中文小说的写作习惯。"""

# To:
CHAT_SYSTEM_PROMPT = """你是一个专业的中文小说写作助手。请简洁回答问题，每次回答不超过50字。你的回答应该专业、有建设性，并且符合中文小说的写作习惯。"""
```

### Example 2: Adjust Continuation Token Count

To change the default continuation length:

```python
# In prompts.py, change:
DEFAULT_CONTINUE_TOKENS = 160

# To:
DEFAULT_CONTINUE_TOKENS = 300  # Generate longer continuations
```

### Example 3: Modify Continuation Instructions

To change how the AI continues writing:

```python
# Edit the get_continue_prompt() function in prompts.py
def get_continue_prompt(token_count: int = 160) -> str:
    return f"""你是一个专业的中文小说续写助手。请直接从用户提供的文章末尾无缝继续写作。
1. 从文章最后一个字符直接继续
2. 保持一致的写作风格
3. 生成约{token_count}个tokens的内容
4. 重点关注对话和人物互动  # ← Add your custom instructions here
"""
```

### Example 4: Change Summary Length

To make summaries longer or shorter:

```python
# In prompts.py, change:
SUMMARY_SYSTEM_PROMPT = """你是一个专业的章节摘要助手。请为用户提供的章节内容生成简洁的摘要。摘要应该概括章节的主要情节和事件，提及重要的人物和对话，长度控制在100-200字，便于后续章节的理解。"""

# To (for longer summaries):
SUMMARY_SYSTEM_PROMPT = """你是一个专业的章节摘要助手。请为用户提供的章节内容生成详细的摘要。摘要应该概括章节的主要情节和事件，提及重要的人物和对话，长度控制在300-500字，便于后续章节的理解。"""
```

## Changes Made

### 1. Removed Mock Content
- All mock/dummy responses have been removed from `DeepSeekAPI` class
- If API key is missing, the system now raises a clear error instead of returning mock data
- This ensures you always know when the real API is being used

### 2. Centralized Prompts
- All AI prompts moved from inline strings to `prompts.py`
- Prompts are now variables/functions that can be easily edited
- No need to search through code to find where prompts are defined

### 3. Improved Error Handling
- Better error messages when API key is missing
- Returns HTTP 503 (Service Unavailable) when API is not configured
- All error messages use the centralized error constants in `prompts.py`

### 4. Fixed Authentication
- Fixed token authentication for `ai_summarize_stream` endpoint
- Now properly accepts token via query parameter like other streaming endpoints
- This fixes the 401 authentication errors you were seeing

## Testing Your Changes

After editing `prompts.py`:

1. No need to restart the server - changes are loaded when the AI service is created
2. Test by making an AI request (chat, continue, suggest, or summarize)
3. Check the logs to see if your prompt is being used correctly
4. If there are errors, check the Django logs for details

## Best Practices

1. **Keep prompts in Chinese** - The AI works better with Chinese prompts for Chinese novel writing
2. **Be specific** - Clear, specific instructions work better than vague ones
3. **Test incrementally** - Make small changes and test before making more changes
4. **Keep backups** - Save a copy of `prompts.py` before making major changes
5. **Use version control** - Commit your changes to git so you can revert if needed

## Common Issues

**Q: My prompt changes aren't working**
A: Make sure you saved `prompts.py` and that there are no syntax errors. Check Django logs for import errors.

**Q: The AI isn't following my instructions**
A: AI models don't always follow instructions perfectly. Try making instructions more explicit or adjusting the temperature in `DEFAULT_TEMPERATURE`.

**Q: Responses are too long/short**
A: Adjust `DEFAULT_MAX_TOKENS` for general responses or `DEFAULT_CONTINUE_TOKENS` for story continuations.

**Q: I want different behavior for different works**
A: Currently, all prompts are global. To customize per-work, you would need to modify the code to pass work-specific settings.

## Support

If you need help customizing prompts or encounter issues, check:
1. Django logs: Look for errors from `ai_services` app
2. The original prompts in this README for reference
3. DeepSeek API documentation for model capabilities
