from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.http import StreamingHttpResponse, JsonResponse, HttpResponse
from django.db import models
from asgiref.sync import sync_to_async
from apps.works.models import Work, Act, Chapter, LoreEntry, Faction
from .services import AIService, run_async_ai_task, strip_chat_reasoning
from . import prompts
import logging
import json
import re
import asyncio
import uuid

logger = logging.getLogger(__name__)


def parse_reasoning_mode(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


# Async helper functions for database operations
@sync_to_async
def get_user_api_key_async(user):
    """获取用户的API密钥 (async version)"""
    from apps.user_auth.models import UserSettings
    settings = UserSettings.objects.get(user=user)
    api_key = settings.get_api_key_for_provider()
    provider = settings.api_provider
    default_model = settings.get_default_model()
    if not api_key:
        raise ValueError("API密钥未配置")
    return api_key, provider, default_model


@sync_to_async
def get_deepseek_api_key_async(user):
    """获取用户的DeepSeek API密钥 (async version)

    轻量任务（摘要、卷摘要）强制使用 DeepSeek + deepseek-v4-pro，
    不论用户当前选用的 provider。需要用户已配置 DeepSeek API 密钥。
    """
    from apps.user_auth.models import UserSettings
    settings = UserSettings.objects.get(user=user)
    api_key = settings.get_api_key_for_provider('deepseek')
    if not api_key or not api_key.strip():
        raise ValueError("此功能需要配置 DeepSeek API 密钥")
    return api_key


@sync_to_async
def get_auto_describe_provider_async(user):
    """Resolve provider for auto-describe: OpenRouter glm-5.3, else DeepSeek."""
    from apps.user_auth.models import UserSettings
    settings = UserSettings.objects.get(user=user)
    openrouter_key = settings.get_api_key_for_provider('openrouter')
    if openrouter_key and openrouter_key.strip():
        return openrouter_key, 'openrouter', 'z-ai/glm-5.3', 'high'
    deepseek_key = settings.get_api_key_for_provider('deepseek')
    if deepseek_key and deepseek_key.strip():
        return deepseek_key, 'deepseek', 'deepseek-v4-pro', 'medium'
    raise ValueError("没有可用的自动描述 API 密钥")


@sync_to_async
def get_user_ai_settings(user):
    """获取用户的AI设置 (async version)"""
    from apps.user_auth.models import UserSettings
    try:
        settings = UserSettings.objects.get(user=user)
        return {
            'temperature': settings.temperature,
            'top_p': settings.top_p,
            'max_tokens': settings.max_tokens if settings.max_tokens != 0 else None,
            'frequency_penalty': settings.frequency_penalty,
            'presence_penalty': settings.presence_penalty,
            'reasoning_effort': settings.reasoning_effort or 'medium',
            'provider': settings.api_provider,
            'default_model': settings.get_default_model(),
        }
    except UserSettings.DoesNotExist:
        # Return defaults if settings don't exist
        return {
            'temperature': 0.7,
            'top_p': 1.0,
            'max_tokens': 2000,
            'frequency_penalty': 0.0,
            'presence_penalty': 0.0,
            'reasoning_effort': 'medium',
            'provider': 'deepseek',
            'default_model': 'deepseek-v4-pro',
        }


@sync_to_async
def get_token_user(token_key):
    """Get user from token (async version)"""
    from rest_framework.authtoken.models import Token
    token_obj = Token.objects.get(key=token_key)
    return token_obj.user


@sync_to_async
def get_work_and_chapter(work_id, chapter_id=None):
    """Get work and optionally chapter (async version)"""
    work = Work.objects.get(id=work_id)
    if chapter_id:
        chapter = Chapter.objects.get(id=chapter_id, work=work)
        return work, chapter
    return work, None


@sync_to_async
def get_chat_history(work, chapter, user):
    """Get chat history (async version)"""
    from apps.chat.models import ChatSession
    try:
        session = ChatSession.objects.get(work=work, chapter=chapter, user=user)
        recent_messages = session.messages.all().order_by('-created_at')[:10]
        return [
            {
                'role': msg.role,
                'content': strip_chat_reasoning(msg.content) if msg.role == 'assistant' else msg.content,
            }
            for msg in reversed(list(recent_messages))
        ]
    except ChatSession.DoesNotExist:
        return []


@sync_to_async
def get_work_chat_history(work, user):
    """Get work-level chat history (async version)"""
    from apps.chat.models import WorkChatSession, WorkChatMessage
    session, _ = WorkChatSession.objects.get_or_create(
        work=work, user=user, defaults={'session_id': str(uuid.uuid4())}
    )
    recent_messages = WorkChatMessage.objects.filter(session=session).order_by('-created_at')[:10]
    return [
        {
            'role': msg.role,
            'content': strip_chat_reasoning(msg.content) if msg.role == 'assistant' else msg.content,
        }
        for msg in reversed(list(recent_messages))
    ]


@sync_to_async
def get_act_by_id(work_id, act_id, user):
    """Get act by id (async version)"""
    work = get_object_or_404(Work, id=work_id, author=user)
    act = get_object_or_404(Act, id=act_id, work=work)
    return act


@sync_to_async
def get_all_chapters_in_act(act):
    """Get all chapters in an act"""
    return list(act.chapters.select_related('act').order_by('order'))


@sync_to_async
def get_lore_entries_for_act(act):
    """Get lore entries that appear in any chapter of the act"""
    from django.db.models import Q
    
    # Get all chapter content in this act
    chapters = act.chapters.all()
    lore_entries = LoreEntry.objects.filter(work=act.work)
    
    # Find lore entries that are mentioned in chapter content
    found_entries = []
    for entry in lore_entries:
        # Check all triggers including name
        all_triggers = [entry.name] + list(entry.triggers or []) + list(entry.extra_triggers or [])
        for chapter in chapters:
            if chapter.content:
                for trigger in all_triggers:
                    if trigger and trigger in chapter.content:
                        found_entries.append(entry)
                        break
                else:
                    continue
                break
    
    return found_entries


@sync_to_async
def build_auto_edit_context(work, chapter, user, style_id, selected_lore_ids, selected_faction_ids, chapter_selection, custom_chapter_count, use_nsfw_style=False):
    """Build context for auto-edit (async version)
    
    Context includes previous act synopses and current-act chapter summaries.
    Full-text chapters (chapter_selection custom/all) are selected from the
    current arc first; overflow at arc start pulls from the previous normal arc
    only. Cross-act full text is rendered under 前卷章节全文; in-act full text
    under 本卷前文章节.
    
    For side chapters: only includes work synopsis, normal act synopses, and selected lore entries.
    """
    formatted_context = ""

    # Check if this is a side chapter
    current_act = chapter.act
    is_side_chapter = current_act and current_act.act_type == 'side_chapters'

    # Add writing style if selected (regular styles only)
    if style_id:
        try:
            from apps.works.models import WritingStyle
            style = WritingStyle.objects.get(id=int(style_id), user=user, is_nsfw=False)
            formatted_context += f"写作风格参考：\n\n{style.style_data}\n\n---\n\n"
        except (WritingStyle.DoesNotExist, ValueError):
            pass

    if use_nsfw_style:
        try:
            from apps.works.models import WritingStyle
            nsfw_style = WritingStyle.objects.filter(user=user, is_nsfw=True).first()
            if nsfw_style and nsfw_style.style_data and nsfw_style.style_data.strip():
                formatted_context += f"NSFW风格参考：\n\n{nsfw_style.style_data.strip()}\n\n---\n\n"
        except Exception:
            pass

    # Add synopsis
    if work.synopsis:
        formatted_context += f"作品大纲：{work.synopsis}\n\n"

    act_outline = (current_act.outline or '').strip() if current_act else ''
    if act_outline and act_outline != prompts.OUTLINE_PLANNER_TEMPLATE.strip():
        formatted_context += f"本章大纲：\n{act_outline}\n\n"

    # Add selected lore entries
    if selected_lore_ids:
        lore_ids = [int(id.strip()) for id in selected_lore_ids.split(',') if id.strip()]
        if lore_ids:
            lore_entries = LoreEntry.objects.filter(id__in=lore_ids, work=work)
            if lore_entries:
                formatted_context += "世界观条目：\n\n"
                for entry in lore_entries:
                    formatted_context += f"【{entry.name}】\n{entry.description}\n\n"
                formatted_context += "---\n\n"

    # Add selected factions as lore-like context entries
    if selected_faction_ids:
        faction_ids = [int(id.strip()) for id in selected_faction_ids.split(',') if id.strip()]
        if faction_ids:
            factions = Faction.objects.filter(id__in=faction_ids, work=work)
            if factions:
                formatted_context += "阵营条目：\n\n"
                for faction in factions:
                    formatted_context += f"【{faction.name}】\n{faction.description or '(无描述)'}\n\n"
                formatted_context += "---\n\n"

    # For side chapters, only add normal act synopses (no chapter content)
    if is_side_chapter:
        from apps.works.models import Act
        normal_acts = Act.objects.filter(
            work=work,
            act_type='normal'
        ).exclude(synopsis__isnull=True).exclude(synopsis='').order_by('order')
        
        if normal_acts:
            formatted_context += "正文章节摘要：\n\n"
            for act in normal_acts:
                formatted_context += f"【{act.name}】\n{act.synopsis}\n\n"
            formatted_context += "---\n\n"
    else:
        # For normal chapters: ALWAYS include previous act synopses
        from apps.works.models import Act
        previous_acts = Act.objects.filter(
            work=work,
            act_type='normal',
            order__lt=current_act.order
        ).exclude(synopsis__isnull=True).exclude(synopsis='').order_by('order')
        
        if previous_acts:
            formatted_context += "前卷摘要：\n\n"
            for act in previous_acts:
                formatted_context += f"【{act.name}】\n{act.synopsis}\n\n"
            formatted_context += "---\n\n"
        
        # Get all previous chapters in current act (in order) — used for summary section
        all_previous_chapters = list(current_act.chapters.filter(
            order__lt=chapter.order
        ).select_related('act').order_by('order')) if current_act else []

        # Previous normal act (for overflow at the start of an arc)
        prev_normal_act = None
        if current_act and current_act.act_type == 'normal':
            prev_normal_act = Act.objects.filter(
                work=work,
                act_type='normal',
                order__lt=current_act.order
            ).order_by('-order').first()

        # Determine which chapters to include as full text
        chapters_to_replace_with_full_text = []
        if chapter_selection == 'none':
            chapters_to_replace_with_full_text = []
        elif chapter_selection == 'all':
            chapters_to_replace_with_full_text = list(all_previous_chapters)
            if not chapters_to_replace_with_full_text and prev_normal_act:
                chapters_to_replace_with_full_text = list(
                    prev_normal_act.chapters.select_related('act').order_by('order')
                )
        elif chapter_selection == 'custom':
            try:
                count = int(custom_chapter_count)
                count = max(0, count)
                if count > 0:
                    # In-arc previous chapters first, then overflow to the
                    # end of the previous normal act only.
                    in_act = list(all_previous_chapters)
                    if len(in_act) >= count:
                        chapters_to_replace_with_full_text = in_act[-count:]
                    else:
                        chapters_to_replace_with_full_text = in_act
                        remaining = count - len(in_act)
                        if remaining > 0 and prev_normal_act:
                            prev_act_chapters = list(
                                prev_normal_act.chapters.select_related('act').order_by('order')
                            )
                            chapters_to_replace_with_full_text += prev_act_chapters[-remaining:]
            except (TypeError, ValueError):
                chapters_to_replace_with_full_text = []

        replace_ids = {ch.id for ch in chapters_to_replace_with_full_text}

        cross_act_full = [
            ch for ch in chapters_to_replace_with_full_text
            if not current_act or ch.act_id != current_act.id
        ]
        if cross_act_full:
            formatted_context += "前卷章节全文：\n\n"
            for ch in cross_act_full:
                formatted_context += f"{prompts.format_chapter_label(ch.act.act_type, ch.act.order, ch.chapter_number, ch.title)}\n\n{ch.content or '(空章节)'}\n\n---\n\n"
            formatted_context += "---\n\n"

        # Add chapter summaries (or full text for replaced in-act chapters)
        if all_previous_chapters:
            formatted_context += "本卷前文章节：\n\n"

            for ch in all_previous_chapters:
                if ch.id in replace_ids:
                    formatted_context += f"{prompts.format_chapter_label(ch.act.act_type, ch.act.order, ch.chapter_number, ch.title)}\n\n{ch.content or '(空章节)'}\n\n---\n\n"
                elif ch.summary:
                    formatted_context += f"{prompts.format_chapter_label(ch.act.act_type, ch.act.order, ch.chapter_number, ch.title)}摘要：{ch.summary}\n\n"

            formatted_context += "---\n\n"

    # Add current chapter content at the end
    if chapter.content:
        formatted_context += f"当前章节{prompts.format_chapter_label(chapter.act.act_type, chapter.act.order, chapter.chapter_number, chapter.title)}全文：\n\n{chapter.content}\n\n---\n\n"

    return formatted_context


def get_user_api_key(user):
    """获取用户的API密钥和provider"""
    try:
        from apps.user_auth.models import UserSettings
        settings = UserSettings.objects.get(user=user)
        api_key = settings.get_api_key_for_provider()
        provider = settings.api_provider
        default_model = settings.get_default_model()
        if not api_key:
            raise ValueError("API密钥未配置")
        return api_key, provider, default_model
    except UserSettings.DoesNotExist:
        raise ValueError("用户设置不存在，请先配置API密钥")
    except Exception as e:
        raise ValueError(f"获取API密钥失败: {str(e)}")


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ai_suggest(request):
    """AI建议端点"""
    work_id = request.data.get('work_id')
    chapter_id = request.data.get('chapter_id')
    target_text = request.data.get('target_text')  # 可选的目标文本
    
    if not all([work_id, chapter_id]):
        return Response(
            {'error': '缺少必要参数'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # 获取作品和章节
    work = get_object_or_404(Work, id=work_id, author=request.user)
    chapter = get_object_or_404(Chapter, id=chapter_id, work=work)
    
    try:
        api_key, provider, default_model = get_user_api_key(request.user)
        ai_service = AIService(api_key=api_key, provider_name=provider, default_model=default_model)
        suggestions = run_async_ai_task(
            ai_service.generate_suggestions(chapter, target_text)
        )
        
        return Response({'suggestions': suggestions})
    
    except Exception as e:
        logger.error(f"AI suggest error: {str(e)}")
        return Response(
            {'error': f'AI建议生成出错：{str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse

@csrf_exempt
async def ai_chat_stream(request):
    """AI聊天端点 - SSE流式响应，支持聊天历史 (async version for ASGI)"""
    if request.method != 'GET':
        return HttpResponse(
            'data: {"type": "error", "message": "仅支持GET请求"}\n\n',
            content_type='text/event-stream'
        )

    # Check authentication via token query parameter for EventSource compatibility
    user = None
    token = request.GET.get('token')
    if token:
        try:
            user = await get_token_user(token)
        except Exception:
            return HttpResponse(
                'data: {"type": "error", "message": "认证令牌无效"}\n\n',
                content_type='text/event-stream',
                status=401
            )
    elif hasattr(request, 'user') and request.user.is_authenticated:
        user = request.user
    else:
        return HttpResponse(
            'data: {"type": "error", "message": "需要登录"}\n\n',
            content_type='text/event-stream',
            status=401
        )

    work_id = request.GET.get('work_id')
    chapter_id = request.GET.get('chapter_id')
    message = request.GET.get('message')
    model = request.GET.get('model')  # Let provider determine default model
    reasoning_mode = parse_reasoning_mode(request.GET.get('reasoning_mode'))

    if not all([work_id, chapter_id, message]):
        return HttpResponse(
            'data: {"type": "error", "message": "缺少必要参数"}\n\n',
            content_type='text/event-stream'
        )

    # Get work and chapter
    try:
        work, chapter = await get_work_and_chapter(work_id, chapter_id)
    except Exception:
        return HttpResponse(
            'data: {"type": "error", "message": "作品或章节不存在"}\n\n',
            content_type='text/event-stream',
            status=404
        )

    async def generate_stream():
        """生成SSE数据流 (async generator)"""
        try:
            # Get chat history
            chat_history = await get_chat_history(work, chapter, user)

            # Build context
            from .services import ContextBuilder
            context = await sync_to_async(ContextBuilder.build_context)(chapter)

            # Get API key and AI settings
            api_key, provider, default_model = await get_user_api_key_async(user)
            ai_settings = await get_user_ai_settings(user)
            ai_service = AIService(
                api_key=api_key,
                provider_name=provider,
                default_model=default_model,
                reasoning_effort=ai_settings.get('reasoning_effort', 'medium'),
            )

            # Send start event
            yield f'data: {json.dumps({"type": "start", "message": "AI聊天开始"})}\n\n'

            # Stream chunks directly from async generator
            accumulated_response = ''
            try:
                async for chunk in ai_service.chat_with_ai_stream(
                    context, message, chat_history, chapter.id, model,
                    reasoning_mode=reasoning_mode,
                    temperature=ai_settings['temperature'],
                    top_p=ai_settings['top_p'],
                    max_tokens=ai_settings['max_tokens'],
                    frequency_penalty=ai_settings['frequency_penalty'],
                    presence_penalty=ai_settings['presence_penalty']
                ):
                    accumulated_response += chunk
                    yield f'data: {json.dumps({"type": "chunk", "content": chunk})}\n\n'

                yield f'data: {json.dumps({"type": "end", "message": "AI聊天完成", "full_response": accumulated_response})}\n\n'
            except Exception as e:
                logger.error(f"Stream AI chat error during generation: {str(e)}")
                yield f'data: {json.dumps({"type": "error", "message": f"AI聊天失败: {str(e)}"})}\n\n'

        except Exception as e:
            logger.error(f"Stream AI chat error: {str(e)}")
            yield f'data: {json.dumps({"type": "error", "message": f"AI聊天失败: {str(e)}"})}\n\n'

    response = StreamingHttpResponse(
        generate_stream(),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    response['Access-Control-Allow-Origin'] = '*'
    return response


@csrf_exempt
async def ai_work_chat_stream(request):
    """作品总览AI聊天端点 - SSE流式响应 (async version for ASGI)"""
    if request.method != 'GET':
        return HttpResponse(
            'data: {"type": "error", "message": "仅支持GET请求"}\n\n',
            content_type='text/event-stream'
        )

    user = None
    token = request.GET.get('token')
    if token:
        try:
            user = await get_token_user(token)
        except Exception:
            return HttpResponse(
                'data: {"type": "error", "message": "认证令牌无效"}\n\n',
                content_type='text/event-stream',
                status=401
            )
    elif hasattr(request, 'user') and request.user.is_authenticated:
        user = request.user
    else:
        return HttpResponse(
            'data: {"type": "error", "message": "需要登录"}\n\n',
            content_type='text/event-stream',
            status=401
        )

    work_id = request.GET.get('work_id')
    message = request.GET.get('message')
    model = request.GET.get('model')  # Let provider determine default model
    reasoning_mode = parse_reasoning_mode(request.GET.get('reasoning_mode'))

    if not all([work_id, message]):
        return HttpResponse(
            'data: {"type": "error", "message": "缺少必要参数"}\n\n',
            content_type='text/event-stream'
        )

    try:
        work, _ = await get_work_and_chapter(work_id)
    except Exception:
        return HttpResponse(
            'data: {"type": "error", "message": "作品不存在"}\n\n',
            content_type='text/event-stream',
            status=404
        )

    async def generate_stream():
        """生成SSE数据流 (async generator)"""
        try:
            chat_history = await get_work_chat_history(work, user)

            from .services import ContextBuilder
            context = await sync_to_async(ContextBuilder.build_work_overview_context)(work)

            api_key, provider, default_model = await get_user_api_key_async(user)
            ai_settings = await get_user_ai_settings(user)
            ai_service = AIService(
                api_key=api_key,
                provider_name=provider,
                default_model=default_model,
                reasoning_effort=ai_settings.get('reasoning_effort', 'medium'),
            )

            yield f'data: {json.dumps({"type": "start", "message": "AI作品聊天开始"})}\n\n'

            accumulated_response = ''
            try:
                async for chunk in ai_service.chat_with_ai_stream(
                    context, message, chat_history, None, model,
                    reasoning_mode=reasoning_mode,
                    temperature=ai_settings['temperature'],
                    top_p=ai_settings['top_p'],
                    max_tokens=ai_settings['max_tokens'],
                    frequency_penalty=ai_settings['frequency_penalty'],
                    presence_penalty=ai_settings['presence_penalty']
                ):
                    accumulated_response += chunk
                    yield f'data: {json.dumps({"type": "chunk", "content": chunk})}\n\n'

                yield f'data: {json.dumps({"type": "end", "message": "AI聊天完成", "full_response": accumulated_response})}\n\n'
            except Exception as e:
                logger.error(f"Work chat stream error during generation: {str(e)}")
                yield f'data: {json.dumps({"type": "error", "message": f"AI聊天失败: {str(e)}"})}\n\n'

        except Exception as e:
            logger.error(f"Work chat stream error: {str(e)}")
            yield f'data: {json.dumps({"type": "error", "message": f"AI聊天失败: {str(e)}"})}\n\n'

    response = StreamingHttpResponse(
        generate_stream(),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    response['Access-Control-Allow-Origin'] = '*'
    return response


@csrf_exempt
async def ai_summarize_stream(request):
    """AI摘要端点 - SSE流式响应 (async version for ASGI)"""
    if request.method != 'GET':
        return HttpResponse(
            'data: {"type": "error", "message": "仅支持GET请求"}\n\n',
            content_type='text/event-stream'
        )

    user = None
    token = request.GET.get('token')
    if token:
        try:
            user = await get_token_user(token)
        except Exception:
            return HttpResponse(
                'data: {"type": "error", "message": "认证令牌无效"}\n\n',
                content_type='text/event-stream',
                status=401
            )
    elif hasattr(request, 'user') and request.user.is_authenticated:
        user = request.user
    else:
        return HttpResponse(
            'data: {"type": "error", "message": "需要登录"}\n\n',
            content_type='text/event-stream',
            status=401
        )

    work_id = request.GET.get('work_id')
    chapter_id = request.GET.get('chapter_id')

    if not all([work_id, chapter_id]):
        return HttpResponse(
            'data: {"type": "error", "message": "缺少必要参数"}\n\n',
            content_type='text/event-stream'
        )

    try:
        work, chapter = await get_work_and_chapter(work_id, chapter_id)
    except Exception:
        return HttpResponse(
            'data: {"type": "error", "message": "作品或章节不存在"}\n\n',
            content_type='text/event-stream',
            status=404
        )

    # Check minimum word count (1000 words)
    MIN_CHAPTER_WORDS = 1000
    chapter_word_count = len(chapter.content or '') if chapter.content else 0
    if chapter_word_count < MIN_CHAPTER_WORDS:
        return HttpResponse(
            f'data: {json.dumps({"type": "error", "message": f"章节字数不足，需要至少{MIN_CHAPTER_WORDS}字才能生成摘要（当前{chapter_word_count}字）"})}\n\n',
            content_type='text/event-stream'
        )

    async def generate_stream():
        """生成SSE数据流 (async generator)"""
        try:
            api_key = await get_deepseek_api_key_async(user)
            ai_service = AIService(
                api_key=api_key,
                provider_name='deepseek',
                default_model='deepseek-v4-pro',
            )

            yield f"data: {json.dumps({'type': 'start', 'message': 'AI摘要生成开始'})}\n\n"

            accumulated_summary = ''
            try:
                async for chunk in ai_service.generate_summary_stream(chapter):
                    accumulated_summary += chunk
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

                yield f"data: {json.dumps({'type': 'end', 'message': 'AI摘要生成完成', 'summary': accumulated_summary})}\n\n"
            except Exception as e:
                logger.error(f"Stream AI summarize error during generation: {str(e)}")
                yield f"data: {json.dumps({'type': 'error', 'message': f'AI摘要生成失败: {str(e)}'})}\n\n"

        except Exception as e:
            logger.error(f"Stream AI summarize error: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'AI摘要生成失败: {str(e)}'})}\n\n"

    response = StreamingHttpResponse(
        generate_stream(),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    response['Access-Control-Allow-Origin'] = '*'
    return response


@csrf_exempt
async def ai_generate_act_synopsis(request):
    """AI生成卷摘要端点 - SSE流式响应（需所有章节已有摘要）"""
    if request.method != 'POST':
        return HttpResponse(
            'data: {"type": "error", "message": "仅支持POST请求"}\n\n',
            content_type='text/event-stream'
        )

    # Parse request body
    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception:
        return HttpResponse(
            'data: {"type": "error", "message": "无效的请求数据"}\n\n',
            content_type='text/event-stream'
        )

    # Authenticate user
    user = None
    token = request.GET.get('token') or body.get('token')
    if token:
        try:
            user = await get_token_user(token)
        except Exception:
            return HttpResponse(
                'data: {"type": "error", "message": "认证令牌无效"}\n\n',
                content_type='text/event-stream',
                status=401
            )
    elif hasattr(request, 'user') and request.user.is_authenticated:
        user = request.user
    else:
        return HttpResponse(
            'data: {"type": "error", "message": "需要登录"}\n\n',
            content_type='text/event-stream',
            status=401
        )

    work_id = body.get('work_id')
    act_id = body.get('act_id')

    if not all([work_id, act_id]):
        return HttpResponse(
            'data: {"type": "error", "message": "缺少必要参数"}\n\n',
            content_type='text/event-stream'
        )

    try:
        act = await get_act_by_id(work_id, act_id, user)
    except Exception:
        return HttpResponse(
            'data: {"type": "error", "message": "卷不存在"}\n\n',
            content_type='text/event-stream',
            status=404
        )

    MIN_CHAPTERS_FOR_ACT_SYNOPSIS = 3

    async def generate_stream():
        """生成SSE数据流"""
        try:
            api_key = await get_deepseek_api_key_async(user)
            ai_service = AIService(
                api_key=api_key,
                provider_name='deepseek',
                default_model='deepseek-v4-pro',
            )

            yield f"data: {json.dumps({'type': 'start', 'message': '开始生成卷摘要'})}\n\n"

            all_chapters = await get_all_chapters_in_act(act)

            if not all_chapters:
                yield f"data: {json.dumps({'type': 'error', 'message': '本卷没有章节'})}\n\n"
                return

            if len(all_chapters) < MIN_CHAPTERS_FOR_ACT_SYNOPSIS:
                yield f"data: {json.dumps({'type': 'error', 'message': f'本卷章节数不足，需要至少{MIN_CHAPTERS_FOR_ACT_SYNOPSIS}个章节才能生成卷摘要（当前{len(all_chapters)}章）'})}\n\n"
                return

            missing_summary_chapters = [
                ch for ch in all_chapters
                if not ch.summary or not ch.summary.strip()
            ]
            if missing_summary_chapters:
                missing_labels = [
                    prompts.format_chapter_label(ch.act.act_type, ch.act.order, ch.chapter_number, ch.title)
                    for ch in missing_summary_chapters
                ]
                yield f"data: {json.dumps({'type': 'error', 'message': '请先生成所有章节的摘要后再生成卷摘要：' + '、'.join(missing_labels)})}\n\n"
                return

            chapter_summaries_parts = [
                f"{prompts.format_chapter_label(chapter.act.act_type, chapter.act.order, chapter.chapter_number, chapter.title)}：\n{chapter.summary}"
                for chapter in all_chapters
            ]
            chapter_summaries_text = "\n\n".join(chapter_summaries_parts)

            lore_entries = await get_lore_entries_for_act(act)
            lore_entries_text = ""
            if lore_entries:
                lore_parts = []
                for entry in lore_entries:
                    lore_parts.append(f"【{entry.name}】\n{entry.description}")
                lore_entries_text = "\n\n".join(lore_parts)

            accumulated_synopsis = ''
            try:
                async for chunk in ai_service.generate_act_synopsis_stream(act, chapter_summaries_text, lore_entries_text):
                    accumulated_synopsis += chunk
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

                yield f"data: {json.dumps({'type': 'end', 'message': '卷摘要生成完成', 'synopsis': accumulated_synopsis})}\n\n"
            except Exception as e:
                logger.error(f"Error generating act synopsis: {str(e)}")
                yield f"data: {json.dumps({'type': 'error', 'message': f'卷摘要生成失败: {str(e)}'})}\n\n"

        except Exception as e:
            logger.error(f"Stream AI act synopsis error: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'卷摘要生成失败: {str(e)}'})}\n\n"

    response = StreamingHttpResponse(
        generate_stream(),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    response['Access-Control-Allow-Origin'] = '*'
    return response


@csrf_exempt
async def ai_auto_edit_stream(request):
    """AI自动编辑端点 - SSE流式响应，支持上下文自定义 (async version for ASGI)"""
    if request.method != 'POST':
        return HttpResponse(
            'data: {"type": "error", "message": "仅支持POST请求"}\n\n',
            content_type='text/event-stream'
        )

    # Parse request body
    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception:
        return HttpResponse(
            'data: {"type": "error", "message": "无效的请求数据"}\n\n',
            content_type='text/event-stream'
        )

    user = None
    # Token can be in query params (for compatibility) or in body
    token = request.GET.get('token') or body.get('token')
    if token:
        try:
            user = await get_token_user(token)
        except Exception:
            return HttpResponse(
                'data: {"type": "error", "message": "认证令牌无效"}\n\n',
                content_type='text/event-stream',
                status=401
            )
    elif hasattr(request, 'user') and request.user.is_authenticated:
        user = request.user
    else:
        return HttpResponse(
            'data: {"type": "error", "message": "需要登录"}\n\n',
            content_type='text/event-stream',
            status=401
        )

    selected_text = body.get('selected_text')
    work_id = body.get('work_id')
    chapter_id = body.get('chapter_id')

    # Context customization parameters
    chapter_selection = body.get('chapter_selection', 'none')
    custom_chapter_count = body.get('custom_chapter_count', '1')
    selected_lore_ids = body.get('selected_lore_ids', '')
    selected_faction_ids = body.get('selected_faction_ids', '')
    model = body.get('model')  # Let provider determine default model
    reasoning_mode = parse_reasoning_mode(body.get('reasoning_mode'))
    edit_requirement = body.get('edit_requirement', '')
    style_id = body.get('style_id', '')
    use_nsfw_style = parse_reasoning_mode(body.get('use_nsfw_style'))

    if not all([work_id, chapter_id]):
        return HttpResponse(
            'data: {"type": "error", "message": "缺少必要参数"}\n\n',
            content_type='text/event-stream'
        )

    try:
        work, chapter = await get_work_and_chapter(work_id, chapter_id)
    except Exception:
        return HttpResponse(
            'data: {"type": "error", "message": "作品或章节不存在"}\n\n',
            content_type='text/event-stream',
            status=404
        )

    async def generate_stream():
        """生成SSE数据流 (async generator)"""
        try:
            # Build context
            formatted_context = await build_auto_edit_context(
                work, chapter, user, style_id, selected_lore_ids, selected_faction_ids,
                chapter_selection, custom_chapter_count, use_nsfw_style
            )

            # Get API key and AI settings
            api_key, provider, default_model = await get_user_api_key_async(user)
            ai_settings = await get_user_ai_settings(user)
            ai_service = AIService(
                api_key=api_key,
                provider_name=provider,
                default_model=default_model,
                reasoning_effort=ai_settings.get('reasoning_effort', 'medium'),
            )

            yield f'data: {json.dumps({"type": "start", "message": "AI自动编辑开始"})}\n\n'

            accumulated_text = ''
            try:
                async for chunk in ai_service.auto_edit_stream(
                    selected_text, formatted_context, model, reasoning_mode, edit_requirement,
                    temperature=ai_settings['temperature'],
                    top_p=ai_settings['top_p'],
                    max_tokens=ai_settings['max_tokens'],
                    frequency_penalty=ai_settings['frequency_penalty'],
                    presence_penalty=ai_settings['presence_penalty']
                ):
                    accumulated_text += chunk
                    yield f'data: {json.dumps({"type": "chunk", "content": chunk})}\n\n'

                yield f'data: {json.dumps({"type": "end", "message": "AI自动编辑完成", "edited_text": accumulated_text})}\n\n'
            except Exception as e:
                logger.error(f"Stream auto-edit error during generation: {str(e)}")
                yield f'data: {json.dumps({"type": "error", "message": f"AI自动编辑失败: {str(e)}"})}\n\n'

        except Exception as e:
            logger.error(f"Stream auto-edit error: {str(e)}")
            yield f'data: {json.dumps({"type": "error", "message": f"AI自动编辑失败: {str(e)}"})}\n\n'

    response = StreamingHttpResponse(
        generate_stream(),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    response['Access-Control-Allow-Origin'] = '*'
    return response


@sync_to_async
def get_work_for_user(work_id, user):
    """Get work for user (async version)"""
    return Work.objects.get(id=work_id, author=user)


@sync_to_async
def get_work_lore_template(work):
    """Get the custom lore entry template for a work (async version)"""
    # Refresh from db to ensure we have the latest value
    work.refresh_from_db()
    return work.lore_entry_template or ''


ENTRY_FULL_TEXT_MENTION_THRESHOLD = 5


def _count_name_mentions(text: str, name: str) -> int:
    """Case-insensitive substring count of a character/entry name."""
    if not text or not name:
        return 0
    return text.lower().count(name.lower())


@sync_to_async
def search_chapters_with_entry(work, entry_name, chapter_ids=None):
    """Search chapters containing entry name (async version)
    
    Args:
        work: The work object
        entry_name: The name to search for
        chapter_ids: Optional list of specific chapter IDs to use. If None, searches all chapters.

    Full chapter text is used only when the name appears at least
    ENTRY_FULL_TEXT_MENTION_THRESHOLD times; otherwise the chapter synopsis
    is used, or the chapter is skipped if it has no synopsis.
    """
    from django.db.models import Q
    
    if chapter_ids is not None:
        # Use the caller's selection (empty list = no chapter text, extra desc only)
        chapters = list(work.chapters.filter(id__in=chapter_ids).select_related('act'))
        chapters = sorted(chapters, key=lambda c: prompts.chapter_sort_key(c.act.act_type, c.act.order, c.chapter_number))
    else:
        # Search all chapters containing entry name; 外传 sink to the bottom before the 5-cap
        chapters = list(work.chapters.filter(
            Q(content__icontains=entry_name) | Q(title__icontains=entry_name)
        ).select_related('act'))
        chapters = sorted(chapters, key=lambda c: prompts.chapter_sort_key(c.act.act_type, c.act.order, c.chapter_number))[:5]
    
    # Build context and used chapters info
    context_parts = []
    used_chapters_info = []
    for chapter in chapters:
        label = prompts.format_chapter_label(
            chapter.act.act_type, chapter.act.order, chapter.chapter_number, chapter.title
        )
        use_full_text = _count_name_mentions(
            chapter.content or '', entry_name
        ) >= ENTRY_FULL_TEXT_MENTION_THRESHOLD

        if use_full_text:
            body = chapter.content or ''
        else:
            summary = (chapter.summary or '').strip()
            if not summary:
                continue
            body = f"摘要：\n{summary}"

        context_parts.append(f"### {label}\n\n{body}")
        used_chapters_info.append({
            'chapter_number': chapter.chapter_number,
            'title': chapter.title,
            'id': chapter.id,
            'act_order': chapter.act.order,
            'act_type': chapter.act.act_type,
        })
    
    context_text = "\n\n---\n\n".join(context_parts)
    return context_text, used_chapters_info


@sync_to_async
def get_chapters_with_entry_name(work, entry_name):
    """Get all chapters containing entry name (for chapter selection UI)"""
    from django.db.models import Q
    chapters = list(work.chapters.filter(
        Q(content__icontains=entry_name) | Q(title__icontains=entry_name)
    ).select_related('act'))
    chapters = sorted(chapters, key=lambda c: prompts.chapter_sort_key(c.act.act_type, c.act.order, c.chapter_number))
    
    return [{
        'id': chapter.id,
        'chapter_number': chapter.chapter_number,
        'title': chapter.title,
        'summary': chapter.summary or '',
        'act_order': chapter.act.order,
        'act_type': chapter.act.act_type,
    } for chapter in chapters]


@sync_to_async
def get_all_chapters_with_summary(work):
    """Get all chapters of a work with their summaries (for chapter selection dropdown)"""
    chapters = list(work.chapters.all().select_related('act'))
    chapters = sorted(chapters, key=lambda c: prompts.chapter_sort_key(c.act.act_type, c.act.order, c.chapter_number))
    return [{
        'id': chapter.id,
        'chapter_number': chapter.chapter_number,
        'title': chapter.title,
        'summary': chapter.summary or '',
        'act_order': chapter.act.order,
        'act_type': chapter.act.act_type,
    } for chapter in chapters]


@csrf_exempt
async def ai_auto_describe_entry_all_chapters(request):
    """获取作品所有章节（含摘要），用于章节选择下拉菜单"""
    if request.method != 'POST':
        return JsonResponse({'error': '仅支持POST请求'}, status=405)

    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception:
        return JsonResponse({'error': '无效的请求数据'}, status=400)

    user = None
    token = request.GET.get('token') or body.get('token')
    if token:
        try:
            user = await get_token_user(token)
        except Exception:
            return JsonResponse({'error': '认证令牌无效'}, status=401)
    elif hasattr(request, 'user') and request.user.is_authenticated:
        user = request.user
    else:
        return JsonResponse({'error': '需要登录'}, status=401)

    work_id = body.get('work_id')

    if not work_id:
        return JsonResponse({'error': '缺少必要参数'}, status=400)

    try:
        work = await get_work_for_user(work_id, user)
    except Exception:
        return JsonResponse({'error': '作品不存在'}, status=404)

    chapters = await get_all_chapters_with_summary(work)
    return JsonResponse({'chapters': chapters})


@csrf_exempt
async def ai_auto_describe_entry_chapters(request):
    """获取包含条目名称的章节列表（用于UI选择）"""
    if request.method != 'POST':
        return JsonResponse({'error': '仅支持POST请求'}, status=405)

    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception:
        return JsonResponse({'error': '无效的请求数据'}, status=400)

    user = None
    token = request.GET.get('token') or body.get('token')
    if token:
        try:
            user = await get_token_user(token)
        except Exception:
            return JsonResponse({'error': '认证令牌无效'}, status=401)
    elif hasattr(request, 'user') and request.user.is_authenticated:
        user = request.user
    else:
        return JsonResponse({'error': '需要登录'}, status=401)

    entry_name = body.get('entry_name')
    work_id = body.get('work_id')

    if not all([entry_name, work_id]):
        return JsonResponse({'error': '缺少必要参数'}, status=400)

    try:
        work = await get_work_for_user(work_id, user)
    except Exception:
        return JsonResponse({'error': '作品不存在'}, status=404)

    chapters = await get_chapters_with_entry_name(work, entry_name)
    return JsonResponse({'chapters': chapters})


@csrf_exempt
async def ai_auto_describe_entry(request):
    """AI自动生成条目描述 - SSE流式响应 (async version for ASGI)"""
    if request.method != 'POST':
        return HttpResponse(
            'data: {"type": "error", "message": "仅支持POST请求"}\n\n',
            content_type='text/event-stream'
        )

    # Parse request body
    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception:
        return HttpResponse(
            'data: {"type": "error", "message": "无效的请求数据"}\n\n',
            content_type='text/event-stream'
        )

    user = None
    # Token can be in query params (for compatibility) or in body
    token = request.GET.get('token') or body.get('token')
    if token:
        try:
            user = await get_token_user(token)
        except Exception:
            return HttpResponse(
                'data: {"type": "error", "message": "认证令牌无效"}\n\n',
                content_type='text/event-stream',
                status=401
            )
    elif hasattr(request, 'user') and request.user.is_authenticated:
        user = request.user
    else:
        return HttpResponse(
            'data: {"type": "error", "message": "需要登录"}\n\n',
            content_type='text/event-stream',
            status=401
        )

    entry_name = body.get('entry_name')
    work_id = body.get('work_id')
    # New optional parameters
    chapter_ids = body.get('chapter_ids')  # List of specific chapter IDs to use
    additional_context = body.get('additional_context', '')  # Additional user context
    is_update = body.get('is_update', False)  # Whether updating existing description
    original_description = body.get('original_description', '')  # Original description for update mode
    is_worldbuilding = body.get('is_worldbuilding', False)  # Whether this is a worldbuilding entry

    if not all([entry_name, work_id]):
        return HttpResponse(
            'data: {"type": "error", "message": "缺少必要参数"}\n\n',
            content_type='text/event-stream'
        )

    # Get work
    try:
        work = await get_work_for_user(work_id, user)
    except Exception:
        return HttpResponse(
            'data: {"type": "error", "message": "作品不存在"}\n\n',
            content_type='text/event-stream',
            status=404
        )

    # Get custom template for this work (if set) — only for character entries, not worldbuilding
    if is_worldbuilding:
        custom_template = ''
    else:
        custom_template = await get_work_lore_template(work)

    async def generate_stream():
        """生成SSE数据流 (async generator)"""
        try:
            # Search chapters with entry name (optionally filtered by chapter_ids)
            context_text, used_chapters_info = await search_chapters_with_entry(
                work, entry_name, chapter_ids
            )

            api_key, provider, default_model, reasoning_effort = await get_auto_describe_provider_async(user)
            ai_service = AIService(
                api_key=api_key,
                provider_name=provider,
                default_model=default_model,
                reasoning_effort=reasoning_effort,
            )

            yield f'data: {json.dumps({"type": "start", "message": "AI描述生成开始", "used_chapters": used_chapters_info})}\n\n'

            accumulated_description = ''
            try:
                async for chunk in ai_service.auto_describe_entry_stream(
                    entry_name, 
                    context_text,
                    additional_context=additional_context,
                    is_update=is_update,
                    original_description=original_description,
                    custom_template=custom_template,
                    is_worldbuilding=is_worldbuilding
                ):
                    accumulated_description += chunk
                    yield f'data: {json.dumps({"type": "chunk", "content": chunk})}\n\n'

                yield f'data: {json.dumps({"type": "end", "message": "AI描述生成完成", "description": accumulated_description, "used_chapters": used_chapters_info})}\n\n'
            except Exception as e:
                logger.error(f"Stream auto-describe error during generation: {str(e)}")
                yield f'data: {json.dumps({"type": "error", "message": f"AI描述生成失败: {str(e)}"})}\n\n'

        except Exception as e:
            logger.error(f"Stream auto-describe error: {str(e)}")
            yield f'data: {json.dumps({"type": "error", "message": f"AI描述生成失败: {str(e)}"})}\n\n'

    response = StreamingHttpResponse(
        generate_stream(),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    response['Access-Control-Allow-Origin'] = '*'
    return response


def _split_outline_update_output(text: str, current_content: str):
    """Parse the one-shot update JSON. Manual update always writes the outline."""
    raw = (text or '').strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Outline update returned non-JSON content: %s", raw[:2000])
        return None, current_content
    if not isinstance(data, dict) or not isinstance(data.get('reply'), str):
        logger.warning("Outline update JSON missing reply: %s", raw[:2000])
        return None, current_content
    document = data.get('document') if isinstance(data.get('document'), dict) else {}
    content = document.get('content', current_content)
    if not isinstance(content, str):
        content = current_content
    return data['reply'], content


@sync_to_async
def get_outline_planner_bundle(work_id, act_id, user, current_message=''):
    """Load planner context and the open round's messages."""
    from apps.chat.models import OutlineChatSession
    from apps.chat.outline_rounds import ensure_open_round
    work = get_object_or_404(Work, id=work_id, author=user)
    act = get_object_or_404(Act, id=act_id, work=work)

    if act.act_type == 'side_chapters':
        previous_acts = Act.objects.filter(
            work=work, act_type='normal'
        ).exclude(synopsis='').order_by('order')
    else:
        previous_acts = Act.objects.filter(
            work=work, act_type='normal', order__lt=act.order
        ).exclude(synopsis='').order_by('order')

    synopsis_lines = [
        f"【{prev.name}】\n{prev.synopsis}" for prev in previous_acts if (prev.synopsis or '').strip()
    ]
    lore_lines = [
        f"- {entry.name}: {entry.description}"
        for entry in LoreEntry.objects.filter(work=work).order_by('name')
    ]

    history = []
    session = OutlineChatSession.objects.filter(work=work, act=act, user=user).first()
    if session:
        chat_round = ensure_open_round(session)
        ordered = list(chat_round.messages.order_by('created_at'))
        if (
            current_message
            and ordered
            and ordered[-1].role == 'user'
            and ordered[-1].content == current_message
        ):
            ordered = ordered[:-1]
        history = [
            {
                'role': msg.role,
                'content': strip_chat_reasoning(msg.content) if msg.role == 'assistant' else msg.content,
            }
            for msg in ordered
        ]

    work_brief = "\n\n".join(part for part in [
        f"作品标题：{work.title}",
        f"作品大纲：\n{work.synopsis}" if (work.synopsis or '').strip() else '',
    ] if part)
    reference = "\n\n".join(part for part in [
        f"当前卷：{act.name}",
        "前卷摘要：\n\n" + "\n\n".join(synopsis_lines) if synopsis_lines else '',
        "世界观与人物：\n" + "\n".join(lore_lines) if lore_lines else '',
    ] if part)

    return work, act, work_brief, reference, history


async def _outline_planner_auth(request, body):
    user = None
    token = request.GET.get('token') or body.get('token')
    if token:
        try:
            user = await get_token_user(token)
        except Exception:
            return None
    elif hasattr(request, 'user') and request.user.is_authenticated:
        user = request.user
    return user


@csrf_exempt
async def ai_outline_planner_chat(request):
    """卷大纲策划对话：流式返回纯文本回复，不改大纲。"""
    if request.method != 'POST':
        return HttpResponse(
            'data: {"type": "error", "message": "仅支持POST请求"}\n\n',
            content_type='text/event-stream'
        )

    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception:
        return HttpResponse(
            'data: {"type": "error", "message": "无效的请求数据"}\n\n',
            content_type='text/event-stream'
        )

    user = await _outline_planner_auth(request, body)
    if not user:
        return HttpResponse(
            'data: {"type": "error", "message": "需要登录"}\n\n',
            content_type='text/event-stream',
            status=401
        )

    work_id = body.get('work_id')
    act_id = body.get('act_id')
    message = (body.get('message') or '').strip()
    prior_assistant = (body.get('prior_assistant') or '').strip()
    document = body.get('document') or {}
    current_content = document.get('content') if isinstance(document, dict) else ''
    if current_content is None:
        current_content = ''

    if not all([work_id, act_id, message]):
        return HttpResponse(
            'data: {"type": "error", "message": "缺少必要参数"}\n\n',
            content_type='text/event-stream'
        )

    async def generate_stream():
        try:
            work, act, work_brief, reference, history = await get_outline_planner_bundle(
                work_id, act_id, user, message
            )
            if history and history[-1].get('role') == 'user' and history[-1].get('content') == message:
                history = history[:-1]
            prior_assistant = strip_chat_reasoning(prior_assistant)
            if prior_assistant and not any(
                item.get('role') == 'assistant' and item.get('content') == prior_assistant
                for item in history
            ):
                history.append({'role': 'assistant', 'content': prior_assistant})

            is_first_user = not any(item.get('role') == 'user' for item in history)
            user_parts = []
            if is_first_user:
                user_parts.extend([work_brief, reference, f"当前大纲：\n{current_content}"])
            user_parts.append(f"作者消息：\n{message}")
            user_turn = "\n\n".join(part for part in user_parts if part)

            api_key, provider, default_model = await get_user_api_key_async(user)
            ai_settings = await get_user_ai_settings(user)
            ai_service = AIService(
                api_key=api_key,
                provider_name=provider,
                default_model=default_model,
                reasoning_effort=ai_settings.get('reasoning_effort', 'medium'),
            )

            messages = [
                {
                    'role': 'system',
                    'content': f"{prompts.FICTION_PREAMBLE}\n\n{prompts.OUTLINE_PLANNER_SYSTEM_PROMPT}",
                },
                *history,
                {'role': 'user', 'content': user_turn},
            ]

            yield f'data: {json.dumps({"type": "start", "message": "大纲策划开始"})}\n\n'

            accumulated = ''
            async for chunk in ai_service.provider.chat_completion_stream(
                messages,
                temperature=ai_settings.get('temperature'),
                top_p=ai_settings.get('top_p'),
                max_tokens=ai_settings.get('max_tokens'),
                frequency_penalty=ai_settings.get('frequency_penalty'),
                presence_penalty=ai_settings.get('presence_penalty'),
                include_reasoning=False,
            ):
                accumulated += chunk
                yield f'data: {json.dumps({"type": "chunk", "content": chunk})}\n\n'

            yield f'data: {json.dumps({"type": "end", "reply": accumulated}, ensure_ascii=False)}\n\n'
        except Exception as e:
            logger.error(f"Outline planner chat error: {str(e)}")
            yield f'data: {json.dumps({"type": "error", "message": f"大纲策划失败: {str(e)}"}, ensure_ascii=False)}\n\n'

    response = StreamingHttpResponse(generate_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    response['Access-Control-Allow-Origin'] = '*'
    return response


@csrf_exempt
async def ai_outline_planner_update(request):
    """卷大纲策划更新：一次性返回 JSON，写入大纲并归档当前轮。"""
    if request.method != 'POST':
        return HttpResponse(
            'data: {"type": "error", "message": "仅支持POST请求"}\n\n',
            content_type='text/event-stream'
        )

    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception:
        return HttpResponse(
            'data: {"type": "error", "message": "无效的请求数据"}\n\n',
            content_type='text/event-stream'
        )

    user = await _outline_planner_auth(request, body)
    if not user:
        return HttpResponse(
            'data: {"type": "error", "message": "需要登录"}\n\n',
            content_type='text/event-stream',
            status=401
        )

    work_id = body.get('work_id')
    act_id = body.get('act_id')
    document = body.get('document') or {}
    current_content = document.get('content') if isinstance(document, dict) else ''
    if current_content is None:
        current_content = ''

    if not all([work_id, act_id]):
        return HttpResponse(
            'data: {"type": "error", "message": "缺少必要参数"}\n\n',
            content_type='text/event-stream'
        )

    async def generate_stream():
        try:
            work, act, work_brief, reference, history = await get_outline_planner_bundle(
                work_id, act_id, user
            )

            user_turn = "\n\n".join(part for part in [
                work_brief,
                reference,
                f"当前大纲：\n{current_content}",
                prompts.OUTLINE_PLANNER_UPDATE_PROMPT,
            ] if part)

            api_key, provider, default_model = await get_user_api_key_async(user)
            ai_settings = await get_user_ai_settings(user)
            ai_service = AIService(
                api_key=api_key,
                provider_name=provider,
                default_model=default_model,
                reasoning_effort=ai_settings.get('reasoning_effort', 'medium'),
            )

            messages = [
                {
                    'role': 'system',
                    'content': f"{prompts.FICTION_PREAMBLE}\n\n{prompts.OUTLINE_PLANNER_UPDATE_SYSTEM}",
                },
                *history,
                {'role': 'user', 'content': user_turn},
            ]

            yield f'data: {json.dumps({"type": "start", "message": "正在更新大纲"})}\n\n'

            raw = await ai_service.provider.chat_completion(
                messages,
                temperature=ai_settings.get('temperature'),
                top_p=ai_settings.get('top_p'),
                max_tokens=ai_settings.get('max_tokens'),
                frequency_penalty=ai_settings.get('frequency_penalty'),
                presence_penalty=ai_settings.get('presence_penalty'),
                include_reasoning=False,
                response_format={'type': 'json_object'},
            )

            reply, content = _split_outline_update_output(raw, current_content)
            if reply is None:
                yield f'data: {json.dumps({"type": "error", "message": "大纲更新失败：模型未返回有效 JSON"}, ensure_ascii=False)}\n\n'
                return

            from apps.chat.models import OutlineChatSession
            from apps.chat.outline_rounds import commit_outline_update
            session, _ = await sync_to_async(OutlineChatSession.objects.get_or_create)(
                work=work,
                act=act,
                user=user,
                defaults={'session_id': str(uuid.uuid4())}
            )
            new_messages, closed_payload = await sync_to_async(commit_outline_update)(
                session, act, content, reply
            )

            payload = {
                'type': 'end',
                'reply': reply,
                'document': {'content': content},
                'closed_round': closed_payload,
                'messages': new_messages,
            }
            yield f'data: {json.dumps(payload, ensure_ascii=False)}\n\n'
        except Exception as e:
            logger.error(f"Outline planner update error: {str(e)}")
            yield f'data: {json.dumps({"type": "error", "message": f"大纲更新失败: {str(e)}"}, ensure_ascii=False)}\n\n'

    response = StreamingHttpResponse(generate_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    response['Access-Control-Allow-Origin'] = '*'
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_default_lore_template(request):
    """获取默认的条目生成模板"""
    default_template = prompts.get_default_lore_entry_template()
    return Response({'template': default_template})
