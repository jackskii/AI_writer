import json
import asyncio
from typing import Dict, List, Optional, AsyncGenerator
from django.conf import settings
from apps.works.models import Work, Chapter, LoreEntry, Act
from apps.chat.models import AIRequest
from .models import Suggestion
from . import prompts
from .providers import get_provider, LLMProvider, PROVIDER_CONFIG
import logging
from openai import AsyncOpenAI

logger = logging.getLogger('ai_services')


class DeepSeekAPI:
    """DeepSeek API Client - Uses OpenAI client library"""

    def __init__(self, api_key: str = None):
        # Use provided API key, or fall back to settings (for backward compatibility)
        self.api_key = api_key or getattr(settings, 'DEEPSEEK_API_KEY', None)
        self.base_url = settings.DEEPSEEK_API_BASE

        if not self.api_key:
            raise ValueError("API密钥未配置。请在设置中配置您的DeepSeek API密钥。")

        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url
        )

    async def chat_completion(
        self,
        messages: List[Dict],
        model: str = None,
        stream: bool = True,
        max_tokens: int = None,
        response_format: Optional[Dict] = None,
        temperature: float = None,
        top_p: float = None,
        frequency_penalty: float = None,
        presence_penalty: float = None
    ) -> Dict:
        """Send chat completion request"""
        model = model or prompts.DEFAULT_MODEL
        max_tokens = max_tokens or prompts.DEFAULT_MAX_TOKENS
        temperature = temperature if temperature is not None else prompts.DEFAULT_TEMPERATURE

        try:
            if stream:
                # Stream response and collect chunks
                content_chunks = []
                stream_kwargs = {
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": True
                }
                if top_p is not None:
                    stream_kwargs["top_p"] = top_p
                if frequency_penalty is not None:
                    stream_kwargs["frequency_penalty"] = frequency_penalty
                if presence_penalty is not None:
                    stream_kwargs["presence_penalty"] = presence_penalty
                if response_format:
                    stream_kwargs["response_format"] = response_format

                stream_response = await self.client.chat.completions.create(**stream_kwargs)

                reasoning_chunks = []
                content_chunks = []
                async for chunk in stream_response:
                    if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta:
                        delta = chunk.choices[0].delta
                        # Collect reasoning content (for deepseek-reasoner)
                        if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                            reasoning_chunks.append(delta.reasoning_content)
                        # Collect regular content
                        if delta.content:
                            content_chunks.append(delta.content)

                # Return in the same format as non-streaming
                reasoning_content = ''.join(reasoning_chunks)
                content = ''.join(content_chunks)

                # Format: show reasoning before content
                full_content = ""
                if reasoning_content:
                    full_content = f"【思考过程】\n{reasoning_content}\n\n【回答】\n{content}"
                else:
                    full_content = content

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
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": False
                }
                if top_p is not None:
                    non_stream_kwargs["top_p"] = top_p
                if frequency_penalty is not None:
                    non_stream_kwargs["frequency_penalty"] = frequency_penalty
                if presence_penalty is not None:
                    non_stream_kwargs["presence_penalty"] = presence_penalty
                if response_format:
                    non_stream_kwargs["response_format"] = response_format

                response = await self.client.chat.completions.create(**non_stream_kwargs)

                message = response.choices[0].message
                reasoning_content = getattr(message, 'reasoning_content', '')
                content = message.content

                # Format: show reasoning before content
                full_content = ""
                if reasoning_content:
                    full_content = f"【思考过程】\n{reasoning_content}\n\n【回答】\n{content}"
                else:
                    full_content = content

                return {
                    "choices": [{
                        "message": {
                            "content": full_content
                        }
                    }]
                }

        except Exception as e:
            logger.error(f"DeepSeek API error: {str(e)}")
            raise

    async def chat_completion_stream(
        self,
        messages: List[Dict],
        model: str = None,
        max_tokens: int = None,
        stop: List[str] = None,
        temperature: float = None,
        top_p: float = None,
        frequency_penalty: float = None,
        presence_penalty: float = None
    ) -> AsyncGenerator[str, None]:
        """Send chat completion request and stream content chunks"""
        model = model or prompts.DEFAULT_MODEL
        max_tokens = max_tokens or prompts.DEFAULT_MAX_TOKENS
        temperature = temperature if temperature is not None else prompts.DEFAULT_TEMPERATURE

        try:
            kwargs = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": True
            }
            if top_p is not None:
                kwargs["top_p"] = top_p
            if frequency_penalty is not None:
                kwargs["frequency_penalty"] = frequency_penalty
            if presence_penalty is not None:
                kwargs["presence_penalty"] = presence_penalty
            if stop:
                kwargs["stop"] = stop

            stream_response = await self.client.chat.completions.create(**kwargs)

            reasoning_started = False
            content_started = False

            async for chunk in stream_response:
                if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta:
                    delta = chunk.choices[0].delta

                    # Handle reasoning content (for deepseek-reasoner)
                    if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                        if not reasoning_started:
                            yield "【思考过程】\n"
                            reasoning_started = True
                        yield delta.reasoning_content

                    # Handle regular content
                    if delta.content:
                        if not content_started:
                            if reasoning_started:
                                yield "\n\n【回答】\n"
                            content_started = True
                        yield delta.content

        except Exception as e:
            logger.error(f"DeepSeek API streaming error: {str(e)}")
            raise


