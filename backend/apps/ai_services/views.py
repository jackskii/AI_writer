from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.http import StreamingHttpResponse, JsonResponse, HttpResponse
from django.db import models
from django.db.utils import ProgrammingError, OperationalError
from asgiref.sync import sync_to_async
from apps.works.models import Work, Act, Chapter, LoreEntry, Faction
from .services import AIService, run_async_ai_task
from .models import Suggestion
from . import prompts
import logging
import json
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
def get_user_ai_settings(user):
    """获取用户的AI设置 (async version)"""
    from apps.user_auth.models import UserSettings
    try:
        settings = UserSettings.objects.get(user=user)
        return {
            'temperature': settings.temperature,
            'top_p': settings.top_p,
            'max_tokens': settings.max_tokens,
            'frequency_penalty': settings.frequency_penalty,
            'presence_penalty': settings.presence_penalty,
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
        return [{'role': msg.role, 'content': msg.content} for msg in reversed(list(recent_messages))]
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
    return [{'role': msg.role, 'content': msg.content} for msg in reversed(list(recent_messages))]


@sync_to_async
def save_chapter_summary(chapter, summary):
    """Save chapter summary (async version)"""
    chapter.summary = summary
    chapter.save(update_fields=['summary'])


@sync_to_async
def get_act_by_id(work_id, act_id, user):
    """Get act by id (async version)"""
    work = get_object_or_404(Work, id=work_id, author=user)
    act = get_object_or_404(Act, id=act_id, work=work)
    return act


@sync_to_async
def save_act_synopsis(act, synopsis):
    """Save act synopsis (async version)"""
    act.synopsis = synopsis
    act.save(update_fields=['synopsis'])


@sync_to_async
def get_chapters_without_summary(act):
    """Get chapters in act that don't have summaries"""
    chapters = act.chapters.filter(
        models.Q(summary__isnull=True) | models.Q(summary='')
    ).order_by('order')
    return list(chapters)


@sync_to_async
def get_all_chapters_in_act(act):
    """Get all chapters in an act"""
    return list(act.chapters.order_by('order'))


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
def build_auto_edit_context(work, chapter, user, style_id, selected_lore_ids, selected_faction_ids, chapter_selection, custom_chapter_count):
    """Build context for auto-edit (async version)
    
    New logic:
    - ALWAYS includes: all previous act synopses + all previous chapter synopses in current act
    - If chapter_selection is not 'none', replaces the last x chapter synopses with full text
    
    For side chapters: only includes work synopsis, normal act synopses, and selected lore entries.
    """
    formatted_context = ""

    # Check if this is a side chapter
    current_act = chapter.act
    is_side_chapter = current_act and current_act.act_type == 'side_chapters'

    # Add writing style if selected
    if style_id:
        try:
            from apps.works.models import WritingStyle
            style = WritingStyle.objects.get(id=int(style_id), user=user)
            formatted_context += f"写作风格参考：\n\n{style.style_data}\n\n---\n\n"
        except (WritingStyle.DoesNotExist, ValueError):
            pass

    # Add synopsis
    if work.synopsis:
        formatted_context += f"作品大纲：{work.synopsis}\n\n"

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
        
        # Get all previous chapters in current act (in order)
        all_previous_chapters = list(current_act.chapters.filter(
            order__lt=chapter.order
        ).order_by('order')) if current_act else []
        
        # Determine which chapters to replace with full text
        chapters_to_replace_with_full_text = []
        if chapter_selection == 'none':
            # No replacement, use all summaries
            chapters_to_replace_with_full_text = []
        elif chapter_selection == 'all':
            # Replace all chapter synopses with full text
            chapters_to_replace_with_full_text = all_previous_chapters
        elif chapter_selection == 'custom':
            # Replace last x chapters with full text
            try:
                count = int(custom_chapter_count)
                available_previous_count = len(all_previous_chapters)
                count = min(max(0, count), available_previous_count)
                if count > 0:
                    # Get last x chapters (most recent)
                    chapters_to_replace_with_full_text = all_previous_chapters[-count:]
            except:
                chapters_to_replace_with_full_text = []
        
        # Build list of chapter IDs to replace
        replace_ids = {ch.id for ch in chapters_to_replace_with_full_text}
        
        # Add chapter summaries (or full text for replaced chapters)
        if all_previous_chapters:
            formatted_context += "本卷前文章节：\n\n"
            
            for ch in all_previous_chapters:
                if ch.id in replace_ids:
                    # Use full text for replaced chapters
                    formatted_context += f"第{ch.chapter_number}章《{ch.title}》\n\n{ch.content or '(空章节)'}\n\n---\n\n"
                elif ch.summary:
                    # Use summary for non-replaced chapters (if summary exists)
                    formatted_context += f"第{ch.chapter_number}章《{ch.title}》摘要：{ch.summary}\n\n"
                # If no summary and not replaced, skip (don't include)
            
            formatted_context += "---\n\n"

    # Add current chapter content at the end
    if chapter.content:
        formatted_context += f"当前章节《{chapter.title}》全文：\n\n{chapter.content}\n\n---\n\n"

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


@api_view(['GET'])
@permission_classes([AllowAny])
def ai_prefills(request):
    """Get auto-edit prefill options."""
    from apps.user_auth.models import UserEditPrefill
    from apps.user_auth.views import create_default_edit_prefills_for_user

    scope = 'auto_edit'

    # Get user's custom prefills, or fall back to defaults if none exist
    if request.user.is_authenticated:
        try:
            user_prefills = UserEditPrefill.objects.filter(user=request.user, scope=scope)

            # Lazy initialization: if user has no prefills for this scope, create defaults
            if not user_prefills.exists():
                create_default_edit_prefills_for_user(request.user, scope=scope)
                user_prefills = UserEditPrefill.objects.filter(user=request.user, scope=scope)

            if user_prefills.exists():
                # Convert to dict format for backward compatibility
                prefills_dict = {prefill.name: prefill.prompt_text for prefill in user_prefills}
                return Response({
                    'prefills': prefills_dict
                })
        except (ProgrammingError, OperationalError):
            # Migration not applied yet; fall back to static defaults
            return Response({
                'prefills': prompts.AUTO_EDIT_PREFILLS
            })

    # Fall back to default prefills for unauthenticated users or users without custom prefills
    return Response({
        'prefills': prompts.AUTO_EDIT_PREFILLS
    })


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
            ai_service = AIService(api_key=api_key, provider_name=provider, default_model=default_model)

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
            ai_service = AIService(api_key=api_key, provider_name=provider, default_model=default_model)

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
            api_key, provider, default_model = await get_user_api_key_async(user)
            ai_service = AIService(api_key=api_key, provider_name=provider, default_model=default_model)

            yield f"data: {json.dumps({'type': 'start', 'message': 'AI摘要生成开始'})}\n\n"

            accumulated_summary = ''
            try:
                async for chunk in ai_service.generate_summary_stream(chapter):
                    accumulated_summary += chunk
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

                # Save summary to chapter
                await save_chapter_summary(chapter, accumulated_summary)
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
    """AI生成卷摘要端点 - SSE流式响应
    
    This endpoint will:
    1. Check which chapters in the act lack summaries
    2. Generate summaries for those chapters first (streaming progress)
    3. Then generate the act synopsis using all chapter summaries + lore entries
    """
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

    # Constants for validation
    MIN_CHAPTERS_FOR_ACT_SYNOPSIS = 3
    MIN_CHAPTER_WORDS = 1000

    async def generate_stream():
        """生成SSE数据流"""
        try:
            api_key, provider, default_model = await get_user_api_key_async(user)
            ai_service = AIService(api_key=api_key, provider_name=provider, default_model=default_model)

            yield f"data: {json.dumps({'type': 'start', 'message': '开始生成卷摘要'})}\n\n"

            # Step 1: Get all chapters and validate minimum count
            all_chapters = await get_all_chapters_in_act(act)

            if not all_chapters:
                yield f"data: {json.dumps({'type': 'error', 'message': '本卷没有章节'})}\n\n"
                return

            if len(all_chapters) < MIN_CHAPTERS_FOR_ACT_SYNOPSIS:
                yield f"data: {json.dumps({'type': 'error', 'message': f'本卷章节数不足，需要至少{MIN_CHAPTERS_FOR_ACT_SYNOPSIS}个章节才能生成卷摘要（当前{len(all_chapters)}章）'})}\n\n"
                return

            # Step 2: Get chapters without summaries (only those with sufficient word count)
            chapters_without_summary = await get_chapters_without_summary(act)
            
            # Step 3: Generate summaries for chapters that don't have them
            if chapters_without_summary:
                # Filter to only chapters with sufficient word count
                eligible_chapters = [ch for ch in chapters_without_summary if len(ch.content or '') >= MIN_CHAPTER_WORDS]
                skipped_chapters = [ch for ch in chapters_without_summary if len(ch.content or '') < MIN_CHAPTER_WORDS]
                
                if eligible_chapters:
                    yield f"data: {json.dumps({'type': 'chapter_progress', 'message': f'需要先为 {len(eligible_chapters)} 个章节生成摘要', 'total': len(eligible_chapters), 'current': 0})}\n\n"
                
                # Report skipped chapters due to insufficient word count
                for chapter in skipped_chapters:
                    word_count = len(chapter.content or '')
                    yield f"data: {json.dumps({'type': 'chapter_skip', 'chapter': f'第{chapter.chapter_number}章《{chapter.title}》', 'message': f'字数不足（{word_count}字，需{MIN_CHAPTER_WORDS}字）'})}\n\n"
                
                for idx, chapter in enumerate(eligible_chapters):
                    if not chapter.content or not chapter.content.strip():
                        yield f"data: {json.dumps({'type': 'chapter_skip', 'chapter': f'第{chapter.chapter_number}章《{chapter.title}》', 'message': '章节内容为空，跳过'})}\n\n"
                        continue

                    yield f"data: {json.dumps({'type': 'chapter_progress', 'chapter': f'第{chapter.chapter_number}章《{chapter.title}》', 'status': 'generating', 'current': idx + 1, 'total': len(eligible_chapters)})}\n\n"
                    
                    try:
                        accumulated_summary = ''
                        async for chunk in ai_service.generate_summary_stream(chapter):
                            accumulated_summary += chunk
                        
                        # Save summary to the chapter (auto-save)
                        await save_chapter_summary(chapter, accumulated_summary)
                        yield f"data: {json.dumps({'type': 'chapter_done', 'chapter': f'第{chapter.chapter_number}章《{chapter.title}》', 'status': 'done'})}\n\n"
                    except Exception as e:
                        logger.error(f"Error generating chapter summary: {str(e)}")
                        yield f"data: {json.dumps({'type': 'chapter_error', 'chapter': f'第{chapter.chapter_number}章《{chapter.title}》', 'message': str(e)})}\n\n"

            # Step 3: Refresh chapters to get updated summaries
            all_chapters = await get_all_chapters_in_act(act)
            
            # Build chapter summaries text
            chapter_summaries_parts = []
            for chapter in all_chapters:
                if chapter.summary:
                    chapter_summaries_parts.append(f"第{chapter.chapter_number}章《{chapter.title}》：\n{chapter.summary}")
            
            if not chapter_summaries_parts:
                yield f"data: {json.dumps({'type': 'error', 'message': '没有章节摘要可用于生成卷摘要'})}\n\n"
                return

            chapter_summaries_text = "\n\n".join(chapter_summaries_parts)

            # Step 4: Get lore entries for this act
            lore_entries = await get_lore_entries_for_act(act)
            lore_entries_text = ""
            if lore_entries:
                lore_parts = []
                for entry in lore_entries:
                    lore_parts.append(f"【{entry.name}】\n{entry.description}")
                lore_entries_text = "\n\n".join(lore_parts)

            # Step 5: Generate act synopsis
            yield f"data: {json.dumps({'type': 'synopsis_progress', 'message': '正在生成卷摘要...'})}\n\n"
            
            accumulated_synopsis = ''
            try:
                async for chunk in ai_service.generate_act_synopsis_stream(act, chapter_summaries_text, lore_entries_text):
                    accumulated_synopsis += chunk
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

                # Save synopsis to act
                await save_act_synopsis(act, accumulated_synopsis)
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
                chapter_selection, custom_chapter_count
            )

            # Get API key and AI settings
            api_key, provider, default_model = await get_user_api_key_async(user)
            ai_settings = await get_user_ai_settings(user)
            ai_service = AIService(api_key=api_key, provider_name=provider, default_model=default_model)

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


