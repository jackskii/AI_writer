from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.http import StreamingHttpResponse
from apps.works.models import Work, Chapter
from .models import ChatSession, ChatMessage, WorkChatSession, WorkChatMessage
from apps.ai_services.services import AIService, run_async_ai_task
import logging
import json
import uuid

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_chat_history(request, work_id, chapter_id):
    """获取聊天历史"""
    work = get_object_or_404(Work, id=work_id, author=request.user)
    chapter = get_object_or_404(Chapter, id=chapter_id, work=work)
    
    try:
        # 获取或创建聊天会话
        session, _ = ChatSession.objects.get_or_create(
            work=work,
            chapter=chapter,
            user=request.user,
            defaults={'session_id': str(uuid.uuid4())}
        )
        
        # 获取聊天历史
        messages = session.messages.all().order_by('created_at')
        
        # 转换为前端格式
        history = []
        for msg in messages:
            history.append({
                'id': str(msg.id),
                'role': msg.role,
                'content': msg.content,
                'timestamp': msg.created_at.isoformat()
            })
        
        return Response({
            'session_id': session.session_id,
            'messages': history
        })
    
    except Exception as e:
        logger.error(f"Get chat history error: {str(e)}")
        return Response(
            {'error': f'获取聊天历史失败：{str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def save_chat_message(request, work_id, chapter_id):
    """保存聊天消息"""
    work = get_object_or_404(Work, id=work_id, author=request.user)
    chapter = get_object_or_404(Chapter, id=chapter_id, work=work)
    
    role = request.data.get('role')
    content = request.data.get('content')
    
    if not all([role, content]):
        return Response(
            {'error': '缺少必要参数'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # 获取或创建聊天会话
        session, _ = ChatSession.objects.get_or_create(
            work=work,
            chapter=chapter,
            user=request.user,
            defaults={'session_id': str(uuid.uuid4())}
        )
        
        # 创建聊天消息
        message = ChatMessage.objects.create(
            session=session,
            role=role,
            content=content
        )
        
        return Response({
            'id': str(message.id),
            'role': message.role,
            'content': message.content,
            'timestamp': message.created_at.isoformat()
        })
    
    except Exception as e:
        logger.error(f"Save chat message error: {str(e)}")
        return Response(
            {'error': f'保存聊天消息失败：{str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def clear_chat_history(request, work_id, chapter_id):
    """清空聊天历史"""
    work = get_object_or_404(Work, id=work_id, author=request.user)
    chapter = get_object_or_404(Chapter, id=chapter_id, work=work)
    
    try:
        # 删除聊天会话（会级联删除所有消息）
        ChatSession.objects.filter(
            work=work,
            chapter=chapter,
            user=request.user
        ).delete()
        
        return Response({'message': '聊天历史已清空'})
    
    except Exception as e:
        logger.error(f"Clear chat history error: {str(e)}")
        return Response(
            {'error': f'清空聊天历史失败：{str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_work_chat_history(request, work_id):
    """获取作品总览聊天历史"""
    work = get_object_or_404(Work, id=work_id, author=request.user)

    try:
        session, _ = WorkChatSession.objects.get_or_create(
            work=work,
            user=request.user,
            defaults={'session_id': str(uuid.uuid4())}
        )

        messages = session.messages.all().order_by('created_at')
        history = [
            {
                'id': str(msg.id),
                'role': msg.role,
                'content': msg.content,
                'timestamp': msg.created_at.isoformat()
            }
            for msg in messages
        ]

        return Response({
            'session_id': session.session_id,
            'messages': history
        })

    except Exception as e:
        logger.error(f"Get work chat history error: {str(e)}")
        return Response(
            {'error': f'获取聊天历史失败：{str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def save_work_chat_message(request, work_id):
    """保存作品总览聊天消息"""
    work = get_object_or_404(Work, id=work_id, author=request.user)

    role = request.data.get('role')
    content = request.data.get('content')

    if not all([role, content]):
        return Response(
            {'error': '缺少必要参数'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        session, _ = WorkChatSession.objects.get_or_create(
            work=work,
            user=request.user,
            defaults={'session_id': str(uuid.uuid4())}
        )

        message = WorkChatMessage.objects.create(
            session=session,
            role=role,
            content=content
        )

        return Response({
            'id': str(message.id),
            'role': message.role,
            'content': message.content,
            'timestamp': message.created_at.isoformat()
        })

    except Exception as e:
        logger.error(f"Save work chat message error: {str(e)}")
        return Response(
            {'error': f'保存聊天消息失败：{str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def clear_work_chat_history(request, work_id):
    """清空作品总览聊天历史"""
    work = get_object_or_404(Work, id=work_id, author=request.user)

    try:
        WorkChatSession.objects.filter(
            work=work,
            user=request.user
        ).delete()

        return Response({'message': '聊天历史已清空'})

    except Exception as e:
        logger.error(f"Clear work chat history error: {str(e)}")
        return Response(
            {'error': f'清空聊天历史失败：{str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
