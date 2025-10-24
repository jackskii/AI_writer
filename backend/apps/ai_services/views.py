from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.http import StreamingHttpResponse
from apps.works.models import Work, Chapter
from .services import AIService, run_async_ai_task
from .models import Suggestion
import logging
import json
import asyncio
import uuid

logger = logging.getLogger(__name__)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ai_chat(request):
    """AI聊天端点"""
    work_id = request.data.get('work_id')
    chapter_id = request.data.get('chapter_id')
    message = request.data.get('message')

    if not all([work_id, chapter_id, message]):
        return Response(
            {'error': '缺少必要参数'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 获取作品和章节
    work = get_object_or_404(Work, id=work_id, author=request.user)
    chapter = get_object_or_404(Chapter, id=chapter_id, work=work)

    try:
        # Build context in sync environment to avoid async issues
        from .services import ContextBuilder
        from . import prompts
        context = ContextBuilder.build_context(chapter)

        ai_service = AIService()
        response_content = run_async_ai_task(
            ai_service.chat_with_ai(context, message, chapter.id)
        )

        return Response({'response': response_content})

    except ValueError as e:
        # API key missing
        logger.error(f"AI configuration error: {str(e)}")
        return Response(
            {'error': str(e)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    except Exception as e:
        logger.error(f"AI chat error: {str(e)}")
        return Response(
            {'error': f'AI聊天出错：{str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ai_work_chat(request):
    """作品总览AI聊天端点"""
    work_id = request.data.get('work_id')
    message = request.data.get('message')

    if not all([work_id, message]):
        return Response(
            {'error': '缺少必要参数'},
            status=status.HTTP_400_BAD_REQUEST
        )

    work = get_object_or_404(Work, id=work_id, author=request.user)

    try:
        from .services import ContextBuilder
        context = ContextBuilder.build_work_overview_context(work)

        ai_service = AIService()
        response_content = run_async_ai_task(
            ai_service.chat_with_ai(context, message)
        )

        return Response({'response': response_content})

    except ValueError as e:
        logger.error(f"AI configuration error: {str(e)}")
        return Response(
            {'error': str(e)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    except Exception as e:
        logger.error(f"AI work chat error: {str(e)}")
        return Response(
            {'error': f'AI聊天出错：{str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ai_continue(request):
    """AI续写端点"""
    work_id = request.data.get('work_id')
    chapter_id = request.data.get('chapter_id')
    guide = request.data.get('guide')  # 可选的写作指导
    token_count = request.data.get('token_count', 160)  # 默认160 tokens
    current_content = request.data.get('content', '')  # 当前文本内容
    
    if not all([work_id, chapter_id]):
        return Response(
            {'error': '缺少必要参数'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # 获取作品和章节
    work = get_object_or_404(Work, id=work_id, author=request.user)
    chapter = get_object_or_404(Chapter, id=chapter_id, work=work)
    
    try:
        # 如果提供了当前内容，先保存到章节
        if current_content:
            chapter.content = current_content
            chapter.save(update_fields=['content'])
        
        # Build context in sync environment to avoid async issues
        from .services import ContextBuilder
        context = ContextBuilder.build_context(chapter)
        
        ai_service = AIService()
        continued_content = run_async_ai_task(
            ai_service.continue_writing(context, guide, chapter.id, token_count)
        )
        
        return Response({'content': continued_content})
    
    except Exception as e:
        logger.error(f"AI continue error: {str(e)}")
        return Response(
            {'error': f'AI续写出错：{str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


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


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ai_summarize(request):
    """AI总结端点"""
    work_id = request.data.get('work_id')
    chapter_id = request.data.get('chapter_id')
    
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
        summary = run_async_ai_task(
            ai_service.generate_summary(chapter)
        )
        
        # 保存摘要到章节
        chapter.summary = summary
        chapter.save(update_fields=['summary'])
        
        return Response({'summary': summary})
    
    except Exception as e:
        logger.error(f"AI summarize error: {str(e)}")
        return Response(
            {'error': f'AI摘要生成出错：{str(e)}'}, 
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
                        async for chunk in ai_service.chat_with_ai_stream(context, message, chat_history, chapter.id):
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
                        async for chunk in ai_service.chat_with_ai_stream(context, message, chat_history):
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
def ai_continue_stream(request):
    """AI续写端点 - SSE流式响应"""
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
    guide = request.GET.get('guide')
    token_count = int(request.GET.get('token_count', 160))
    current_content = request.GET.get('content', '')
    
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
            # 如果提供了当前内容，先保存到章节
            if current_content:
                chapter.content = current_content
                chapter.save(update_fields=['content'])
            
            # Build context in sync environment
            from .services import ContextBuilder
            context = ContextBuilder.build_context(chapter)
            
            # 创建AI服务实例并开始流式生成
            ai_service = AIService()
            
            # 运行异步生成器
            async def run_async():
                async for chunk in ai_service.continue_writing_stream(context, guide, chapter.id, token_count):
                    yield chunk
            
            # 在线程中运行异步生成器
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
                        async for chunk in ai_service.continue_writing_stream(context, guide, chapter.id, token_count):
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
            yield f"data: {json.dumps({'type': 'start', 'message': 'AI续写开始'})}\n\n"
            
            # 流式发送chunks
            while True:
                # 检查错误
                if not error_queue.empty():
                    error = error_queue.get()
                    yield f"data: {json.dumps({'type': 'error', 'message': f'AI续写失败: {error}'})}\n\n"
                    break
                
                # 获取chunk
                try:
                    chunk = chunk_queue.get(timeout=1)
                    if chunk is None:  # 结束标记
                        yield f"data: {json.dumps({'type': 'end', 'message': 'AI续写完成'})}\n\n"
                        break
                    
                    # 发送chunk
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
                    
                except:
                    # 检查线程是否还活着
                    if not thread.is_alive():
                        yield f"data: {json.dumps({'type': 'end', 'message': 'AI续写完成'})}\n\n"
                        break
            
            thread.join(timeout=5)  # 最多等待5秒
            
        except Exception as e:
            logger.error(f"Stream AI continue error: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'AI续写失败: {str(e)}'})}\n\n"
    
    response = StreamingHttpResponse(
        generate_stream(),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'  # Disable nginx buffering
    response['Access-Control-Allow-Origin'] = '*'  # CORS for SSE
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


@csrf_exempt
def ai_auto_edit_stream(request):
    """AI自动编辑端点 - SSE流式响应"""
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

    selected_text = request.GET.get('selected_text')
    work_id = request.GET.get('work_id')
    chapter_id = request.GET.get('chapter_id')

    if not all([selected_text, work_id, chapter_id]):
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
                        async for chunk in ai_service.auto_edit_stream(selected_text, context):
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
            yield f"data: {json.dumps({'type': 'start', 'message': 'AI自动编辑开始'})}\n\n"

            # 流式发送chunks
            accumulated_edit = ''
            while True:
                # 检查错误
                if not error_queue.empty():
                    error = error_queue.get()
                    yield f"data: {json.dumps({'type': 'error', 'message': f'AI自动编辑失败: {error}'})}\n\n"
                    break

                # 获取chunk
                try:
                    chunk = chunk_queue.get(timeout=1)
                    if chunk is None:  # 结束标记
                        yield f"data: {json.dumps({'type': 'end', 'message': 'AI自动编辑完成', 'edited_text': accumulated_edit})}\n\n"
                        break

                    # 累积编辑内容
                    accumulated_edit += chunk

                    # 发送chunk
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

                except:
                    # 检查线程是否还活着
                    if not thread.is_alive():
                        yield f"data: {json.dumps({'type': 'end', 'message': 'AI自动编辑完成', 'edited_text': accumulated_edit})}\n\n"
                        break

            thread.join(timeout=5)  # 最多等待5秒

        except Exception as e:
            logger.error(f"Stream AI auto-edit error: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'AI自动编辑失败: {str(e)}'})}\n\n"

    response = StreamingHttpResponse(
        generate_stream(),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'  # Disable nginx buffering
    response['Access-Control-Allow-Origin'] = '*'  # CORS for SSE
    return response
