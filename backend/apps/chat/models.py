from django.db import models
from django.contrib.auth.models import User
from apps.works.models import Work, Chapter


class ChatSession(models.Model):
    """聊天会话模型"""

    work = models.ForeignKey(
        Work,
        on_delete=models.CASCADE,
        related_name='chat_sessions',
        verbose_name='所属作品'
    )
    chapter = models.ForeignKey(
        Chapter,
        on_delete=models.CASCADE,
        related_name='chat_sessions',
        verbose_name='所属章节'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='chat_sessions',
        verbose_name='用户'
    )
    session_id = models.CharField('会话ID', max_length=100, unique=True)

    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        verbose_name = '聊天会话'
        verbose_name_plural = '聊天会话'
        ordering = ['-updated_at']
        unique_together = ('work', 'chapter', 'user')

    def __str__(self):
        return f'{self.work.title} - {self.chapter.title} 会话'


class ChatMessage(models.Model):
    """聊天消息模型"""

    MESSAGE_ROLES = [
        ('user', '用户'),
        ('assistant', 'AI助手'),
        ('system', '系统'),
    ]

    session = models.ForeignKey(
        ChatSession,
        on_delete=models.CASCADE,
        related_name='messages',
        verbose_name='所属会话'
    )
    role = models.CharField('角色', max_length=20, choices=MESSAGE_ROLES)
    content = models.TextField('消息内容')
    metadata = models.JSONField('元数据', default=dict, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)

    class Meta:
        verbose_name = '聊天消息'
        verbose_name_plural = '聊天消息'
        ordering = ['created_at']

    def __str__(self):
        return f'{self.session} - {self.role}: {self.content[:50]}...'


class WorkChatSession(models.Model):
    """作品总览聊天会话"""

    work = models.ForeignKey(
        Work,
        on_delete=models.CASCADE,
        related_name='work_chat_sessions',
        verbose_name='所属作品'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='work_chat_sessions',
        verbose_name='用户'
    )
    session_id = models.CharField('会话ID', max_length=100, unique=True)

    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        verbose_name = '作品总览聊天会话'
        verbose_name_plural = '作品总览聊天会话'
        ordering = ['-updated_at']
        unique_together = ('work', 'user')

    def __str__(self):
        return f'{self.work.title} - 作品总览会话'


class WorkChatMessage(models.Model):
    """作品总览聊天消息"""

    MESSAGE_ROLES = ChatMessage.MESSAGE_ROLES

    session = models.ForeignKey(
        WorkChatSession,
        on_delete=models.CASCADE,
        related_name='messages',
        verbose_name='所属会话'
    )
    role = models.CharField('角色', max_length=20, choices=MESSAGE_ROLES)
    content = models.TextField('消息内容')
    metadata = models.JSONField('元数据', default=dict, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)

    class Meta:
        verbose_name = '作品总览聊天消息'
        verbose_name_plural = '作品总览聊天消息'
        ordering = ['created_at']

    def __str__(self):
        return f'{self.session} - {self.role}: {self.content[:50]}...'
