from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import login, logout
from django.contrib.auth.models import User
from .serializers import UserRegistrationSerializer, UserLoginSerializer, UserSerializer


@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    """用户注册"""
    serializer = UserRegistrationSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        token, created = Token.objects.get_or_create(user=user)
        
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
