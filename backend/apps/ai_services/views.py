from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.http import StreamingHttpResponse
from asgiref.sync import sync_to_async
from apps.works.models import Work, Chapter, LoreEntry
from .services import AIService, run_async_ai_task
from .models import Suggestion
from . import prompts
import logging
import json
import asyncio
import uuid

logger = logging.getLogger(__name__)


# Async helper functions for database operations
@sync_to_async
def get_user_api_key_async(user):
    """获取用户的API密钥 (async version)"""
    from apps.user_auth.models import UserSettings
    settings = UserSettings.objects.get(user=user)
    api_key = settings.get_api_key_for_provider()
    provider = settings.api_provider
    if not api_key:
        raise ValueError("API密钥未配置")
    return api_key, provider


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
def build_auto_edit_context(work, chapter, user, style_id, selected_lore_ids, chapter_selection, custom_chapter_count, use_summaries=False):
    """Build context for auto-edit (async version)"""
    formatted_context = ""

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

    # Add chapters based on selection
    available_previous_count = work.chapters.filter(order__lt=chapter.order).count()

    previous_chapters = []
    if chapter_selection == 'none':
        previous_chapters = []
    elif chapter_selection == 'all':
        previous_chapters = list(work.chapters.filter(order__lt=chapter.order).order_by('order'))
    elif chapter_selection == 'custom':
        try:
            count = int(custom_chapter_count)
            count = min(max(0, count), available_previous_count)
            if count > 0:
                previous_chapters = list(work.chapters.filter(order__lt=chapter.order).order_by('-order')[:count])
                previous_chapters = list(reversed(previous_chapters))
        except:
            count = 3
            previous_chapters = list(work.chapters.filter(order__lt=chapter.order).order_by('-order')[:count])
            previous_chapters = list(reversed(previous_chapters))
    else:  # 'past_3' (default)
        count = min(3, available_previous_count)
        previous_chapters = list(work.chapters.filter(order__lt=chapter.order).order_by('-order')[:count])
        previous_chapters = list(reversed(previous_chapters))

    if previous_chapters:
        if use_summaries:
            formatted_context += "前文章节摘要：\n\n"
            for ch in previous_chapters:
                summary_text = ch.summary or '(无摘要)'
                formatted_context += f"第{ch.chapter_number}章《{ch.title}》摘要：{summary_text}\n\n"
            formatted_context += "---\n\n"
        else:
            formatted_context += "前文章节：\n\n"
            for ch in previous_chapters:
                formatted_context += f"第{ch.chapter_number}章《{ch.title}》\n\n{ch.content or '(空章节)'}\n\n---\n\n"

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
        if not api_key:
            raise ValueError("API密钥未配置")
        return api_key, provider
    except UserSettings.DoesNotExist:
        raise ValueError("用户设置不存在，请先配置API密钥")
    except Exception as e:
        raise ValueError(f"获取API密钥失败: {str(e)}")


@api_view(['GET'])
@permission_classes([AllowAny])
def ai_prefills(request):
    """Get auto-edit prefill options"""
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
        api_key, provider = get_user_api_key(request.user)
        ai_service = AIService(api_key=api_key, provider_name=provider)
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
            api_key, provider = await get_user_api_key_async(user)
            ai_settings = await get_user_ai_settings(user)
            ai_service = AIService(api_key=api_key, provider_name=provider)

            # Send start event
            yield f'data: {json.dumps({"type": "start", "message": "AI聊天开始"})}\n\n'

            # Stream chunks directly from async generator
            accumulated_response = ''
            try:
                async for chunk in ai_service.chat_with_ai_stream(
                    context, message, chat_history, chapter.id, model,
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

            api_key, provider = await get_user_api_key_async(user)
            ai_settings = await get_user_ai_settings(user)
            ai_service = AIService(api_key=api_key, provider_name=provider)

            yield f'data: {json.dumps({"type": "start", "message": "AI作品聊天开始"})}\n\n'

            accumulated_response = ''
            try:
                async for chunk in ai_service.chat_with_ai_stream(
                    context, message, chat_history, None, model,
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

    async def generate_stream():
        """生成SSE数据流 (async generator)"""
        try:
            api_key, provider = await get_user_api_key_async(user)
            ai_service = AIService(api_key=api_key, provider_name=provider)

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
    chapter_selection = body.get('chapter_selection', 'past_3')
    custom_chapter_count = body.get('custom_chapter_count', '3')
    selected_lore_ids = body.get('selected_lore_ids', '')
    model = body.get('model')  # Let provider determine default model
    edit_requirement = body.get('edit_requirement', '')
    style_id = body.get('style_id', '')
    use_summaries = body.get('use_summaries', False)

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
                work, chapter, user, style_id, selected_lore_ids,
                chapter_selection, custom_chapter_count, use_summaries
            )

            # Get API key and AI settings
            api_key, provider = await get_user_api_key_async(user)
            ai_settings = await get_user_ai_settings(user)
            ai_service = AIService(api_key=api_key, provider_name=provider)

            yield f'data: {json.dumps({"type": "start", "message": "AI自动编辑开始"})}\n\n'

            accumulated_text = ''
            try:
                async for chunk in ai_service.auto_edit_stream(
                    selected_text, formatted_context, model, edit_requirement,
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
def search_chapters_with_entry(work, entry_name):
    """Search chapters containing entry name (async version)"""
    from django.db.models import Q
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
            'title': chapter.title
        })
    
    context_text = "\n\n---\n\n".join(context_parts)
    return context_text, used_chapters_info


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

    async def generate_stream():
        """生成SSE数据流 (async generator)"""
        try:
            # Search chapters with entry name
            context_text, used_chapters_info = await search_chapters_with_entry(work, entry_name)

            if not context_text:
                not_found_msg = f'"{entry_name}" 尚未在故事中出现。'
                yield f'data: {json.dumps({"type": "end", "message": "生成完成", "description": not_found_msg, "used_chapters": []})}\n\n'
                return

            # Get API key
            api_key, provider = await get_user_api_key_async(user)
            ai_service = AIService(api_key=api_key, provider_name=provider)

            yield f'data: {json.dumps({"type": "start", "message": "AI描述生成开始", "used_chapters": used_chapters_info})}\n\n'

            accumulated_description = ''
            try:
                async for chunk in ai_service.auto_describe_entry_stream(entry_name, context_text):
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
