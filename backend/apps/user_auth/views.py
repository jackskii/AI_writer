from rest_framework import status, generics
from django.db import models
from django.db.models import Max
from django.db.utils import ProgrammingError, OperationalError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import login, logout
from django.contrib.auth.models import User
from .serializers import UserRegistrationSerializer, UserLoginSerializer, UserSerializer, UserSettingsSerializer, UserEditPrefillSerializer
from .models import UserSettings, UserEditPrefill


@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    """用户注册"""
    serializer = UserRegistrationSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        token, created = Token.objects.get_or_create(user=user)

        # 为新用户创建设置
        UserSettings.objects.create(user=user)

        # 为新用户创建默认编辑指引预设
        create_default_edit_prefills_for_user(user, scope='auto_edit')

        # 为新用户创建模板作品
        create_template_work_for_user(user)

        return Response({
            'message': '注册成功',
            'token': token.key,
            'user': UserSerializer(user).data
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


def create_template_work_for_user(user):
    """为新用户创建模板作品"""
    try:
        from apps.works.models import Work, Act, Chapter
        
        # 创建模板作品
        work = Work.objects.create(
            title="我的第一部小说",
            synopsis="这是您的第一部作品！您可以在这里开始您的写作之旅。\n\n点击[设置]可以修改作品标题和大纲。在[章节]标签页中可以编辑具体内容。\n\n祝您创作愉快！",
            author=user
        )
        
        # 创建第一卷
        act = Act.objects.create(
            work=work,
            name="第一卷",
            order=1
        )
        
        # 创建示例章节
        Chapter.objects.create(
            work=work,
            act=act,
            title="第一章 开始",
            content="欢迎来到 AI 写作助手！\n\n这是您的第一个章节。您可以：\n\n1. 直接编辑这段文字，开始您的创作\n2. 使用右侧的AI助手获得写作建议\n3. 点击[续写]按钮让AI帮您继续故事\n4. 在聊天面板中与AI讨论剧情发展\n\n开始写作吧，让创意自由流淌！",
            order=1,
            chapter_number=1
        )
        
        print(f"Created template work for user {user.username}")
        
    except Exception as e:
        print(f"Failed to create template work for user {user.username}: {str(e)}")
        # 不抛出异常，避免影响用户注册


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """用户登录"""
    serializer = UserLoginSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        user = serializer.validated_data['user']
        token, created = Token.objects.get_or_create(user=user)
        login(request, user)
        return Response({
            'message': '登录成功',
            'token': token.key,
            'user': UserSerializer(user).data
        })
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """用户登出"""
    try:
        # 删除用户的token
        request.user.auth_token.delete()
    except:
        pass
    logout(request)
    return Response({'message': '登出成功'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_profile_view(request):
    """获取用户信息"""
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_profile_view(request):
    """更新用户信息"""
    serializer = UserSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_settings_view(request):
    """获取用户设置"""
    # Get or create user settings
    settings, created = UserSettings.objects.get_or_create(user=request.user)
    serializer = UserSettingsSerializer(settings)
    return Response(serializer.data)


@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def update_user_settings_view(request):
    """更新用户设置（主要是API密钥）"""
    settings, created = UserSettings.objects.get_or_create(user=request.user)
    serializer = UserSettingsSerializer(settings, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response({
            'message': 'API密钥已更新',
            'data': serializer.data
        })
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


def create_default_edit_prefills_for_user(user, scope='auto_edit'):
    """为用户创建默认编辑指引预设（按scope）"""
    from apps.ai_services import prompts
    
    default_prefills = [
        {
            'scope': 'auto_edit',
            'name': '增加细节',
            'prompt_text': prompts.AUTO_EDIT_PREFILLS['增加细节'],
            'is_default': True,
            'order': 0
        },
        {
            'scope': 'auto_edit',
            'name': '润色',
            'prompt_text': prompts.AUTO_EDIT_PREFILLS['润色'],
            'is_default': False,
            'order': 1
        },
        {
            'scope': 'auto_edit',
            'name': '修改',
            'prompt_text': prompts.AUTO_EDIT_PREFILLS['修改'],
            'is_default': False,
            'order': 2
        },
        {
            'scope': 'auto_edit',
            'name': '续写',
            'prompt_text': prompts.AUTO_EDIT_PREFILLS['续写'],
            'is_default': False,
            'order': 3
        },
    ]
    
    for prefill_data in default_prefills:
        UserEditPrefill.objects.get_or_create(
            user=user,
            scope=prefill_data['scope'],
            name=prefill_data['name'],
            defaults={
                'prompt_text': prefill_data['prompt_text'],
                'is_default': prefill_data['is_default'],
                'order': prefill_data['order'],
            },
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_edit_prefills_view(request):
    """获取用户的编辑指引预设（按scope）"""
    try:
        scope = 'auto_edit'
        prefills = UserEditPrefill.objects.filter(user=request.user, scope=scope)
    
        # Lazy initialization: if user has no prefills for this scope, create defaults
        if not prefills.exists():
            create_default_edit_prefills_for_user(request.user, scope=scope)
            prefills = UserEditPrefill.objects.filter(user=request.user, scope=scope)
    
        serializer = UserEditPrefillSerializer(prefills, many=True)
        return Response(serializer.data)
    except (ProgrammingError, OperationalError):
        return Response(
            {'error': '数据库结构未更新，请先执行后端迁移并重启服务'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_edit_prefill_view(request):
    """创建新的编辑指引预设"""
    scope = 'auto_edit'
    
    # Check max limit (10 including the default one) per scope
    existing_count = UserEditPrefill.objects.filter(user=request.user, scope=scope).count()
    if existing_count >= 10:
        return Response(
            {'error': '最多只能创建10个编辑指引预设'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    serializer = UserEditPrefillSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        # Set order to be after all existing prefills in this scope
        max_order = UserEditPrefill.objects.filter(user=request.user, scope=scope).aggregate(
            max_order=Max('order')
        )['max_order'] or -1
        prefill = serializer.save(user=request.user, scope=scope, order=max_order + 1)
        return Response(UserEditPrefillSerializer(prefill).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def update_edit_prefill_view(request, prefill_id):
    """更新编辑指引预设"""
    try:
        prefill = UserEditPrefill.objects.get(id=prefill_id, user=request.user)
    except UserEditPrefill.DoesNotExist:
        return Response(
            {'error': '编辑指引预设不存在'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    serializer = UserEditPrefillSerializer(prefill, data=request.data, partial=True, context={'request': request})
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_edit_prefill_view(request, prefill_id):
    """删除编辑指引预设"""
    try:
        prefill = UserEditPrefill.objects.get(id=prefill_id, user=request.user)
    except UserEditPrefill.DoesNotExist:
        return Response(
            {'error': '编辑指引预设不存在'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Cannot delete default prefill
    if prefill.is_default:
        return Response(
            {'error': '不能删除默认预设'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    prefill.delete()
    return Response({'message': '删除成功'}, status=status.HTTP_200_OK)
