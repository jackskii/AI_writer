import json
import asyncio
from typing import Dict, List, Optional, AsyncGenerator
from django.conf import settings
from apps.works.models import Work, Chapter, LoreEntry
from apps.chat.models import AIRequest
from .models import Suggestion
import logging
from openai import AsyncOpenAI

logger = logging.getLogger('ai_services')


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
    
    async def chat_completion(self, messages: List[Dict], model: str = "deepseek-chat", stream: bool = True, max_tokens: int = 2000, response_format: Optional[Dict] = None) -> Dict:
        """发送聊天完成请求"""
        # Return mock response if API key is not configured
        if not self.api_key:
            logger.info("Using mock AI response (no API key configured)")
            user_message = messages[-1].get('content', '') if messages else ''
            mock_content = f"这是一个模拟的AI回复。您的消息是：{user_message[:50]}..."
            
            return {
                "choices": [{
                    "message": {
                        "content": mock_content
                    }
                }]
            }
        
        try:
            if stream:
                # Stream response and collect chunks
                content_chunks = []
                stream_kwargs = {
                    "model": model,
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": max_tokens,
                    "stream": True
                }
                if response_format:
                    stream_kwargs["response_format"] = response_format
                
                stream_response = await self.client.chat.completions.create(**stream_kwargs)
                
                async for chunk in stream_response:
                    if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta and chunk.choices[0].delta.content:
                        content_chunks.append(chunk.choices[0].delta.content)
                
                # Return in the same format as non-streaming
                full_content = ''.join(content_chunks)
                return {
                    "choices": [{
                        "message": {
                            "content": full_content
                        }
                    }]
                }
            else:
                # Non-streaming response
                non_stream_kwargs = {
                    "model": model,
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": max_tokens,
                    "stream": False
                }
                if response_format:
                    non_stream_kwargs["response_format"] = response_format
                
                response = await self.client.chat.completions.create(**non_stream_kwargs)
                return {
                    "choices": [{
                        "message": {
                            "content": response.choices[0].message.content
                        }
                    }]
                }
                
        except Exception as e:
            logger.error(f"DeepSeek API error: {str(e)}")
            raise

    async def chat_completion_stream(self, messages: List[Dict], model: str = "deepseek-chat", max_tokens: int = 2000) -> AsyncGenerator[str, None]:
        """发送聊天完成请求并流式返回内容片段"""
        # Return mock response if API key is not configured
        if not self.api_key:
            logger.info("Using mock AI streaming response (no API key configured)")
            user_message = messages[-1].get('content', '') if messages else ''
            mock_content = f"这是一个模拟的AI流式回复。您的消息是：{user_message[:50]}..."
            
            # Yield mock content in chunks to simulate streaming
            words = mock_content.split()
            for i, word in enumerate(words):
                if i == 0:
                    yield word
                else:
                    yield f" {word}"
                await asyncio.sleep(0.1)  # Simulate delay
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
                if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
                    
        except Exception as e:
            logger.error(f"DeepSeek API streaming error: {str(e)}")
            raise


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


