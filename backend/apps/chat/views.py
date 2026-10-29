from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.http import StreamingHttpResponse
from apps.works.models import Work, Chapter, Act
from apps.ai_services import prompts
from apps.ai_services.services import strip_chat_reasoning
from .models import (
    ChatSession, ChatMessage, WorkChatSession, WorkChatMessage,
    OutlineChatSession, OutlineChatMessage,
)
from .outline_rounds import (
    closed_round_payloads,
    ensure_open_round,
    message_payload,
)
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
                'content': strip_chat_reasoning(msg.content) if msg.role == 'assistant' else msg.content,
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
    if role == 'assistant':
        content = strip_chat_reasoning(content)
    
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
def delete_chat_message(request, work_id, chapter_id, message_id):
    """删除单条消息及其之后的所有消息"""
    work = get_object_or_404(Work, id=work_id, author=request.user)
    chapter = get_object_or_404(Chapter, id=chapter_id, work=work)

    try:
        # 获取会话
        session = ChatSession.objects.filter(
            work=work,
            chapter=chapter,
            user=request.user
        ).first()

        if not session:
            return Response(
                {'error': '聊天会话不存在'},
                status=status.HTTP_404_NOT_FOUND
            )

        # 获取要删除的消息
        message = get_object_or_404(ChatMessage, id=message_id, session=session)

        # 删除该消息及其之后的所有消息
        ChatMessage.objects.filter(
            session=session,
            created_at__gte=message.created_at
        ).delete()

        return Response({'message': '消息已删除'})

    except Exception as e:
        logger.error(f"Delete chat message error: {str(e)}")
        return Response(
            {'error': f'删除消息失败：{str(e)}'},
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
                'content': strip_chat_reasoning(msg.content) if msg.role == 'assistant' else msg.content,
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
    if role == 'assistant':
        content = strip_chat_reasoning(content)

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
def delete_work_chat_message(request, work_id, message_id):
    """删除作品聊天单条消息及其之后的所有消息"""
    work = get_object_or_404(Work, id=work_id, author=request.user)

    try:
        # 获取会话
        session = WorkChatSession.objects.filter(
            work=work,
            user=request.user
        ).first()

        if not session:
            return Response(
                {'error': '聊天会话不存在'},
                status=status.HTTP_404_NOT_FOUND
            )

        # 获取要删除的消息
        message = get_object_or_404(WorkChatMessage, id=message_id, session=session)

        # 删除该消息及其之后的所有消息
        WorkChatMessage.objects.filter(
            session=session,
            created_at__gte=message.created_at
        ).delete()

        return Response({'message': '消息已删除'})

    except Exception as e:
        logger.error(f"Delete work chat message error: {str(e)}")
        return Response(
            {'error': f'删除消息失败：{str(e)}'},
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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_outline_chat_history(request, work_id, act_id):
    """获取卷大纲策划聊天历史"""
    work = get_object_or_404(Work, id=work_id, author=request.user)
    act = get_object_or_404(Act, id=act_id, work=work)

    try:
        session, _ = OutlineChatSession.objects.get_or_create(
            work=work,
            act=act,
            user=request.user,
            defaults={'session_id': str(uuid.uuid4())}
        )
        chat_round = ensure_open_round(session)
        history = [
            message_payload(msg)
            for msg in chat_round.messages.order_by('created_at')
        ]
        return Response({
            'session_id': session.session_id,
            'messages': history,
            'outline_template': prompts.OUTLINE_PLANNER_TEMPLATE,
            'rounds': closed_round_payloads(session),
        })
    except Exception as e:
        logger.error(f"Get outline chat history error: {str(e)}")
        return Response(
            {'error': f'获取聊天历史失败：{str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_outline_chat_round(request, work_id, act_id, round_id):
    """获取一轮已归档的大纲策划对话"""
    work = get_object_or_404(Work, id=work_id, author=request.user)
    act = get_object_or_404(Act, id=act_id, work=work)
    session = OutlineChatSession.objects.filter(work=work, act=act, user=request.user).first()
    if not session:
        return Response({'error': '聊天会话不存在'}, status=status.HTTP_404_NOT_FOUND)
    chat_round = get_object_or_404(session.rounds, id=round_id)
    return Response({
        'id': chat_round.id,
        'closed_at': chat_round.closed_at.isoformat() if chat_round.closed_at else None,
        'messages': [
            message_payload(msg)
            for msg in chat_round.messages.order_by('created_at')
        ],
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def save_outline_chat_message(request, work_id, act_id):
    """保存卷大纲策划聊天消息"""
    work = get_object_or_404(Work, id=work_id, author=request.user)
    act = get_object_or_404(Act, id=act_id, work=work)

    role = request.data.get('role')
    content = request.data.get('content')
    if role == 'assistant':
        content = strip_chat_reasoning(content)
    if not all([role, content]):
        return Response({'error': '缺少必要参数'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        session, _ = OutlineChatSession.objects.get_or_create(
            work=work,
            act=act,
            user=request.user,
            defaults={'session_id': str(uuid.uuid4())}
        )
        chat_round = ensure_open_round(session)
        message = OutlineChatMessage.objects.create(
            session=session,
            round=chat_round,
            role=role,
            content=content
        )
        return Response(message_payload(message))
    except Exception as e:
        logger.error(f"Save outline chat message error: {str(e)}")
        return Response(
            {'error': f'保存聊天消息失败：{str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_outline_chat_message(request, work_id, act_id, message_id):
    """删除大纲策划消息及其之后的所有消息"""
    work = get_object_or_404(Work, id=work_id, author=request.user)
    act = get_object_or_404(Act, id=act_id, work=work)

    try:
        session = OutlineChatSession.objects.filter(
            work=work, act=act, user=request.user
        ).first()
        if not session:
            return Response({'error': '聊天会话不存在'}, status=status.HTTP_404_NOT_FOUND)

        message = get_object_or_404(OutlineChatMessage, id=message_id, session=session)
        if message.round.closed_at is not None:
            return Response({'error': '已归档的对话不能删除'}, status=status.HTTP_400_BAD_REQUEST)
        OutlineChatMessage.objects.filter(
            round=message.round,
            created_at__gte=message.created_at
        ).delete()
        return Response({'message': '消息已删除'})
    except Exception as e:
        logger.error(f"Delete outline chat message error: {str(e)}")
        return Response(
            {'error': f'删除消息失败：{str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def clear_outline_chat_history(request, work_id, act_id):
    """清空卷大纲策划聊天历史"""
    work = get_object_or_404(Work, id=work_id, author=request.user)
    act = get_object_or_404(Act, id=act_id, work=work)

    try:
        OutlineChatSession.objects.filter(
            work=work, act=act, user=request.user
        ).delete()
        return Response({'message': '聊天历史已清空'})
    except Exception as e:
        logger.error(f"Clear outline chat history error: {str(e)}")
        return Response(
            {'error': f'清空聊天历史失败：{str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
