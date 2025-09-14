from django.db import models
from apps.works.models import Work, Chapter


class Suggestion(models.Model):
    """AI建议模型"""
    
    SUGGESTION_TYPES = [
        ('expand', '扩展内容'),
        ('improve', '改进文本'),
        ('rewrite', '重写段落'),
        ('continue', '继续写作'),
        ('character', '角色发展'),
        ('plot', '情节推进'),
        ('dialogue', '对话优化'),
        ('description', '描述增强'),
    ]
    
    SUGGESTION_STATUS = [
        ('pending', '待处理'),
        ('accepted', '已采纳'),
        ('rejected', '已拒绝'),
        ('modified', '已修改'),
    ]
    
    work = models.ForeignKey(
        Work,
        on_delete=models.CASCADE,
        related_name='suggestions',
        verbose_name='所属作品'
    )
    chapter = models.ForeignKey(
        Chapter,
        on_delete=models.CASCADE,
        related_name='suggestions',
        verbose_name='所属章节'
    )
    
    suggestion_type = models.CharField('建议类型', max_length=20, choices=SUGGESTION_TYPES)
    content = models.TextField('建议内容')
    
    # 目标文本信息
    target_text = models.TextField('目标文本', blank=True)
    text_start_position = models.PositiveIntegerField('文本开始位置', null=True, blank=True)
    text_end_position = models.PositiveIntegerField('文本结束位置', null=True, blank=True)
    
    # 建议状态
    status = models.CharField('状态', max_length=20, choices=SUGGESTION_STATUS, default='pending')
    
    # 触发原因
    trigger_reason = models.CharField(
        '触发原因',
        max_length=50,
        choices=[
            ('auto', '自动触发'),
            ('manual', '手动请求'),
            ('word_count', '字数触发'),
            ('context', '上下文分析'),
        ],
        default='auto'
    )
    
    # 用于生成建议的上下文信息
    context_used = models.JSONField('使用的上下文', default=dict, blank=True)
    
    # AI模型信息
    model_used = models.CharField('使用模型', max_length=100, default='deepseek-chat')
    confidence_score = models.FloatField('置信度分数', null=True, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        verbose_name = 'AI建议'
        verbose_name_plural = 'AI建议'
        ordering = ['-created_at']
    
    def __str__(self):
        return f'{self.chapter.title} - {self.get_suggestion_type_display()}'


class AutoSaveHistory(models.Model):
    """自动保存历史记录"""
    
    chapter = models.ForeignKey(
        Chapter,
        on_delete=models.CASCADE,
        related_name='autosave_history',
        verbose_name='所属章节'
    )
    content = models.TextField('保存内容')
    word_count = models.PositiveIntegerField('字数')
    
    # 变更信息
    words_added = models.IntegerField('新增字数', default=0)
    chars_added = models.IntegerField('新增字符数', default=0)
    
    # 是否触发了建议生成
    triggered_suggestion = models.BooleanField('触发建议生成', default=False)
    
    created_at = models.DateTimeField('保存时间', auto_now_add=True)
    
    class Meta:
        verbose_name = '自动保存历史'
        verbose_name_plural = '自动保存历史'
        ordering = ['-created_at']
    
    def __str__(self):
        return f'{self.chapter.title} - {self.created_at.strftime("%Y-%m-%d %H:%M:%S")}'


class WritingStatistics(models.Model):
    """写作统计模型"""
    
    work = models.OneToOneField(
        Work,
        on_delete=models.CASCADE,
        related_name='statistics',
        verbose_name='所属作品'
    )
    
    # 基础统计
    total_words = models.PositiveIntegerField('总字数', default=0)
    total_characters = models.PositiveIntegerField('总字符数', default=0)
    
    # 写作进度
    words_today = models.PositiveIntegerField('今日字数', default=0)
    words_this_week = models.PositiveIntegerField('本周字数', default=0)
    words_this_month = models.PositiveIntegerField('本月字数', default=0)
    
    # AI使用统计
    ai_suggestions_generated = models.PositiveIntegerField('AI建议生成数', default=0)
    ai_suggestions_accepted = models.PositiveIntegerField('AI建议采纳数', default=0)
    ai_continues_used = models.PositiveIntegerField('AI续写使用数', default=0)
    ai_chats_count = models.PositiveIntegerField('AI聊天次数', default=0)
    
    # 写作习惯
    avg_session_length = models.FloatField('平均写作时长(分钟)', default=0.0)
    most_productive_hour = models.PositiveIntegerField('最高效时段', default=0)
    
    last_updated = models.DateTimeField('最后更新时间', auto_now=True)
    
    class Meta:
        verbose_name = '写作统计'
        verbose_name_plural = '写作统计'
    
    def __str__(self):
        return f'{self.work.title} - 统计数据'
