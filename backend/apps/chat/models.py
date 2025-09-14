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
    
    # 用于存储AI响应的元数据
    metadata = models.JSONField('元数据', default=dict, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    
    class Meta:
        verbose_name = '聊天消息'
        verbose_name_plural = '聊天消息'
        ordering = ['created_at']
    
    def __str__(self):
        return f'{self.session} - {self.role}: {self.content[:50]}...'


class AIRequest(models.Model):
    """AI请求记录模型"""
    
    REQUEST_TYPES = [
        ('chat', '聊天'),
        ('continue', '续写'),
        ('suggest', '建议'),
        ('summarize', '总结'),
    ]
    
    work = models.ForeignKey(
        Work,
        on_delete=models.CASCADE,
        related_name='ai_requests',
        verbose_name='所属作品'
    )
    chapter = models.ForeignKey(
        Chapter,
        on_delete=models.CASCADE,
        related_name='ai_requests',
        verbose_name='所属章节'
    )
    request_type = models.CharField('请求类型', max_length=20, choices=REQUEST_TYPES)
    
    # 请求数据
    input_data = models.JSONField('输入数据', default=dict)
    
    # 响应数据
    response_data = models.JSONField('响应数据', default=dict)
    
    # 请求状态
    status = models.CharField(
        '状态',
        max_length=20,
        choices=[
            ('pending', '处理中'),
            ('completed', '已完成'),
            ('failed', '失败'),
        ],
        default='pending'
    )
    
    error_message = models.TextField('错误信息', blank=True)
    
    # 使用的模型
    model_used = models.CharField('使用模型', max_length=100, blank=True)
    
    # 性能指标
    tokens_used = models.PositiveIntegerField('使用Token数', null=True, blank=True)
    processing_time = models.FloatField('处理时间(秒)', null=True, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    
    class Meta:
        verbose_name = 'AI请求记录'
        verbose_name_plural = 'AI请求记录'
        ordering = ['-created_at']
    
    def __str__(self):
        return f'{self.work.title} - {self.request_type} ({self.status})'