class AIService:
    """AI服务管理器"""
    
    def __init__(self):
        self.deepseek = DeepSeekAPI()
        self.system_prompts = self.__init_system_prompts()
        
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
        
    def _format_historic_context(self, context: Dict) -> str:
        """格式化历史上下文信息（大纲、摘要等）"""
        historic_parts = []
        
        # 作品大纲
        if context.get('synopsis'):
            historic_parts.append(f"作品大纲：{context['synopsis']}")
            
        # 世界观设定
        if context.get('lore_entries'):
            lore_info = []
            for entry in context['lore_entries']:
                lore_info.append(f"- {entry['name']}: {entry['description']}")
            if lore_info:
                historic_parts.append(f"世界观设定：\n" + "\n".join(lore_info))
        
        # 历史章节摘要
        if context.get('recent_chapter_summaries'):
            summaries = "\n".join(context['recent_chapter_summaries'])
            historic_parts.append(f"历史章节摘要：\n{summaries}")
            
        return "\n\n".join(historic_parts)
        
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
    
    async def chat_with_ai(self, context: Dict, user_message: str, chapter_id: int = None) -> str:
        """AI聊天功能"""
        logger.debug(f"Starting AI chat for chapter {chapter_id}: {user_message[:50]}...")
        
        try:
            logger.debug(f"Using provided context with {len(context.get('lore_entries', []))} lore entries")
            
            # 格式化上下文和用户消息，包含所有指令
            formatted_context = self._format_context_for_user(context)
            instructions = "你是一个专业的中文小说写作助手。请根据用户提供的上下文信息，帮助用户解答写作相关的问题，提供创意建议，讨论情节发展，或协助解决写作困难。你的回答应该专业、有建设性，并且符合中文小说的写作习惯。"
            user_content = f"{instructions}\n\n{formatted_context}\n\n用户问题：{user_message}"
            
            messages = [
                {"role": "user", "content": user_content}
            ]
            
            logger.debug(f"Sending {len(messages)} messages to DeepSeek API with streaming")
            response = await self.deepseek.chat_completion(messages, "deepseek-chat", stream=True)
            logger.info(f"AI chat completed successfully for chapter {chapter_id}")
            return response["choices"][0]["message"]["content"]
            
        except Exception as e:
            logger.error(f"Chat AI error for chapter {chapter_id}: {str(e)}", exc_info=True)
            raise Exception(f"AI聊天失败: {str(e)}")
    
    async def continue_writing(self, context: Dict, guide: Optional[str] = None, chapter_id: int = None, token_count: int = 160) -> str:
        """AI续写功能"""
        logger.debug(f"Starting AI continue writing for chapter {chapter_id}, guide: {guide}, token_count: {token_count}")
        
        try:
            logger.debug(f"Using provided context - current content length: {len(context.get('current_chapter_content', ''))}")
            
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
            
            logger.info(f"Continue writing API request - messages: {messages}")
            logger.debug(f"Sending continue writing request to DeepSeek API with streaming, max_tokens: {token_count}")
            response = await self.deepseek.chat_completion(messages, "deepseek-chat", stream=True, max_tokens=token_count)
            result = response["choices"][0]["message"]["content"]
            logger.info(f"AI continue writing completed successfully for chapter {chapter_id}, result length: {len(result)}")
            return result
            
        except Exception as e:
            logger.error(f"Continue writing AI error for chapter {chapter_id}: {str(e)}", exc_info=True)
            raise Exception(f"AI续写失败: {str(e)}")
    
    async def continue_writing_stream(self, context: Dict, guide: Optional[str] = None, chapter_id: int = None, token_count: int = 160) -> AsyncGenerator[str, None]:
        """AI续写功能 - 流式版本"""
        logger.debug(f"Starting AI continue writing stream for chapter {chapter_id}, guide: {guide}, token_count: {token_count}")
        
        try:
            logger.debug(f"Using provided context - current content length: {len(context.get('current_chapter_content', ''))}")
            
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
            
            logger.info(f"Continue writing stream API request - messages: {messages}")
            logger.debug(f"Sending continue writing stream request to DeepSeek API, max_tokens: {token_count}")
            
            # Use the new streaming API
            async for chunk in self.deepseek.chat_completion_stream(messages, "deepseek-chat", max_tokens=token_count):
                yield chunk
            
            logger.info(f"AI continue writing stream completed successfully for chapter {chapter_id}")
            
        except Exception as e:
            logger.error(f"Continue writing stream AI error for chapter {chapter_id}: {str(e)}", exc_info=True)
            raise Exception(f"AI续写失败: {str(e)}")
    
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
            try:
                json_response = json.loads(content)
                suggestion_content = json_response.get("建议", "")
                
                if not suggestion_content:
                    # 如果JSON中没有"建议"键，尝试其他可能的键
                    suggestion_content = json_response.get("suggestion", json_response.get("content", "无法生成建议"))
                
                # Create suggestion in database
                async def create_suggestion(content_text):
                    def _create():
                        return Suggestion.objects.create(
                            work=chapter.work,
                            chapter=chapter,
                            suggestion_type='improve',
                            content=content_text,
                            target_text=target_text or '',
                            trigger_reason='manual' if target_text else 'auto',
                            model_used='deepseek-chat'
                        )
                    return await sync_to_async(_create)()
                
                suggestion = await create_suggestion(suggestion_content)
                
                return [{
                    'id': suggestion.id,
                    'type': suggestion.suggestion_type,
                    'content': suggestion.content,
                    'target_text': suggestion.target_text
                }]
                
            except json.JSONDecodeError as je:
                logger.error(f"Failed to parse JSON response: {content}")
                # 如果JSON解析失败，返回原始内容
                return [{"content": content, "type": "text"}]
            
        except Exception as e:
            logger.error(f"Generate suggestions error: {str(e)}")
            return [{"content": f"AI建议生成暂时不可用。错误信息：{str(e)}", "type": "error"}]
    
    async def generate_summary(self, chapter: Chapter) -> str:
        """生成章节摘要"""
        # Build context in sync environment to avoid async issues
        from asgiref.sync import sync_to_async
        context = await sync_to_async(ContextBuilder.build_context)(chapter, include_current_content=True)
        
        instructions = "你是一个专业的章节摘要助手。请为用户提供的章节内容生成简洁的摘要。摘要应该概括章节的主要情节和事件，提及重要的人物和对话，长度控制在100-200字，便于后续章节的理解。"
        messages = [
            {"role": "user", "content": f"{instructions}\n\n请为以下章节生成摘要：\n\n标题：{chapter.title}\n\n内容：{chapter.content}"}
        ]
        
        try:
            response = await self.deepseek.chat_completion(messages, "deepseek-chat")
            return response["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"Generate summary error: {str(e)}")
            return f"章节《{chapter.title}》摘要生成失败：{str(e)}"
    
    async def generate_summary_stream(self, chapter: Chapter) -> AsyncGenerator[str, None]:
        """生成章节摘要 - 流式版本"""
        # Build context in sync environment to avoid async issues
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


# 同步包装器，用于在Django视图中调用
from asgiref.sync import sync_to_async
import threading

def run_async_ai_task(coro):
    """在同步环境中运行异步AI任务"""
    logger.debug("Starting async AI task")
    
    # Use asyncio.run which creates a clean event loop
    import asyncio
    import functools
    
    try:
        # Create a wrapper to handle the coroutine
        async def wrapper():
            return await coro
        
        # Use asyncio.run for a clean execution
        logger.debug("Running coroutine with asyncio.run")
        result = asyncio.run(wrapper())
        logger.debug(f"Async task completed, result length: {len(str(result))}")
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