# AI Services Documentation

Comprehensive AI integration system with DeepSeek API, context building, and streaming capabilities for novel writing assistance.

## Architecture Overview

The AI services module provides four specialized AI assistants:
1. **Chat AI**: Context-aware conversation about story development
2. **Continue Writing AI**: Story continuation from current text
3. **Suggestion AI**: Writing improvement recommendations
4. **Summary AI**: Chapter summarization for context building

## Core Components

### DeepSeekAPI Class
**File**: `apps/ai_services/services.py`

The main interface to DeepSeek's API using AsyncOpenAI client:

```python
class DeepSeekAPI:
    """DeepSeek API 客户端 - 使用 OpenAI 客户端库"""

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.base_url = settings.DEEPSEEK_API_BASE
        if not self.api_key:
            logger.warning("DEEPSEEK_API_KEY not configured, using mock responses")
            self.client = None
        else:
            self.client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.base_url
            )
```

#### Key Methods

##### Streaming Chat Completion
```python
async def chat_completion_stream(self, messages: List[Dict], model: str = "deepseek-chat", max_tokens: int = 2000) -> AsyncGenerator[str, None]:
    """发送聊天完成请求并流式返回内容片段"""
    if not self.api_key:
        # Return mock response for development
        mock_content = f"这是一个模拟的AI流式回复。您的消息是：{user_message[:50]}..."
        words = mock_content.split()
        for i, word in enumerate(words):
            yield word if i == 0 else f" {word}"
            await asyncio.sleep(0.1)
        return

    try:
        stream_response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=max_tokens,
            stream=True
        )

        async for chunk in stream_response:
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    except Exception as e:
        logger.error(f"DeepSeek API streaming error: {str(e)}")
        raise
```

##### Non-Streaming Chat Completion
```python
async def chat_completion(self, messages: List[Dict], model: str = "deepseek-chat", stream: bool = True, max_tokens: int = 2000, response_format: Optional[Dict] = None) -> Dict:
    """发送聊天完成请求"""
    if not self.api_key:
        # Mock response for development
        user_message = messages[-1].get('content', '') if messages else ''
        mock_content = f"这是一个模拟的AI回复。您的消息是：{user_message[:50]}..."
        return {
            "choices": [{
                "message": {"content": mock_content}
            }]
        }

    try:
        if stream:
            # Streaming mode - collect all chunks
            content_chunks = []
            stream_response = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=max_tokens,
                stream=True,
                response_format=response_format
            )

            async for chunk in stream_response:
                if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                    content_chunks.append(chunk.choices[0].delta.content)

            full_content = ''.join(content_chunks)
            return {"choices": [{"message": {"content": full_content}}]}
        else:
            # Non-streaming mode
            response = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=max_tokens,
                stream=False,
                response_format=response_format
            )
            return {"choices": [{"message": {"content": response.choices[0].message.content}}]}

    except Exception as e:
        logger.error(f"DeepSeek API error: {str(e)}")
        raise
```

### ContextBuilder Class
**File**: `apps/ai_services/services.py`

Intelligent context construction for AI requests:

```python
class ContextBuilder:
    """上下文构建器 - 为AI提供完整的故事上下文"""

    @staticmethod
    def build_context(chapter: Chapter, include_current_content: bool = True) -> Dict:
        """构建AI上下文"""
        work = chapter.work

        # 基础上下文
        context = {
            "synopsis": work.synopsis,
            "work_title": work.title,
            "chapter_title": chapter.title,
            "current_chapter_content": chapter.content if include_current_content else "",
        }

        # 获取触发的世界观条目
        lore_entries = ContextBuilder._get_triggered_lore_entries(chapter)
        context["lore_entries"] = [
            {
                "name": entry.name,
                "description": entry.description,
                "triggers": entry.all_triggers
            }
            for entry in lore_entries
        ]

        # 获取最近5章的摘要
        recent_summaries = ContextBuilder._get_recent_chapter_summaries(chapter)
        context["recent_chapter_summaries"] = recent_summaries

        return context
```

#### Trigger Word System
```python
@staticmethod
def _get_triggered_lore_entries(chapter: Chapter) -> List[LoreEntry]:
    """获取被触发的世界观条目"""
    content = f"{chapter.work.synopsis} {chapter.content}".lower()
    triggered_entries = []

    for entry in chapter.work.lore_entries.all():
        for trigger in entry.all_triggers:
            if trigger.lower() in content:
                triggered_entries.append(entry)
                break

    return triggered_entries
```

