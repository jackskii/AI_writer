import json
import asyncio
from typing import Dict, List, Optional, AsyncGenerator
from django.conf import settings
from apps.works.models import Work, Chapter, LoreEntry
from apps.chat.models import AIRequest
from .models import Suggestion
from . import prompts
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
        response_format: Optional[Dict] = None
    ) -> Dict:
        """Send chat completion request"""
        model = model or prompts.DEFAULT_MODEL
        max_tokens = max_tokens or prompts.DEFAULT_MAX_TOKENS

        try:
            if stream:
                # Stream response and collect chunks
                content_chunks = []
                stream_kwargs = {
                    "model": model,
                    "messages": messages,
                    "temperature": prompts.DEFAULT_TEMPERATURE,
                    "max_tokens": max_tokens,
                    "stream": True
                }
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
                    "temperature": prompts.DEFAULT_TEMPERATURE,
                    "max_tokens": max_tokens,
                    "stream": False
                }
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
        max_tokens: int = None
    ) -> AsyncGenerator[str, None]:
        """Send chat completion request and stream content chunks"""
        model = model or prompts.DEFAULT_MODEL
        max_tokens = max_tokens or prompts.DEFAULT_MAX_TOKENS

        try:
            stream_response = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=prompts.DEFAULT_TEMPERATURE,
                max_tokens=max_tokens,
                stream=True
            )

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
        """Build AI context with full chapter content"""
        work = chapter.work

        # Basic context
        context = {
            "synopsis": work.synopsis,
            "work_title": work.title,
            "chapter_title": chapter.title,
            "current_chapter_content": chapter.content if include_current_content else "",
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

        # Get ALL previous chapters with full content
        previous_chapters = ContextBuilder._get_all_previous_chapters(chapter)
        context["previous_chapters"] = previous_chapters

        return context

    @staticmethod
    def build_work_overview_context(work: Work) -> Dict:
        """Build context for work-level discussions with full chapter content"""
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

        # Get ALL chapters with full content
        all_chapters = []
        chapters = work.chapters.all().order_by('order')
        for chapter in chapters:
            chapter_text = f"第{chapter.chapter_number}章《{chapter.title}》\n\n{chapter.content or '(空章节)'}"
            all_chapters.append(chapter_text)

        context["all_chapters"] = all_chapters
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
        """Get ALL previous chapters with full content"""
        chapters = chapter.work.chapters.filter(
            order__lt=chapter.order
        ).order_by('order')

        previous_chapters = []
        for ch in chapters:
            chapter_text = f"第{ch.chapter_number}章《{ch.title}》\n\n{ch.content or '(空章节)'}"
            previous_chapters.append(chapter_text)

        return previous_chapters

    @staticmethod
    def build_summary_context(chapter: Chapter) -> str:
        """Build context specifically for chapter summarization (work synopsis + last 3 chapter summaries)"""
        work = chapter.work
        context_parts = []

        # Add work synopsis
        if work.synopsis:
            context_parts.append(f"作品大纲：{work.synopsis}")

        # Get last 3 chapter summaries
        recent_summaries = ContextBuilder._get_recent_chapter_summaries(chapter, count=3)
        if recent_summaries:
            context_parts.append("前文摘要：\n" + "\n".join(recent_summaries))

        return "\n\n".join(context_parts)


class AIService:
    """AI Service Manager"""

    def __init__(self, api_key: str = None):
        self.deepseek = DeepSeekAPI(api_key=api_key)

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
            response = await self.deepseek.chat_completion(
                messages,
                stream=False,
                response_format={'type': 'json_object'}
            )
            content = response["choices"][0]["message"]["content"]

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
            async for chunk in self.deepseek.chat_completion_stream(messages, model=prompts.CHAT_MODEL):
                yield chunk
        except Exception as e:
            logger.error(f"Generate summary stream error: {str(e)}")
            raise Exception(f"{prompts.ERROR_SUMMARY_FAILED}: {str(e)}")

    async def chat_with_ai_stream(
        self,
        context: Dict,
        user_message: str,
        chat_history: List[Dict] = None,
        chapter_id: int = None,
        model: str = None
    ) -> AsyncGenerator[str, None]:
        """AI chat function - streaming version with chat history support"""
        # Use provided model or default to prompts.CHAT_MODEL
        model = model or prompts.CHAT_MODEL
        scope = context.get('context_scope', 'chapter')
        logger.debug(f"Starting AI chat stream for scope {scope} (chapter {chapter_id}) with model {model}: {user_message[:50]}...")

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

            logger.debug(f"Sending {len(messages)} messages to DeepSeek API for streaming with model {model}")

            async for chunk in self.deepseek.chat_completion_stream(messages, model=model):
                yield chunk

        except Exception as e:
            logger.error(f"Chat AI stream error for chapter {chapter_id}: {str(e)}", exc_info=True)
            raise Exception(f"{prompts.ERROR_CHAT_FAILED}: {str(e)}")

    async def auto_edit_stream(self, selected_text: str, context: str = "", model: str = "deepseek-chat", edit_requirement: str = None) -> AsyncGenerator[str, None]:
        """AI auto-edit function - streaming version"""
        logger.debug(f"Starting AI auto-edit stream for text: {selected_text[:50]}... with model: {model}")

        try:
            # Format the request with context and edit requirement
            user_message = prompts.format_auto_edit_request(context, selected_text, edit_requirement)

            # Build message with system prompt and context + selected text
            messages = [
                {"role": "system", "content": prompts.AUTO_EDIT_SYSTEM_PROMPT},
                {"role": "user", "content": user_message}
            ]

            logger.debug(f"Sending streaming auto-edit request to DeepSeek API with model: {model}")

            async for chunk in self.deepseek.chat_completion_stream(messages, model=model):
                yield chunk

        except Exception as e:
            logger.error(f"Auto-edit stream error: {str(e)}", exc_info=True)
            raise Exception(f"{prompts.ERROR_AUTO_EDIT_FAILED}: {str(e)}")

    async def analyze_writing_style(self, text_sample: str) -> Dict:
        """分析文本样本的写作风格 - 使用deepseek-reasoner模型"""
        logger.debug(f"Starting writing style analysis for text of length: {len(text_sample)}")

        try:
            # Construct analysis prompt with strict JSON schema enforcement
            analysis_prompt = f"""你是一位专业的写作风格分析师。请根据以下文本样本，提取并生成一份可复用的写作风格指南。这份指南将用于指导AI模仿这种风格进行创作。

重要原则：
1. 生成通用的风格描述，不要包含具体角色名字、地名、情节等样本特定内容
2. 提取可迁移的写作技巧、句式模式、用词习惯等
3. 示例句要足够长且完整（至少50-100字），能充分展现该维度的风格特征
4. 示例要有代表性，让AI能从中学习到具体的写作模式

文本样本：
{text_sample}

请从以下维度提取写作风格：

1. **句式特点**：句子长度偏好、结构复杂度、特殊句式使用规律（如倒装、排比、反问等）
2. **词汇风格**：用词倾向（口语/书面语、古典/现代、简洁/华丽）、特色词汇类型、修饰语使用习惯
3. **节奏韵律**：叙述节奏快慢、段落长短控制、信息密度、张弛有度的手法
4. **对话风格**：对话呈现方式、语气特点、对话标签使用、对话与叙述的比例
5. **描写手法**：描写详略程度、感官运用偏好、比喻修辞习惯、环境/心理/动作描写特色

输出要求：
- 总体描述：100-150字，概括这种风格的整体特征、可能的文学流派/类型、风格相近的知名作家
- 每个维度：详细描述（150-200字）+ 3-5个示例句（每个示例50-100字）
- 示例必须从原文摘取，但要去除具体人名、地名（可用"他/她"、"某地"等替代）

必须返回完整的JSON，包含overall字段和所有5个维度。

请严格按照以下JSON格式返回：
{{
  "overall": "这种风格整体呈现...（100-150字的总体描述，包括流派、类型、相似作家等）",
  "perspectives": [
    {{
      "name": "句式特点",
      "description": "详细描述句式风格的通用特征...",
      "examples": ["示例句1（50-100字，已去除具体人名地名）", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "词汇风格",
      "description": "详细描述用词习惯...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "节奏韵律",
      "description": "详细描述节奏控制...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "对话风格",
      "description": "详细描述对话特点...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "描写手法",
      "description": "详细描述描写方式...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }}
  ]
}}"""

            messages = [
                {"role": "user", "content": analysis_prompt}
            ]

            logger.debug("Sending style analysis request to DeepSeek API with deepseek-reasoner model")

            # Use deepseek-reasoner model for analysis with JSON response format
            # Set max_tokens to 64000 to ensure complete output
            response = await self.deepseek.chat_completion(
                messages,
                model="deepseek-reasoner",
                stream=False,
                max_tokens=64000,
                response_format={"type": "json_object"}
            )

            # Extract JSON from response
            content = response["choices"][0]["message"]["content"]

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
            # Construct NSFW analysis prompt with strict JSON schema enforcement
            analysis_prompt = f"""你是一位专业的成人文学写作风格分析师。请根据以下NSFW文本样本，提取并生成一份可复用的情色写作风格指南。这份指南将用于指导AI模仿这种风格进行NSFW内容创作。

重要原则：
1. 生成通用的风格描述，不要包含具体角色名字、关系、情节等样本特定内容
2. 提取可迁移的情色描写技巧、用词习惯、节奏控制等写作模式
3. 示例句要足够长且完整（至少50-100字），能充分展现该维度的风格特征和尺度
4. 示例要有代表性，让AI能从中学习到具体的情色描写手法
5. 保留原文的露骨程度和用词风格（委婉/直白），这是风格的核心特征

文本样本：
{text_sample}

请从以下维度提取写作风格：

1. **情欲描写**：情欲场景的描写手法、尺度把握（委婉/露骨）、感官刺激呈现方式、场景推进节奏
2. **身体描写**：身体部位描写的详略程度、用词风格（优美/粗俗）、触感表现手法、敏感部位描写习惯
3. **动作描写**：亲密动作的描写细节程度、动作节奏快慢、动词选择倾向、动态感营造技巧
4. **对话风格**：情色对话的语气特点、用词直白程度、喘息呻吟的表现方式、对话推进情欲的手法
5. **氛围营造**：情欲氛围的铺垫方式、情绪递进节奏、高潮前后的节奏控制、环境渲染手法
6. **心理描写**：欲望/羞耻/快感等心理的刻画深度、内心独白风格、心理与生理反应的结合方式

输出要求：
- 总体描述：100-150字，概括这种NSFW风格的整体特征、尺度定位（软色情/硬核）、可能的题材类型、风格相近的作家/作品
- 每个维度：详细描述（150-200字）+ 3-5个示例句（每个示例50-100字，保留完整的情色描写）
- 示例必须从原文摘取，但要去除具体人名、关系称呼（可用"他/她"、"对方"等替代）
- 示例必须保留原文的露骨程度和情色用词，这是学习风格的关键

必须返回完整的JSON，包含overall字段和所有6个维度。

请严格按照以下JSON格式返回：
{{
  "overall": "这种NSFW风格整体呈现...（100-150字的总体描述，包括尺度、题材、相似作品等）",
  "perspectives": [
    {{
      "name": "情欲描写",
      "description": "详细描述情欲场景风格的通用特征...",
      "examples": ["示例句1（50-100字，保留完整情色内容，已去除具体人名）", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "身体描写",
      "description": "详细描述身体描写习惯...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "动作描写",
      "description": "详细描述动作描写方式...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "对话风格",
      "description": "详细描述对话特点...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "氛围营造",
      "description": "详细描述氛围控制...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }},
    {{
      "name": "心理描写",
      "description": "详细描述心理刻画...",
      "examples": ["示例句1", "示例句2", "示例句3", "示例句4", "示例句5"]
    }}
  ]
}}"""

            messages = [
                {"role": "user", "content": analysis_prompt}
            ]

            logger.debug("Sending NSFW style analysis request to DeepSeek API with deepseek-reasoner model")

            # Use deepseek-reasoner model for analysis with JSON response format
            # Set max_tokens to 64000 to ensure complete output
            response = await self.deepseek.chat_completion(
                messages,
                model="deepseek-reasoner",
                stream=False,
                max_tokens=64000,
                response_format={"type": "json_object"}
            )

            # Extract JSON from response
            content = response["choices"][0]["message"]["content"]

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
