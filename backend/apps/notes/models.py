from django.db import models
from apps.works.models import Work, Chapter, generate_large_id


class Note(models.Model):
    """笔记模型"""
    
    id = models.BigIntegerField(primary_key=True, default=generate_large_id)
    NOTE_COLORS = [
        ('#f59e0b', '黄色'),  # amber-500
        ('#ef4444', '红色'),  # red-500
        ('#10b981', '绿色'),  # emerald-500
        ('#3b82f6', '蓝色'),  # blue-500
        ('#8b5cf6', '紫色'),  # violet-500
        ('#f97316', '橙色'),  # orange-500
        ('#06b6d4', '青色'),  # cyan-500
        ('#84cc16', '柠檬绿'), # lime-500
    ]
    
    work = models.ForeignKey(
        Work,
        on_delete=models.CASCADE,
        related_name='notes',
        verbose_name='所属作品',
        null=True,
        blank=True
    )
    chapter = models.ForeignKey(
        Chapter,
        on_delete=models.CASCADE,
        related_name='notes',
        verbose_name='所属章节',
        null=True,
        blank=True
    )
    content = models.TextField('笔记内容')
    color = models.CharField('颜色', max_length=7, choices=NOTE_COLORS, default='#f59e0b')
    
    # 文本位置信息（如果笔记关联到特定文本位置）
    text_start_position = models.PositiveIntegerField('文本开始位置', null=True, blank=True)
    text_end_position = models.PositiveIntegerField('文本结束位置', null=True, blank=True)
    linked_text = models.TextField('关联文本', blank=True)
    
    # AI生成的笔记标记
    is_ai_generated = models.BooleanField('AI生成', default=False)
    note_type = models.CharField(
        '笔记类型',
        max_length=50,
        choices=[
            ('user', '用户笔记'),
            ('suggestion', 'AI建议'),
            ('reminder', '提醒'),
            ('character', '角色相关'),
            ('plot', '情节相关'),
            ('setting', '设定相关'),
        ],
        default='user'
    )
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        verbose_name = '笔记'
        verbose_name_plural = '笔记'
        ordering = ['-created_at']
    
    def __str__(self):
        if self.chapter:
            return f'{self.chapter.title} - 笔记'
        elif self.work:
            return f'{self.work.title} - 笔记'
        else:
            return f'笔记 ({self.content[:20]}...)'
    
    def save(self, *args, **kwargs):
        # 如果设置了chapter，自动设置work
        if self.chapter and not self.work:
            self.work = self.chapter.work
        super().save(*args, **kwargs)