#### Recent Chapters Context
```python
@staticmethod
def _get_recent_chapter_summaries(chapter: Chapter, count: int = 5) -> List[str]:
    """获取最近章节的摘要"""
    chapters = chapter.work.chapters.filter(
        order__lt=chapter.order
    ).order_by('-order')[:count]

    summaries = []
    for ch in reversed(list(chapters)):
        if ch.summary:
            summaries.append(f"第{ch.order}章《{ch.title}》: {ch.summary}")

    return summaries
```

### AIService Class
**File**: `apps/ai_services/services.py`

High-level AI operations manager:

```python
class AIService:
    """AI服务管理器"""

    def __init__(self):
        self.deepseek = DeepSeekAPI()
        self.system_prompts = self.__init_system_prompts()
```

#### System Prompts
```python
def __init_system_prompts(self):
    """初始化系统提示词"""
    return {
        "chat": """你是一个专业的中文小说写作助手。请根据用户提供的上下文信息，帮助用户解答写作相关的问题，提供创意建议，讨论情节发展，或协助解决写作困难。你的回答应该专业、有建设性，并且符合中文小说的写作习惯。""",

        "continue": """你是一个专业的中文小说续写助手。请根据用户提供的故事内容自然地续写下去。续写要求：
1. 符合已有的故事情节和人物设定
2. 保持一致的写作风格
3. 推进故事情节发展
4. 生成约160个tokens的内容（约120-200字）
5. 续写内容应直接连接在已有文本后面，不要添加换行或空格
6. 如果有写作指导，严格按照指导进行续写""",

        "suggest": """你是一个专业的中文小说写作建议助手。请分析用户提供的作品内容，并给出具体的改进建议。建议类型可能包括：情节发展、人物塑造、对话优化、描写增强、节奏调整等。请提供3-5条具体可行的建议，每条建议应该简洁明了，并说明改进的理由。""",

        "summary": """你是一个专业的章节摘要助手。请为用户提供的章节内容生成简洁的摘要。摘要应该概括章节的主要情节和事件，提及重要的人物和对话，长度控制在100-200字，便于后续章节的理解。"""
    }
```

#### Context Formatting
```python
def _format_context_for_user(self, context: Dict) -> str:
    """格式化上下文信息为用户消息"""
    formatted_parts = []

    # 作品信息
    if context.get('work_title'):
        formatted_parts.append(f"作品标题：{context['work_title']}")

    if context.get('synopsis'):
        formatted_parts.append(f"作品大纲：{context['synopsis']}")

    # 世界观设定
    if context.get('lore_entries'):
        lore_info = []
        for entry in context['lore_entries']:
            lore_info.append(f"- {entry['name']}: {entry['description']}")
        if lore_info:
            formatted_parts.append(f"世界观设定：\n" + "\n".join(lore_info))

    # 历史章节摘要
    if context.get('recent_chapter_summaries'):
        summaries = "\n".join(context['recent_chapter_summaries'])
        formatted_parts.append(f"最近章节摘要：\n{summaries}")

    # 当前章节信息
    if context.get('chapter_title'):
        formatted_parts.append(f"当前章节：{context['chapter_title']}")

    if context.get('current_chapter_content'):
        formatted_parts.append(f"当前内容：\n{context['current_chapter_content']}")

    return "\n\n".join(formatted_parts)
```

## AI Service Operations

### 1. Chat AI
```python
async def chat_with_ai_stream(self, context: Dict, user_message: str, chat_history: List[Dict] = None, chapter_id: int = None) -> AsyncGenerator[str, None]:
    """AI聊天功能 - 流式版本，支持聊天历史"""
    try:
        # 格式化上下文信息
        formatted_context = self._format_context_for_user(context)
        instructions = "你是中文小说写作助手。请简洁回答写作相关问题，提供创意建议或讨论情节。回答要专业、有建设性，控制在100字以内。支持Markdown格式。"

        # 构建消息列表，包含聊天历史
        messages = []

        # 添加系统指令和上下文
        system_content = f"{instructions}\n\n{formatted_context}"
        messages.append({"role": "system", "content": system_content})

        # 添加聊天历史（如果有）
        if chat_history:
            for msg in chat_history:
                if msg.get('role') in ['user', 'assistant']:
                    messages.append({
                        "role": msg['role'],
                        "content": msg['content']
                    })

        # 添加当前用户消息
        messages.append({"role": "user", "content": user_message})

        async for chunk in self.deepseek.chat_completion_stream(messages, "deepseek-chat"):
            yield chunk

    except Exception as e:
        logger.error(f"Chat AI stream error for chapter {chapter_id}: {str(e)}", exc_info=True)
        raise Exception(f"AI聊天失败: {str(e)}")
```