@sync_to_async
def search_chapters_with_entry(work, entry_name, chapter_ids=None):
    """Search chapters containing entry name (async version)
    
    Args:
        work: The work object
        entry_name: The name to search for
        chapter_ids: Optional list of specific chapter IDs to use. If None, searches all chapters.
    """
    from django.db.models import Q
    
    if chapter_ids:
        # Use specific chapters selected by user
        chapters = work.chapters.filter(id__in=chapter_ids).order_by('order')
    else:
        # Search all chapters containing entry name
        chapters = work.chapters.filter(
            Q(content__icontains=entry_name) | Q(title__icontains=entry_name)
        ).order_by('order')[:5]
    
    # Build context and used chapters info
    context_parts = []
    used_chapters_info = []
    for chapter in chapters:
        context_parts.append(f"### 第{chapter.chapter_number}章《{chapter.title}》\n\n{chapter.content}")
        used_chapters_info.append({
            'chapter_number': chapter.chapter_number,
            'title': chapter.title,
            'id': chapter.id
        })
    
    context_text = "\n\n---\n\n".join(context_parts)
    return context_text, used_chapters_info


@sync_to_async
def get_chapters_with_entry_name(work, entry_name):
    """Get all chapters containing entry name (for chapter selection UI)"""
    from django.db.models import Q
    chapters = work.chapters.filter(
        Q(content__icontains=entry_name) | Q(title__icontains=entry_name)
    ).order_by('order')
    
    return [{
        'id': chapter.id,
        'chapter_number': chapter.chapter_number,
        'title': chapter.title
    } for chapter in chapters]


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

    # Get custom template for this work (if set)
    custom_template = await get_work_lore_template(work)

    async def generate_stream():
        """生成SSE数据流 (async generator)"""
        try:
            # Search chapters with entry name (optionally filtered by chapter_ids)
            context_text, used_chapters_info = await search_chapters_with_entry(
                work, entry_name, chapter_ids
            )

            if not context_text:
                not_found_msg = f'"{entry_name}" 尚未在故事中出现。'
                yield f'data: {json.dumps({"type": "end", "message": "生成完成", "description": not_found_msg, "used_chapters": []})}\n\n'
                return

            # Get API key
            api_key, provider, default_model = await get_user_api_key_async(user)
            ai_service = AIService(api_key=api_key, provider_name=provider, default_model=default_model)

            yield f'data: {json.dumps({"type": "start", "message": "AI描述生成开始", "used_chapters": used_chapters_info})}\n\n'

            accumulated_description = ''
            try:
                async for chunk in ai_service.auto_describe_entry_stream(
                    entry_name, 
                    context_text,
                    additional_context=additional_context,
                    is_update=is_update,
                    original_description=original_description,
                    custom_template=custom_template
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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_default_lore_template(request):
    """获取默认的条目生成模板"""
    default_template = prompts.get_default_lore_entry_template()
    return Response({'template': default_template})