class ContextBuilder:
    """Context builder - Provides complete story context for AI"""

    @staticmethod
    def build_context(chapter: Chapter, include_current_content: bool = True) -> Dict:
        """Build chapter chat context.

        Required context for chapter chatbot:
        - Work synopsis
        - Past act synopses
        - Chapter summaries for past chapters in current act
        - Full text of current chapter
        """
        work = chapter.work

        # Basic context
        context = {
            "synopsis": work.synopsis,
            "work_title": work.title,
            "chapter_title": chapter.title,
            "current_chapter_content": chapter.content if include_current_content else "",
        }

        # Chapter chatbot does not need lore/previous full chapter text in this mode
        context["lore_entries"] = []

        # Past act synopses
        context["previous_act_synopses"] = ContextBuilder._get_previous_act_synopses(chapter)

        # Past chapter summaries in current act
        context["current_act_chapter_summaries"] = ContextBuilder._get_current_act_chapter_summaries(chapter)

        return context

    @staticmethod
    def build_work_overview_context(work: Work) -> Dict:
        """Build work chat context.

        Required context for work chatbot:
        - Work synopsis
        - All act synopses
        - All lore entries
        """
        context = {
            "context_scope": "work_overview",
            "work_title": work.title,
            "synopsis": work.synopsis,
            "lore_entries": [
                {
                    "name": entry.name,
                    "description": entry.description,
                    "triggers": entry.all_triggers
                }
                for entry in work.lore_entries.all().order_by('name')
            ]
        }

        # All act synopses in order (keep non-empty ones)
        all_acts = Act.objects.filter(work=work).exclude(synopsis__isnull=True).exclude(synopsis='').order_by('order')
        context["all_act_synopses"] = [f"【{act.name}】\n{act.synopsis}" for act in all_acts]
        return context

    @staticmethod
    def _get_triggered_lore_entries(chapter: Chapter) -> List[LoreEntry]:
        """Get triggered lore entries"""
        content = f"{chapter.work.synopsis} {chapter.content}".lower()
        triggered_entries = []

        for entry in chapter.work.lore_entries.all():
            for trigger in entry.all_triggers:
                if trigger.lower() in content:
                    triggered_entries.append(entry)
                    break

        return triggered_entries

    @staticmethod
    def _get_all_previous_chapters(chapter: Chapter) -> List[str]:
        """Get ALL previous chapters with full content (legacy - consider using _get_recent_chapter_content)
        
        Excludes chapters from side chapters acts for normal chapters.
        """
        # Check if current chapter is in a side chapters act
        current_act = chapter.act
        is_side_chapter = current_act and current_act.act_type == 'side_chapters'
        
        if is_side_chapter:
            # Side chapters don't see other chapters
            return []
        
        # For normal chapters, exclude chapters from side chapters acts
        chapters = chapter.work.chapters.filter(
            order__lt=chapter.order
        ).exclude(act__act_type='side_chapters').order_by('order')

        previous_chapters = []
        for ch in chapters:
            chapter_text = f"第{ch.chapter_number}章《{ch.title}》\n\n{ch.content or '(空章节)'}"
            previous_chapters.append(chapter_text)

        return previous_chapters

    @staticmethod
    def _get_recent_chapter_content(chapter: Chapter, count: int = 1) -> List[str]:
        """Get full content of the most recent N chapters before this one
        
        Args:
            chapter: Current chapter
            count: Number of previous chapters to include (default 1)
        
        Excludes chapters from side chapters acts for normal chapters.
        Side chapters return empty list.
        """
        # Check if current chapter is in a side chapters act
        current_act = chapter.act
        is_side_chapter = current_act and current_act.act_type == 'side_chapters'
        
        if is_side_chapter:
            # Side chapters don't see other chapters
            return []
        
        # For normal chapters, exclude chapters from side chapters acts
        chapters = chapter.work.chapters.filter(
            order__lt=chapter.order
        ).exclude(act__act_type='side_chapters').order_by('-order')[:count]

        recent_chapters = []
        for ch in reversed(list(chapters)):
            chapter_text = f"第{ch.chapter_number}章《{ch.title}》\n\n{ch.content or '(空章节)'}"
            recent_chapters.append(chapter_text)

        return recent_chapters

    @staticmethod
    def _get_recent_chapter_summaries(chapter: Chapter, count: int = 3) -> List[str]:
        """Get summaries from the most recent chapters before this one
        
        Excludes chapters from side chapters acts for normal chapters.
        Side chapters return empty list.
        """
        # Check if current chapter is in a side chapters act
        current_act = chapter.act
        is_side_chapter = current_act and current_act.act_type == 'side_chapters'
        
        if is_side_chapter:
            # Side chapters don't see other chapters
            return []
        
        # For normal chapters, exclude chapters from side chapters acts
        chapters = chapter.work.chapters.filter(
            order__lt=chapter.order
        ).exclude(act__act_type='side_chapters').exclude(summary__isnull=True).exclude(summary='').order_by('-order')[:count]

        summaries = []
        for ch in reversed(list(chapters)):
            summaries.append(f"第{ch.chapter_number}章《{ch.title}》：\n{ch.summary}")

        return summaries

    @staticmethod
    def _get_previous_act_synopses(chapter: Chapter) -> List[str]:
        """Get synopses of all previous acts (books) before the current chapter's act
        
        For normal chapters: excludes side chapters acts.
        For side chapters: only includes normal acts (all of them, not just previous).
        """
        current_act = chapter.act
        if not current_act:
            return []
        
        from apps.works.models import Act
        
        is_side_chapter = current_act.act_type == 'side_chapters'
        
        if is_side_chapter:
            # Side chapters see all normal act synopses (not just previous)
            normal_acts = Act.objects.filter(
                work=chapter.work,
                act_type='normal'
            ).exclude(synopsis__isnull=True).exclude(synopsis='').order_by('order')
        else:
            # Normal chapters see previous normal acts only
            normal_acts = Act.objects.filter(
                work=chapter.work,
                act_type='normal',
                order__lt=current_act.order
            ).exclude(synopsis__isnull=True).exclude(synopsis='').order_by('order')

        synopses = []
        for act in normal_acts:
            synopses.append(f"【{act.name}】\n{act.synopsis}")

        return synopses

    @staticmethod
    def _get_current_act_chapter_summaries(chapter: Chapter) -> List[str]:
        """Get chapter summaries from the current act, before the current chapter
        
        For side chapters: returns empty list (they don't see other side chapters).
        """
        current_act = chapter.act
        if not current_act:
            return []
        
        # Side chapters don't see other side chapters
        if current_act.act_type == 'side_chapters':
            return []
        
        # Get chapters in current act before current chapter
        chapters = current_act.chapters.filter(
            order__lt=chapter.order
        ).exclude(summary__isnull=True).exclude(summary='').order_by('order')

        summaries = []
        for ch in chapters:
            summaries.append(f"第{ch.chapter_number}章《{ch.title}》：\n{ch.summary}")

        return summaries

    @staticmethod
    def build_summary_context(chapter: Chapter) -> str:
        """Build context specifically for chapter summarization (work synopsis + last 3 chapter summaries)
        
        For side chapters: only includes work synopsis (no chapter summaries).
        """
        work = chapter.work
        context_parts = []

        # Add work synopsis
        if work.synopsis:
            context_parts.append(f"作品大纲：{work.synopsis}")

        # Get last 3 chapter summaries (excludes side chapters for normal chapters, empty for side chapters)
        recent_summaries = ContextBuilder._get_recent_chapter_summaries(chapter, count=3)
        if recent_summaries:
            context_parts.append("前文摘要：\n\n" + "\n\n".join(recent_summaries))

        return "\n\n".join(context_parts)

    @staticmethod
    def build_enhanced_context(chapter: Chapter, recent_content_count: int = 1) -> Dict:
        """Build enhanced AI context using act synopses + chapter summaries + recent content
        
        New context strategy:
        - All synopses for previous acts (books)
        - All chapter synopses in current act (before current chapter)
        - Full content for previous N chapters (default N=1)
        - Triggered lore entries
        
        For side chapters, uses build_side_chapters_context instead.
        """
        # Check if this is a side chapter
        current_act = chapter.act
        if current_act and current_act.act_type == 'side_chapters':
            return ContextBuilder.build_side_chapters_context(chapter)
        
        work = chapter.work

        # Basic context
        context = {
            "synopsis": work.synopsis,
            "work_title": work.title,
            "chapter_title": chapter.title,
            "current_chapter_content": chapter.content,
        }

        # Get triggered lore entries
        lore_entries = ContextBuilder._get_triggered_lore_entries(chapter)
        context["lore_entries"] = [
            {
                "name": entry.name,
                "description": entry.description,
                "triggers": entry.all_triggers
            }
            for entry in lore_entries
        ]

        # Get previous act synopses
        previous_act_synopses = ContextBuilder._get_previous_act_synopses(chapter)
        context["previous_act_synopses"] = previous_act_synopses

        # Get current act chapter summaries
        current_act_summaries = ContextBuilder._get_current_act_chapter_summaries(chapter)
        context["current_act_chapter_summaries"] = current_act_summaries

        # Get recent chapter content (full content for last N chapters)
        recent_content = ContextBuilder._get_recent_chapter_content(chapter, count=recent_content_count)
        context["recent_chapter_content"] = recent_content

        return context

    @staticmethod
    def build_side_chapters_context(chapter: Chapter) -> Dict:
        """Build context specifically for side chapters
        
        Side chapters context:
        - Work synopsis
        - All normal act synopses (not side chapters acts)
        - Triggered lore entries
        - NO chapter content or summaries
        """
        work = chapter.work

        # Basic context
        context = {
            "synopsis": work.synopsis,
            "work_title": work.title,
            "chapter_title": chapter.title,
            "current_chapter_content": chapter.content,
        }

        # Get triggered lore entries
        lore_entries = ContextBuilder._get_triggered_lore_entries(chapter)
        context["lore_entries"] = [
            {
                "name": entry.name,
                "description": entry.description,
                "triggers": entry.all_triggers
            }
            for entry in lore_entries
        ]

        # Get all normal act synopses (not side chapters acts)
        from apps.works.models import Act
        normal_acts = Act.objects.filter(
            work=work,
            act_type='normal'
        ).exclude(synopsis__isnull=True).exclude(synopsis='').order_by('order')

        act_synopses = []
        for act in normal_acts:
            act_synopses.append(f"【{act.name}】\n{act.synopsis}")

        context["normal_act_synopses"] = act_synopses
        context["current_act_chapter_summaries"] = []  # Side chapters don't see other side chapters
        context["recent_chapter_content"] = []  # Side chapters don't see chapter content
        context["previous_act_synopses"] = act_synopses  # For compatibility

        return context