### 2. Continue Writing AI
```python
async def continue_writing_stream(self, context: Dict, guide: Optional[str] = None, chapter_id: int = None, token_count: int = 160) -> AsyncGenerator[str, None]:
    """AI续写功能 - 流式版本"""
    try:
        # 分别格式化历史上下文和当前内容
        historic_context = self._format_historic_context(context)
        current_content = context.get('current_chapter_content', '')

        # 构建用户消息，包含所有指令
        instructions = f"""你是一个专业的中文小说续写助手。请直接从用户提供的文章末尾无缝继续写作，不要重复已有内容或另起段落。续写要求：
1. 从文章最后一个字符直接继续，不添加换行、空格或任何分隔
2. 符合已有的故事情节和人物设定
3. 保持一致的写作风格
4. 推进故事情节发展
5. 生成约{token_count}个tokens的内容
6. 如果有写作指导，严格按照指导进行续写
7. 续写内容必须与前文语义连贯，就像是同一段落的延续
8. 不要过度在意输出的长度。生成后不要思考生成了多少token

历史文章：{historic_context if historic_context.strip() else "无"}"""

        if guide:
            user_content = f"{instructions}\n指引：{guide}\n\n正文：\n{current_content}"
        else:
            user_content = f"{instructions}\n\n正文：\n{current_content}"

        messages = [
            {"role": "user", "content": user_content}
        ]

        # Use the streaming API
        async for chunk in self.deepseek.chat_completion_stream(messages, "deepseek-chat", max_tokens=token_count):
            yield chunk

    except Exception as e:
        logger.error(f"Continue writing stream AI error for chapter {chapter_id}: {str(e)}", exc_info=True)
        raise Exception(f"AI续写失败: {str(e)}")
```

### 3. Suggestion AI
```python
async def generate_suggestions(self, chapter: Chapter, target_text: Optional[str] = None) -> List[Dict]:
    """生成写作建议 - 返回单个JSON格式的建议"""
    # Build context in sync environment to avoid async issues
    from asgiref.sync import sync_to_async
    context = await sync_to_async(ContextBuilder.build_context)(chapter)

    target_info = f"针对以下文本段落：『{target_text}』" if target_text else "针对当前章节内容"
    instructions = f"""你是一个专业的中文小说写作建议助手。请分析用户提供的作品内容，并给出一条具体的改进建议。

请以JSON格式返回，格式如下：
{{
  "建议": "具体的写作建议内容，应该简洁明了并说明改进理由"
}}

建议类型可能包括：情节发展、人物塑造、对话优化、描写增强、节奏调整等。"""

    context_info = f"故事上下文：{json.dumps(context, ensure_ascii=False)}"
    messages = [
        {"role": "user", "content": f"{instructions}\n\n{context_info}\n\n请为这个故事提供一条写作建议。{target_info}"}
    ]

    try:
        response = await self.deepseek.chat_completion(
            messages,
            "deepseek-chat",
            stream=False,
            response_format={'type': 'json_object'}
        )
        content = response["choices"][0]["message"]["content"]

        # 解析JSON响应
        json_response = json.loads(content)
        suggestion_content = json_response.get("建议", "")

        # Create suggestion in database
        suggestion = await sync_to_async(Suggestion.objects.create)(
            work=chapter.work,
            chapter=chapter,
            suggestion_type='improve',
            content=suggestion_content,
            target_text=target_text or '',
            trigger_reason='manual' if target_text else 'auto',
            model_used='deepseek-chat'
        )

        return [{
            'id': suggestion.id,
            'type': suggestion.suggestion_type,
            'content': suggestion.content,
            'target_text': suggestion.target_text
        }]

    except Exception as e:
        logger.error(f"Generate suggestions error: {str(e)}")
        return [{"content": f"AI建议生成暂时不可用。错误信息：{str(e)}", "type": "error"}]
```

### 4. Summary AI
```python
async def generate_summary_stream(self, chapter: Chapter) -> AsyncGenerator[str, None]:
    """生成章节摘要 - 流式版本"""
    # Build context in sync environment
    from asgiref.sync import sync_to_async
    context = await sync_to_async(ContextBuilder.build_context)(chapter, include_current_content=True)

    instructions = "你是一个专业的章节摘要助手。请为用户提供的章节内容生成简洁的摘要。摘要应该概括章节的主要情节和事件，提及重要的人物和对话，长度控制在100-200字，便于后续章节的理解。"
    messages = [
        {"role": "user", "content": f"{instructions}\n\n请为以下章节生成摘要：\n\n标题：{chapter.title}\n\n内容：{chapter.content}"}
    ]

    try:
        async for chunk in self.deepseek.chat_completion_stream(messages, "deepseek-chat"):
            yield chunk
    except Exception as e:
        logger.error(f"Generate summary stream error: {str(e)}")
        raise Exception(f"摘要生成失败: {str(e)}")
```

