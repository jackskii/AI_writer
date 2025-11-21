from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.http import StreamingHttpResponse
from apps.works.models import Work, Chapter, LoreEntry
from .services import AIService, run_async_ai_task
from .models import Suggestion
from . import prompts
import logging
import json
import asyncio
import uuid

logger = logging.getLogger(__name__)


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
        ai_service = AIService()
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
def ai_chat_stream(request):
    """AI聊天端点 - SSE流式响应，支持聊天历史"""
    if request.method != 'GET':
        return HttpResponse(
            'data: {"type": "error", "message": "仅支持GET请求"}\n\n',
            content_type='text/event-stream'
        )

    # Check authentication via token query parameter for EventSource compatibility
    user = None
    token = request.GET.get('token')
    if token:
        from django.contrib.auth.models import AnonymousUser
        from rest_framework.authtoken.models import Token
        try:
            token_obj = Token.objects.get(key=token)
            user = token_obj.user
            request.user = user
        except Token.DoesNotExist:
            return HttpResponse(
                'data: {"type": "error", "message": "认证令牌无效"}\n\n',
                content_type='text/event-stream',
                status=401
            )
    elif not request.user.is_authenticated:
        return HttpResponse(
            'data: {"type": "error", "message": "需要登录"}\n\n',
            content_type='text/event-stream',
            status=401
        )
    else:
        user = request.user

    work_id = request.GET.get('work_id')
    chapter_id = request.GET.get('chapter_id')
    message = request.GET.get('message')
    model = request.GET.get('model', 'deepseek-chat')  # Get model parameter, default to deepseek-chat
    
    if not all([work_id, chapter_id, message]):
        return HttpResponse(
            'data: {"type": "error", "message": "缺少必要参数"}\n\n', 
            content_type='text/event-stream'
        )
    
    # 获取作品和章节
    work = get_object_or_404(Work, id=work_id)
    chapter = get_object_or_404(Chapter, id=chapter_id, work=work)
    
    def generate_stream():
        """生成SSE数据流"""
        try:
            # 获取聊天历史
            from apps.chat.models import ChatSession, ChatMessage
            try:
                session = ChatSession.objects.get(
                    work=work,
                    chapter=chapter,
                    user=request.user if hasattr(request, 'user') and request.user.is_authenticated else None
                )
                # 获取最近10条消息作为上下文
                recent_messages = session.messages.all().order_by('-created_at')[:10]
                chat_history = []
                for msg in reversed(list(recent_messages)):
                    chat_history.append({
                        'role': msg.role,
                        'content': msg.content
                    })
            except ChatSession.DoesNotExist:
                chat_history = []
            
            # Build context in sync environment
            from .services import ContextBuilder
            context = ContextBuilder.build_context(chapter)
            
            # 创建AI服务实例并开始流式生成
            ai_service = AIService()
            
            # 运行异步生成器
            import asyncio
            import threading
            from queue import Queue
            
            chunk_queue = Queue()
            error_queue = Queue()
            
            def run_in_thread():
                try:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    
                    async def collect_chunks():
                        async for chunk in ai_service.chat_with_ai_stream(context, message, chat_history, chapter.id, model):
                            chunk_queue.put(chunk)
                        chunk_queue.put(None)  # 结束标记
                    
                    loop.run_until_complete(collect_chunks())
                except Exception as e:
                    error_queue.put(str(e))
                    chunk_queue.put(None)
                finally:
                    loop.close()
            
            # 启动线程
            thread = threading.Thread(target=run_in_thread)
            thread.start()
            
            # 发送初始事件
            yield f'data: {json.dumps({"type": "start", "message": "AI聊天开始"})}\n\n'
            
            # 流式发送chunks
            accumulated_response = ''
            while True:
                # 检查错误
                if not error_queue.empty():
                    error = error_queue.get()
                    yield f'data: {json.dumps({"type": "error", "message": f"AI聊天失败: {error}"})}\n\n'
                    break
                
                # 获取chunk
                try:
                    chunk = chunk_queue.get(timeout=1)
                    if chunk is None:  # 结束标记
                        yield f'data: {json.dumps({"type": "end", "message": "AI聊天完成", "full_response": accumulated_response})}\n\n'
                        break
                    
                    # 累积响应内容
                    accumulated_response += chunk
                    
                    # 发送chunk
                    yield f'data: {json.dumps({"type": "chunk", "content": chunk})}\n\n'
                    
                except:
                    # 检查线程是否还活着
                    if not thread.is_alive():
                        yield f'data: {json.dumps({"type": "end", "message": "AI聊天完成", "full_response": accumulated_response})}\n\n'
                        break
            
            thread.join(timeout=5)  # 最多等待5秒
            
        except Exception as e:
            logger.error(f"Stream AI chat error: {str(e)}")
            yield f'data: {json.dumps({"type": "error", "message": f"AI聊天失败: {str(e)}"})}\n\n'
    
    response = StreamingHttpResponse(
        generate_stream(),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'  # Disable nginx buffering
    response['Access-Control-Allow-Origin'] = '*'  # CORS for SSE
    return response


@csrf_exempt
def ai_work_chat_stream(request):
    """作品总览AI聊天端点 - SSE流式响应"""
    if request.method != 'GET':
        return HttpResponse(
            'data: {"type": "error", "message": "仅支持GET请求"}\n\n',
            content_type='text/event-stream'
        )

    user = None
    token = request.GET.get('token')
    if token:
        from django.contrib.auth.models import AnonymousUser
        from rest_framework.authtoken.models import Token
        try:
            token_obj = Token.objects.get(key=token)
            user = token_obj.user
            request.user = user
        except Token.DoesNotExist:
            return HttpResponse(
                'data: {"type": "error", "message": "认证令牌无效"}\n\n',
                content_type='text/event-stream',
                status=401
            )
    elif not request.user.is_authenticated:
        return HttpResponse(
            'data: {"type": "error", "message": "需要登录"}\n\n',
            content_type='text/event-stream',
            status=401
        )
    else:
        user = request.user

    work_id = request.GET.get('work_id')
    message = request.GET.get('message')
    model = request.GET.get('model', 'deepseek-chat')  # Get model parameter, default to deepseek-chat

    if not all([work_id, message]):
        return HttpResponse(
            'data: {"type": "error", "message": "缺少必要参数"}\n\n',
            content_type='text/event-stream'
        )

    work = get_object_or_404(Work, id=work_id)

    def generate_stream():
        """生成SSE数据流"""
        try:
            from apps.chat.models import WorkChatSession, WorkChatMessage
            session, _ = WorkChatSession.objects.get_or_create(
                work=work,
                user=user,
                defaults={'session_id': str(uuid.uuid4())}
            )

            recent_messages = WorkChatMessage.objects.filter(
                session=session
            ).order_by('-created_at')[:10]
            chat_history = [
                {
                    'role': msg.role,
                    'content': msg.content
                }
                for msg in reversed(list(recent_messages))
            ]

            from .services import ContextBuilder
            context = ContextBuilder.build_work_overview_context(work)

            ai_service = AIService()

            import asyncio
            import threading
            from queue import Queue

            chunk_queue = Queue()
            error_queue = Queue()

            def run_in_thread():
                try:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)

                    async def collect_chunks():
                        async for chunk in ai_service.chat_with_ai_stream(context, message, chat_history, None, model):
                            chunk_queue.put(chunk)
                        chunk_queue.put(None)

                    loop.run_until_complete(collect_chunks())
                except Exception as e:
                    error_queue.put(str(e))
                    chunk_queue.put(None)
                finally:
                    loop.close()

            thread = threading.Thread(target=run_in_thread)
            thread.start()

            yield f'data: {json.dumps({"type": "start", "message": "AI作品聊天开始"})}\n\n'

            accumulated_response = ''
            while True:
                if not error_queue.empty():
                    error = error_queue.get()
                    yield f'data: {json.dumps({"type": "error", "message": f"AI聊天失败: {error}"})}\n\n'
                    break

                try:
                    chunk = chunk_queue.get(timeout=1)
                    if chunk is None:
                        yield f'data: {json.dumps({"type": "end", "message": "AI聊天完成", "full_response": accumulated_response})}\n\n'
                        break

                    accumulated_response += chunk
                    yield f'data: {json.dumps({"type": "chunk", "content": chunk})}\n\n'

                except:
                    if not thread.is_alive():
                        yield f'data: {json.dumps({"type": "end", "message": "AI聊天完成", "full_response": accumulated_response})}\n\n'
                        break

            thread.join(timeout=5)

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
def ai_summarize_stream(request):
    """AI摘要端点 - SSE流式响应"""
    if request.method != 'GET':
        return HttpResponse(
            'data: {"type": "error", "message": "仅支持GET请求"}\n\n',
            content_type='text/event-stream'
        )

    # Check authentication via token query parameter for EventSource compatibility
    user = None
    token = request.GET.get('token')
    if token:
        from django.contrib.auth.models import AnonymousUser
        from rest_framework.authtoken.models import Token
        try:
            token_obj = Token.objects.get(key=token)
            user = token_obj.user
            request.user = user
        except Token.DoesNotExist:
            return HttpResponse(
                'data: {"type": "error", "message": "认证令牌无效"}\n\n',
                content_type='text/event-stream',
                status=401
            )
    elif not request.user.is_authenticated:
        return HttpResponse(
            'data: {"type": "error", "message": "需要登录"}\n\n',
            content_type='text/event-stream',
            status=401
        )
    else:
        user = request.user
        
    work_id = request.GET.get('work_id')
    chapter_id = request.GET.get('chapter_id')
    
    if not all([work_id, chapter_id]):
        return HttpResponse(
            'data: {"type": "error", "message": "缺少必要参数"}\n\n', 
            content_type='text/event-stream'
        )
    
    # 获取作品和章节
    work = get_object_or_404(Work, id=work_id)
    chapter = get_object_or_404(Chapter, id=chapter_id, work=work)
    
    def generate_stream():
        """生成SSE数据流"""
        try:
            # Build context in sync environment
            from .services import ContextBuilder
            context = ContextBuilder.build_context(chapter, include_current_content=True)
            
            # 创建AI服务实例并开始流式生成
            ai_service = AIService()
            
            # 运行异步生成器
            import asyncio
            import threading
            from queue import Queue
            
            chunk_queue = Queue()
            error_queue = Queue()
            
            def run_in_thread():
                try:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    
                    async def collect_chunks():
                        async for chunk in ai_service.generate_summary_stream(chapter):
                            chunk_queue.put(chunk)
                        chunk_queue.put(None)  # 结束标记
                    
                    loop.run_until_complete(collect_chunks())
                except Exception as e:
                    error_queue.put(str(e))
                    chunk_queue.put(None)
                finally:
                    loop.close()
            
            # 启动线程
            thread = threading.Thread(target=run_in_thread)
            thread.start()
            
            # 发送初始事件
            yield f"data: {json.dumps({'type': 'start', 'message': 'AI摘要生成开始'})}\n\n"
            
            # 流式发送chunks
            accumulated_summary = ''
            while True:
                # 检查错误
                if not error_queue.empty():
                    error = error_queue.get()
                    yield f"data: {json.dumps({'type': 'error', 'message': f'AI摘要生成失败: {error}'})}\n\n"
                    break
                
                # 获取chunk
                try:
                    chunk = chunk_queue.get(timeout=1)
                    if chunk is None:  # 结束标记
                        # 保存摘要到章节
                        chapter.summary = accumulated_summary
                        chapter.save(update_fields=['summary'])
                        
                        yield f"data: {json.dumps({'type': 'end', 'message': 'AI摘要生成完成', 'summary': accumulated_summary})}\n\n"
                        break
                    
                    # 累积摘要内容
                    accumulated_summary += chunk
                    
                    # 发送chunk
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
                    
                except:
                    # 检查线程是否还活着
                    if not thread.is_alive():
                        yield f"data: {json.dumps({'type': 'end', 'message': 'AI摘要生成完成', 'summary': accumulated_summary})}\n\n"
                        break
            
            thread.join(timeout=5)  # 最多等待5秒

        except Exception as e:
            logger.error(f"Stream AI summarize error: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'AI摘要生成失败: {str(e)}'})}\n\n"

    response = StreamingHttpResponse(
        generate_stream(),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'  # Disable nginx buffering
    response['Access-Control-Allow-Origin'] = '*'  # CORS for SSE
    return response


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ai_auto_edit(request):
    """AI自动编辑端点 - 非流式响应"""
    selected_text = request.data.get('selected_text')
    work_id = request.data.get('work_id')
    chapter_id = request.data.get('chapter_id')

    if not all([selected_text, work_id, chapter_id]):
        return Response(
            {'error': '缺少必要参数'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 获取作品和章节
    work = get_object_or_404(Work, id=work_id, author=request.user)
    chapter = get_object_or_404(Chapter, id=chapter_id, work=work)

    try:
        # Build context: synopsis + last 3 chapters
        work = chapter.work
        formatted_context = ""

        # Add synopsis
        if work.synopsis:
            formatted_context += f"作品大纲：{work.synopsis}\n\n"

        # Get last 3 chapters with full content
        last_three_chapters = work.chapters.filter(
            order__lt=chapter.order
        ).order_by('-order')[:3]

        if last_three_chapters:
            formatted_context += "前文章节：\n\n"
            # Reverse to show in chronological order
            for ch in reversed(list(last_three_chapters)):
                formatted_context += f"第{ch.chapter_number}章《{ch.title}》\n\n{ch.content or '(空章节)'}\n\n---\n\n"

        ai_service = AIService()
        edited_text = run_async_ai_task(
            ai_service.auto_edit(selected_text, formatted_context)
        )

        return Response({'edited_text': edited_text})

    except Exception as e:
        logger.error(f"AI auto-edit error: {str(e)}")
        return Response(
            {'error': f'AI自动编辑出错：{str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@csrf_exempt
def ai_auto_edit_stream(request):
    """AI自动编辑端点 - SSE流式响应，支持上下文自定义"""
    if request.method != 'GET':
        return HttpResponse(
            'data: {"type": "error", "message": "仅支持GET请求"}\n\n',
            content_type='text/event-stream'
        )

    # Check authentication
    user = None
    token = request.GET.get('token')
    if token:
        from rest_framework.authtoken.models import Token
        try:
            token_obj = Token.objects.get(key=token)
            user = token_obj.user
            request.user = user
        except Token.DoesNotExist:
            return HttpResponse(
                'data: {"type": "error", "message": "认证令牌无效"}\n\n',
                content_type='text/event-stream',
                status=401
            )
    elif not request.user.is_authenticated:
        return HttpResponse(
            'data: {"type": "error", "message": "需要登录"}\n\n',
            content_type='text/event-stream',
            status=401
        )
    else:
        user = request.user

    selected_text = request.GET.get('selected_text')
    work_id = request.GET.get('work_id')
    chapter_id = request.GET.get('chapter_id')

    # Context customization parameters
    chapter_selection = request.GET.get('chapter_selection', 'past_3')  # 'all', 'past_3', 'custom', 'none'
    custom_chapter_count = request.GET.get('custom_chapter_count', '3')
    selected_lore_ids = request.GET.get('selected_lore_ids', '')  # Comma-separated IDs
    model = request.GET.get('model', 'deepseek-chat')  # Model selection
    edit_requirement = request.GET.get('edit_requirement', '')  # Editing guide/requirement
    style_id = request.GET.get('style_id', '')  # Optional writing style ID

    if not all([selected_text, work_id, chapter_id]):
        return HttpResponse(
            'data: {"type": "error", "message": "缺少必要参数"}\n\n',
            content_type='text/event-stream'
        )

    work = get_object_or_404(Work, id=work_id)
    chapter = get_object_or_404(Chapter, id=chapter_id, work=work)

    def generate_stream():
        """生成SSE数据流"""
        try:
            # Build context based on user selection
            formatted_context = ""

            # Add writing style if selected
            if style_id:
                try:
                    from apps.works.models import WritingStyle
                    style = WritingStyle.objects.get(id=int(style_id), user=user)
                    formatted_context += f"写作风格参考：\n\n{style.style_data}\n\n---\n\n"
                except (WritingStyle.DoesNotExist, ValueError):
                    # Style not found or invalid ID, continue without it
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
            # First, get the count of available previous chapters
            available_previous_count = work.chapters.filter(order__lt=chapter.order).count()

            previous_chapters = []
            if chapter_selection == 'none':
                # No previous chapters
                previous_chapters = []
            elif chapter_selection == 'all':
                # Get all previous chapters (no duplicates, ordered by chapter order)
                previous_chapters = work.chapters.filter(
                    order__lt=chapter.order
                ).order_by('order')
            elif chapter_selection == 'custom':
                # Get custom number of previous chapters (capped at available)
                try:
                    count = int(custom_chapter_count)
                    count = min(max(0, count), available_previous_count)  # Cap at available chapters, allow 0
                    if count > 0:
                        previous_chapters = work.chapters.filter(
                            order__lt=chapter.order
                        ).order_by('-order')[:count]
                        previous_chapters = reversed(list(previous_chapters))
                    else:
                        previous_chapters = []
                except:
                    count = 3
                    previous_chapters = work.chapters.filter(
                        order__lt=chapter.order
                    ).order_by('-order')[:count]
                    previous_chapters = reversed(list(previous_chapters))
            else:  # 'past_3' (default)
                # Get last 3 chapters (or fewer if not enough available)
                count = min(3, available_previous_count)
                previous_chapters = work.chapters.filter(
                    order__lt=chapter.order
                ).order_by('-order')[:count]
                previous_chapters = reversed(list(previous_chapters))

            if previous_chapters and len(list(previous_chapters)) > 0:
                formatted_context += "前文章节：\n\n"
                for ch in previous_chapters:
                    formatted_context += f"第{ch.chapter_number}章《{ch.title}》\n\n{ch.content or '(空章节)'}\n\n---\n\n"

            # Add current chapter content at the end
            if chapter.content:
                formatted_context += f"当前章节《{chapter.title}》全文：\n\n{chapter.content}\n\n---\n\n"

            # Create AI service and start streaming
            ai_service = AIService()

            import asyncio
            import threading
            from queue import Queue

            chunk_queue = Queue()
            error_queue = Queue()

            def run_in_thread():
                try:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)

                    async def collect_chunks():
                        async for chunk in ai_service.auto_edit_stream(selected_text, formatted_context, model, edit_requirement):
                            chunk_queue.put(chunk)
                        chunk_queue.put(None)  # End marker

                    loop.run_until_complete(collect_chunks())
                except Exception as e:
                    error_queue.put(str(e))
                    chunk_queue.put(None)
                finally:
                    loop.close()

            thread = threading.Thread(target=run_in_thread)
            thread.start()

            yield f'data: {json.dumps({"type": "start", "message": "AI自动编辑开始"})}\n\n'

            accumulated_text = ''
            while True:
                if not error_queue.empty():
                    error = error_queue.get()
                    yield f'data: {json.dumps({"type": "error", "message": f"AI自动编辑失败: {error}"})}\n\n'
                    break

                try:
                    chunk = chunk_queue.get(timeout=1)
                    if chunk is None:
                        yield f'data: {json.dumps({"type": "end", "message": "AI自动编辑完成", "edited_text": accumulated_text})}\n\n'
                        break

                    accumulated_text += chunk
                    yield f'data: {json.dumps({"type": "chunk", "content": chunk})}\n\n'

                except:
                    if not thread.is_alive():
                        yield f'data: {json.dumps({"type": "end", "message": "AI自动编辑完成", "edited_text": accumulated_text})}\n\n'
                        break

            thread.join(timeout=5)

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


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ai_auto_describe_entry(request):
    """AI自动生成条目描述 - 基于章节内容"""
    entry_name = request.data.get('entry_name')
    work_id = request.data.get('work_id')

    if not all([entry_name, work_id]):
        return Response(
            {'error': '缺少必要参数'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 获取作品
    work = get_object_or_404(Work, id=work_id, author=request.user)

    try:
        # 搜索包含条目名称的章节（前5章）
        from django.db.models import Q
        chapters_with_entry = work.chapters.filter(
            Q(content__icontains=entry_name) | Q(title__icontains=entry_name)
        ).order_by('order')[:5]

        if not chapters_with_entry:
            return Response({
                'description': f'"{entry_name}" 尚未在故事中出现。',
                'used_chapters': []
            })

        # 构建上下文：章节内容，并记录使用的章节
        context_parts = []
        used_chapters_info = []
        for chapter in chapters_with_entry:
            context_parts.append(f"### 第{chapter.chapter_number}章《{chapter.title}》\n\n{chapter.content}")
            used_chapters_info.append({
                'chapter_number': chapter.chapter_number,
                'title': chapter.title
            })

        context_text = "\n\n---\n\n".join(context_parts)

        # 调用AI生成描述
        ai_service = AIService()

        prompt = f"""基于以下章节内容，为"{entry_name}"创建一个详细的世界观条目描述。

章节内容：
{context_text}

请按照以下格式生成描述：

名字-年龄-性别。
外观：
性格：
人物简介：

如果"{entry_name}"不是人物，请根据其类型（地点、物品、概念等）调整格式，但保持结构清晰。"""

        messages = [
            {"role": "user", "content": prompt}
        ]

        response = run_async_ai_task(
            ai_service.deepseek.chat_completion(messages, stream=False)
        )

        description = response["choices"][0]["message"]["content"]

        return Response({
            'description': description,
            'used_chapters': used_chapters_info
        })

    except Exception as e:
        logger.error(f"AI auto-describe entry error: {str(e)}")
        return Response(
            {'error': f'AI生成描述失败：{str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