class AIService:
    """AI Service Manager"""

    def __init__(self, api_key: str = None, provider_name: str = 'deepseek'):
        self.provider_name = provider_name
        # Use provider abstraction for supported providers
        if provider_name in PROVIDER_CONFIG:
            self.provider = get_provider(provider_name, api_key)
        else:
            # Fallback to DeepSeek for backward compatibility
            self.provider = get_provider('deepseek', api_key)

        # Keep deepseek reference for backward compatibility with existing code
        # that specifically uses deepseek-reasoner (like style analysis)
        self.deepseek = DeepSeekAPI(api_key=api_key) if provider_name == 'deepseek' else None

    def _format_context_for_user(self, context: Dict) -> str:
        """Format context information for user message"""
        formatted_parts = []

        # Work info
        if context.get('work_title') or context.get('synopsis'):
            work_info = prompts.format_work_info(
                context.get('work_title', ''),
                context.get('synopsis', '')
            )
            if work_info:
                formatted_parts.append(work_info)

        # Lore entries
        if context.get('lore_entries'):
            lore_info = prompts.format_lore_entries(context['lore_entries'])
            if lore_info:
                formatted_parts.append(lore_info)

        # Previous act synopses (chapter chat)
        if context.get('previous_act_synopses'):
            formatted_parts.append("前卷摘要：\n\n" + "\n\n".join(context['previous_act_synopses']))

        # Previous chapter summaries in current act (chapter chat)
        if context.get('current_act_chapter_summaries'):
            formatted_parts.append("本卷前文章节摘要：\n\n" + "\n\n".join(context['current_act_chapter_summaries']))

        # All act synopses (work chat)
        if context.get('all_act_synopses'):
            formatted_parts.append("全书各卷摘要：\n\n" + "\n\n".join(context['all_act_synopses']))

        # Previous chapters with full content (for chapter-level chat)
        if context.get('previous_chapters'):
            previous_text = "前文章节：\n\n" + "\n\n---\n\n".join(context['previous_chapters'])
            formatted_parts.append(previous_text)

        # All chapters with full content (for work-level chat)
        if context.get('all_chapters'):
            all_chapters_text = "所有章节：\n\n" + "\n\n---\n\n".join(context['all_chapters'])
            formatted_parts.append(all_chapters_text)

        # Current chapter
        chapter_info = prompts.format_current_chapter(
            context.get('chapter_title', ''),
            context.get('current_chapter_content', '')
        )
        if chapter_info:
            formatted_parts.append(chapter_info)

        return "\n\n".join(formatted_parts)

    def _format_historic_context(self, context: Dict) -> str:
        """Format historic context (synopsis, previous chapters, lore)"""
        historic_parts = []

        # Work synopsis
        if context.get('synopsis'):
            historic_parts.append(f"作品大纲：{context['synopsis']}")

        # Lore entries
        if context.get('lore_entries'):
            lore_info = prompts.format_lore_entries(context['lore_entries'])
            if lore_info:
                historic_parts.append(lore_info)

        # Previous act synopses
        if context.get('previous_act_synopses'):
            historic_parts.append("前卷摘要：\n\n" + "\n\n".join(context['previous_act_synopses']))

        # Current act chapter summaries
        if context.get('current_act_chapter_summaries'):
            historic_parts.append("本卷前文章节摘要：\n\n" + "\n\n".join(context['current_act_chapter_summaries']))

        # All act synopses (work overview)
        if context.get('all_act_synopses'):
            historic_parts.append("全书各卷摘要：\n\n" + "\n\n".join(context['all_act_synopses']))

        # Previous chapters with full content
        if context.get('previous_chapters'):
            previous_text = "前文章节：\n\n" + "\n\n---\n\n".join(context['previous_chapters'])
            historic_parts.append(previous_text)

        return "\n\n".join(historic_parts)

    async def generate_suggestions(self, chapter: Chapter, target_text: Optional[str] = None) -> List[Dict]:
        """Generate writing suggestions - returns single JSON formatted suggestion"""
        # Build context in sync environment to avoid async issues
        from asgiref.sync import sync_to_async
        context = await sync_to_async(ContextBuilder.build_context)(chapter)

        context_info = f"故事上下文：{json.dumps(context, ensure_ascii=False)}"
        user_content = prompts.format_suggest_request(context_info, target_text)

        messages = [
            {"role": "user", "content": user_content}
        ]

        try:
            response = await self.provider.chat_completion(
                messages,
                model=prompts.DEFAULT_MODEL,
                temperature=prompts.DEFAULT_TEMPERATURE
            )
            content = response

            # Parse JSON response
            try:
                json_response = json.loads(content)
                suggestion_content = json_response.get("建议", "")

                if not suggestion_content:
                    # Try other possible keys if "建议" is not present
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
                            model_used=prompts.DEFAULT_MODEL
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
                # Return raw content if JSON parsing fails
                return [{"content": content, "type": "text"}]

        except Exception as e:
            logger.error(f"Generate suggestions error: {str(e)}")
            return [{"content": f"{prompts.ERROR_SUGGEST_FAILED}：{str(e)}", "type": "error"}]

    async def generate_summary_stream(self, chapter: Chapter) -> AsyncGenerator[str, None]:
        """Generate chapter summary - streaming version"""
        # Build summary context (work synopsis + last 3 chapter summaries)
        from asgiref.sync import sync_to_async
        summary_context = await sync_to_async(ContextBuilder.build_summary_context)(chapter)

        user_content = prompts.format_summary_request(chapter.title, chapter.content, summary_context)
        messages = [
            {"role": "user", "content": user_content}
        ]

        try:
            async for chunk in self.provider.chat_completion_stream(messages):
                yield chunk
        except Exception as e:
            logger.error(f"Generate summary stream error: {str(e)}")
            raise Exception(f"{prompts.ERROR_SUMMARY_FAILED}: {str(e)}")

    async def generate_act_synopsis_stream(
        self,
        act,
        chapter_summaries: str,
        lore_entries_text: str = ""
    ) -> AsyncGenerator[str, None]:
        """Generate act/book synopsis - streaming version
        
        Args:
            act: The Act object
            chapter_summaries: Pre-formatted chapter summaries
            lore_entries_text: Pre-formatted lore entries text
        """
        user_content = prompts.format_act_synopsis_request(
            act.name,
            chapter_summaries,
            lore_entries_text
        )
        messages = [
            {"role": "user", "content": user_content}
        ]

        try:
            async for chunk in self.provider.chat_completion_stream(messages):
                yield chunk
        except Exception as e:
            logger.error(f"Generate act synopsis stream error: {str(e)}")
            raise Exception(f"卷摘要生成失败: {str(e)}")

    async def chat_with_ai_stream(
        self,
        context: Dict,
        user_message: str,
        chat_history: List[Dict] = None,
        chapter_id: int = None,
        model: str = None,
        temperature: float = None,
        top_p: float = None,
        max_tokens: int = None,
        frequency_penalty: float = None,
        presence_penalty: float = None
    ) -> AsyncGenerator[str, None]:
        """AI chat function - streaming version with chat history support"""
        # Use provided model or let provider determine default
        scope = context.get('context_scope', 'chapter')
        logger.debug(f"Starting AI chat stream for scope {scope} (chapter {chapter_id}) with model {model or 'provider default'}: {user_message[:50]}...")

        try:
            logger.debug(f"Using provided context with {len(context.get('lore_entries', []))} lore entries")

            # Format context information
            formatted_context = self._format_context_for_user(context)

            # Build message list with chat history
            messages = []

            # Add system instruction and context
            system_content = f"{prompts.CHAT_STREAM_SYSTEM_PROMPT}\n\n{formatted_context}"
            messages.append({"role": "system", "content": system_content})

            # Add chat history (if provided)
            if chat_history:
                for msg in chat_history:
                    if msg.get('role') in ['user', 'assistant']:
                        messages.append({
                            "role": msg['role'],
                            "content": msg['content']
                        })

            # Add current user message
            messages.append({"role": "user", "content": user_message})

            logger.debug(f"Sending {len(messages)} messages to {self.provider.provider_name} API for streaming with model {model or 'provider default'}")

            async for chunk in self.provider.chat_completion_stream(
                messages,
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                frequency_penalty=frequency_penalty,
                presence_penalty=presence_penalty
            ):
                yield chunk

        except Exception as e:
            logger.error(f"Chat AI stream error for chapter {chapter_id}: {str(e)}", exc_info=True)
            raise Exception(f"{prompts.ERROR_CHAT_FAILED}: {str(e)}")

    async def auto_edit_stream(
        self,
        selected_text: str,
        context: str = "",
        model: str = None,  # Let provider determine default model
        edit_requirement: str = None,
        temperature: float = None,
        top_p: float = None,
        max_tokens: int = None,
        frequency_penalty: float = None,
        presence_penalty: float = None
    ) -> AsyncGenerator[str, None]:
        """AI auto-edit function - streaming version"""
        logger.debug(f"Starting AI auto-edit stream for text: {selected_text[:50] if selected_text else '(empty)'}... with model: {model or 'provider default'}")

        try:
            # Format the request with context and edit requirement
            user_message = prompts.format_auto_edit_request(context, selected_text, edit_requirement)

            # Build message with system prompt and context + selected text
            messages = [
                {"role": "system", "content": prompts.AUTO_EDIT_SYSTEM_PROMPT},
                {"role": "user", "content": user_message}
            ]

            logger.debug(f"Sending streaming auto-edit request to {self.provider.provider_name} API with model: {model or 'provider default'}")

            # Use provider's streaming method
            # Note: stop sequences may not be supported by all providers
            async for chunk in self.provider.chat_completion_stream(
                messages,
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                frequency_penalty=frequency_penalty,
                presence_penalty=presence_penalty
            ):
                yield chunk

        except Exception as e:
            logger.error(f"Auto-edit stream error: {str(e)}", exc_info=True)
            raise Exception(f"{prompts.ERROR_AUTO_EDIT_FAILED}: {str(e)}")

    async def auto_describe_entry_stream(
        self,
        entry_name: str,
        context_text: str,
        additional_context: str = "",
        is_update: bool = False,
        original_description: str = "",
        custom_template: str = ""
    ) -> AsyncGenerator[str, None]:
        """AI auto-describe entry function - streaming version
        
        Args:
            entry_name: Name of the entry/character
            context_text: Chapter content for context
            additional_context: Optional additional context from user
            is_update: Whether this is updating an existing description
            original_description: The original description (for update mode)
            custom_template: Optional custom template for the work
        """
        logger.debug(f"Starting AI auto-describe stream for entry: {entry_name} (update={is_update})")

        try:
            # Format the request using prompts.py
            user_message = prompts.format_auto_describe_request(
                entry_name, 
                context_text,
                additional_context=additional_context,
                is_update=is_update,
                original_description=original_description,
                custom_template=custom_template
            )

            messages = [
                {"role": "user", "content": user_message}
            ]

            logger.debug(f"Sending streaming auto-describe request to {self.provider.provider_name} API")

            async for chunk in self.provider.chat_completion_stream(messages):
                yield chunk

        except Exception as e:
            logger.error(f"Auto-describe stream error: {str(e)}", exc_info=True)
            raise Exception(f"{prompts.ERROR_AUTO_DESCRIBE_FAILED}: {str(e)}")

    async def analyze_writing_style(self, text_sample: str) -> Dict:
        """分析文本样本的写作风格 - 使用deepseek-reasoner模型"""
        logger.debug(f"Starting writing style analysis for text of length: {len(text_sample)}")

        try:
            # Use prompt from prompts.py
            analysis_prompt = prompts.format_style_analysis_request(text_sample)

            messages = [
                {"role": "user", "content": analysis_prompt}
            ]

            logger.debug(f"Sending style analysis request to {self.provider.provider_name} API")

            # Use reasoning model if available, otherwise use default model
            if self.provider.supports_reasoning and self.provider.reasoning_model:
                model = self.provider.reasoning_model
                logger.debug(f"Using reasoning model: {model}")
            else:
                model = self.provider.default_model
                logger.debug(f"Provider does not support reasoning, using default model: {model}")

            # Use provider's chat_completion method
            response = await self.provider.chat_completion(
                messages,
                model=model,
                max_tokens=64000
            )

            # Extract content from response (provider returns string directly)
            content = response

            # Parse JSON (handle case where reasoning is included)
            # If content has reasoning sections, extract just the JSON part
            if "【回答】" in content:
                # Extract content after 【回答】
                json_part = content.split("【回答】")[-1].strip()
            else:
                json_part = content

            try:
                analysis_result = json.loads(json_part)
                logger.debug(f"Successfully parsed analysis result with {len(analysis_result.get('perspectives', []))} perspectives")
                return analysis_result
            except json.JSONDecodeError as json_err:
                logger.error(f"Failed to parse JSON from AI response: {json_err}")
                logger.error(f"Response content: {content[:500]}")
                # Return a fallback structure
                return {
                    "overall": "AI返回格式异常，请重试",
                    "perspectives": [
                        {
                            "name": "分析结果",
                            "description": content,
                            "examples": []
                        }
                    ]
                }

        except Exception as e:
            logger.error(f"Writing style analysis error: {str(e)}", exc_info=True)
            raise Exception(f"写作风格分析失败: {str(e)}")

    async def analyze_nsfw_writing_style(self, text_sample: str) -> Dict:
        """分析NSFW文本样本的写作风格 - 使用deepseek-reasoner模型"""
        logger.debug(f"Starting NSFW writing style analysis for text of length: {len(text_sample)}")

        try:
            # Use prompt from prompts.py
            analysis_prompt = prompts.format_nsfw_style_analysis_request(text_sample)

            messages = [
                {"role": "user", "content": analysis_prompt}
            ]

            logger.debug(f"Sending NSFW style analysis request to {self.provider.provider_name} API")

            # Use reasoning model if available, otherwise use default model
            if self.provider.supports_reasoning and self.provider.reasoning_model:
                model = self.provider.reasoning_model
                logger.debug(f"Using reasoning model: {model}")
            else:
                model = self.provider.default_model
                logger.debug(f"Provider does not support reasoning, using default model: {model}")

            # Use provider's chat_completion method
            response = await self.provider.chat_completion(
                messages,
                model=model,
                max_tokens=64000
            )

            # Extract content from response (provider returns string directly)
            content = response

            # Parse JSON (handle case where reasoning is included)
            # If content has reasoning sections, extract just the JSON part
            if "【回答】" in content:
                # Extract content after 【回答】
                json_part = content.split("【回答】")[-1].strip()
            else:
                json_part = content

            try:
                analysis_result = json.loads(json_part)
                logger.debug(f"Successfully parsed NSFW analysis result with {len(analysis_result.get('perspectives', []))} perspectives")
                return analysis_result
            except json.JSONDecodeError as json_err:
                logger.error(f"Failed to parse JSON from AI response: {json_err}")
                logger.error(f"Response content: {content[:500]}")
                # Return a fallback structure
                return {
                    "overall": "AI返回格式异常，请重试",
                    "perspectives": [
                        {
                            "name": "分析结果",
                            "description": content,
                            "examples": []
                        }
                    ]
                }

        except Exception as e:
            logger.error(f"NSFW writing style analysis error: {str(e)}", exc_info=True)
            raise Exception(f"NSFW写作风格分析失败: {str(e)}")


# Sync wrapper for use in Django views
from asgiref.sync import sync_to_async
import threading

def run_async_ai_task(coro):
    """Run async AI task in sync environment"""
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