## Async Execution Wrapper

### Synchronous Wrapper for Django Views
```python
def run_async_ai_task(coro):
    """在同步环境中运行异步AI任务"""
    logger.debug("Starting async AI task")

    import asyncio

    try:
        # Create a wrapper to handle the coroutine
        async def wrapper():
            return await coro

        # Use asyncio.run for a clean execution
        result = asyncio.run(wrapper())
        logger.info("Async AI task completed successfully")
        return result

    except RuntimeError as e:
        if "asyncio.run() cannot be called from a running event loop" in str(e):
            # If we're already in an event loop context, try the thread approach
            logger.debug("Already in event loop, using thread executor")
            return _run_in_thread(coro)
        else:
            logger.error(f"Runtime error in async task: {str(e)}", exc_info=True)
            raise
    except Exception as e:
        logger.error(f"Error in async AI task: {str(e)}", exc_info=True)
        raise

def _run_in_thread(coro):
    """Run coroutine in a separate thread with its own event loop"""
    import asyncio
    import concurrent.futures

    def run_coro():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(run_coro)
        return future.result(timeout=120)
```

## Configuration & Settings

### Required Environment Variables
```python
# settings.py
DEEPSEEK_API_KEY = env('DEEPSEEK_API_KEY', default='')
DEEPSEEK_API_BASE = env('DEEPSEEK_API_BASE', default='https://api.deepseek.com')

# Logging configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': 'ai_services.log',
        },
    },
    'loggers': {
        'ai_services': {
            'handlers': ['file'],
            'level': 'INFO',
            'propagate': True,
        },
    },
}
```

### Model Usage Guidelines

#### deepseek-chat Model
- **Best for**: Chat, suggestions, summaries
- **Characteristics**: Fast, cost-effective
- **Token limits**: Up to 4096 context, 2048 output

#### deepseek-reasoner Model (if available)
- **Best for**: Complex reasoning tasks
- **Characteristics**: Slower but more thoughtful
- **Use cases**: Story analysis, plot consistency checking

## Error Handling & Fallbacks

### Mock Responses for Development
```python
# When DEEPSEEK_API_KEY is not configured
if not self.api_key:
    logger.info("Using mock AI response (no API key configured)")
    user_message = messages[-1].get('content', '') if messages else ''
    mock_content = f"这是一个模拟的AI回复。您的消息是：{user_message[:50]}..."

    return {
        "choices": [{
            "message": {"content": mock_content}
        }]
    }
```

### API Error Handling
```python
try:
    response = await self.client.chat.completions.create(...)
except Exception as e:
    logger.error(f"DeepSeek API error: {str(e)}")
    if "rate_limit" in str(e).lower():
        raise Exception("API调用频率过高，请稍后重试")
    elif "context_length" in str(e).lower():
        raise Exception("内容过长，请尝试缩短文本")
    else:
        raise Exception(f"AI服务暂时不可用：{str(e)}")
```

## Performance Optimization

### Context Size Management
```python
def _truncate_content_if_needed(self, content: str, max_length: int = 8000) -> str:
    """截断内容以避免上下文过长"""
    if len(content) <= max_length:
        return content

    # 从后往前保留内容，保持故事连贯性
    return "..." + content[-max_length:]
```

### Concurrent Request Handling
```python
# Use asyncio.gather for parallel requests
async def process_multiple_chapters(self, chapters: List[Chapter]):
    """并发处理多个章节的摘要生成"""
    tasks = [
        self.generate_summary(chapter)
        for chapter in chapters
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)
    return results
```

## Monitoring & Analytics

### Request Tracking
```python
# In models.py
class AIRequest(models.Model):
    """AI请求记录"""
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    request_type = models.CharField(max_length=50)  # chat, continue, suggest, summary
    work = models.ForeignKey(Work, on_delete=models.CASCADE, null=True)
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, null=True)

    prompt_tokens = models.IntegerField(default=0)
    completion_tokens = models.IntegerField(default=0)
    total_tokens = models.IntegerField(default=0)

    response_time = models.FloatField()  # seconds
    success = models.BooleanField(default=True)
    error_message = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
```

### Usage Analytics
```python
async def track_ai_request(self, request_type: str, user: User, response_time: float,
                          success: bool = True, error_message: str = ""):
    """记录AI请求使用情况"""
    await sync_to_async(AIRequest.objects.create)(
        user=user,
        request_type=request_type,
        response_time=response_time,
        success=success,
        error_message=error_message
    )
```

The AI services system provides comprehensive, context-aware AI assistance for novel writing with robust error handling, streaming capabilities, and intelligent context management.