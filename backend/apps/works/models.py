from django.db import models
from django.contrib.auth.models import User
import random


def generate_large_id():
    """Generate a random 7-digit ID"""
    return random.randint(1000000, 9999999)


class Work(models.Model):
    """小说作品模型"""
    id = models.BigIntegerField(primary_key=True, default=generate_large_id)
    title = models.CharField('作品标题', max_length=200)
    synopsis = models.TextField('作品大纲', blank=True)
    lore_entry_template = models.TextField('条目生成模板', blank=True, null=True, help_text='自定义AI生成条目描述的模板，为空则使用默认模板')
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='works',
        verbose_name='作者'
    )
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        verbose_name = '作品'
        verbose_name_plural = '作品'
        ordering = ['-updated_at']
    
    def __str__(self):
        return self.title
    
    @property
    def word_count(self):
        """计算总字数"""
        return sum(chapter.word_count for chapter in self.chapters.all())
    
    @property
    def chapter_count(self):
        """计算章节数量"""
        return self.chapters.count()


class Act(models.Model):
    """卷模型"""
    
    ACT_TYPES = [
        ('normal', '正常卷'),
        ('side_chapters', '外传'),
    ]
    
    id = models.BigIntegerField(primary_key=True, default=generate_large_id)
    work = models.ForeignKey(
        Work,
        on_delete=models.CASCADE,
        related_name='acts',
        verbose_name='所属作品'
    )
    name = models.CharField('卷名', max_length=100)
    order = models.PositiveIntegerField('排序')
    synopsis = models.TextField('卷摘要', blank=True, default='')
    act_type = models.CharField(
        '卷类型',
        max_length=20,
        choices=ACT_TYPES,
        default='normal'
    )
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        verbose_name = '卷'
        verbose_name_plural = '卷'
        ordering = ['work', 'order']
        unique_together = ['work', 'order']
    
    def __str__(self):
        return f'{self.work.title} - {self.name}'
    
    @property
    def word_count(self):
        """计算卷的总字数"""
        return sum(chapter.word_count for chapter in self.chapters.all())
    
    @property
    def chapter_count(self):
        """计算卷的章节数量"""
        return self.chapters.count()
    
    def save(self, *args, **kwargs):
        if not self.name:
            # 自动生成默认卷名
            self.name = f'第{self.order}卷'
        super().save(*args, **kwargs)


class Chapter(models.Model):
    """章节模型"""
    
    id = models.BigIntegerField(primary_key=True, default=generate_large_id)
    work = models.ForeignKey(
        Work,
        on_delete=models.CASCADE,
        related_name='chapters',
        verbose_name='所属作品'
    )
    act = models.ForeignKey(
        Act,
        on_delete=models.CASCADE,
        related_name='chapters',
        verbose_name='所属卷'
    )
    title = models.CharField('章节标题', max_length=200)
    content = models.TextField('章节内容', blank=True)
    order = models.PositiveIntegerField('排序', default=0)
    chapter_number = models.PositiveIntegerField('章节号', default=1)
    summary = models.TextField('章节摘要', blank=True)

    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    last_autosave = models.DateTimeField('最后自动保存时间', auto_now=True)
    
    class Meta:
        verbose_name = '章节'
        verbose_name_plural = '章节'
        ordering = ['act__order', 'chapter_number']
        unique_together = ['work', 'order']  # Keep global ordering unique
    
    def __str__(self):
        return f'{self.work.title} - {self.title}'
    
    @property
    def word_count(self):
        """计算字数（中英文混合）"""
        if not self.content:
            return 0
        
        import re
        
        # 统计中文字符（每个字符算一个词）
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', self.content))
        
        # 统计英文单词（按空格分隔，去除中文字符）
        # 先移除中文字符，然后按空格分割统计英文单词
        english_text = re.sub(r'[\u4e00-\u9fff]', ' ', self.content)
        english_words = len([word for word in english_text.split() if word.strip()])
        
        return chinese_chars + english_words
    
    def save(self, *args, **kwargs):
        if self.order == 0 and self.work:
            # 自动设置排序值
            max_order = self.work.chapters.aggregate(
                models.Max('order')
            )['order__max'] or 0
            self.order = max_order + 1
        super().save(*args, **kwargs)


class Faction(models.Model):
    """阵营/分组模型 - 用于组织世界观条目"""
    
    FACTION_TYPES = [
        ('normal', '普通阵营'),
        ('no_faction', '无归属'),
        ('worldbuilding', '世界观'),
    ]
    
    id = models.BigIntegerField(primary_key=True, default=generate_large_id)
    work = models.ForeignKey(
        Work,
        on_delete=models.CASCADE,
        related_name='factions',
        verbose_name='所属作品'
    )
    name = models.CharField('阵营名称', max_length=200)
    description = models.TextField('阵营描述', blank=True)
    is_default = models.BooleanField('是否默认', default=False)
    faction_type = models.CharField(
        '阵营类型',
        max_length=20,
        choices=FACTION_TYPES,
        default='normal'
    )
    order = models.PositiveIntegerField('排序', default=0)

    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        verbose_name = '阵营'
        verbose_name_plural = '阵营'
        ordering = ['work', 'order']
    
    def __str__(self):
        return f'{self.work.title} - {self.name}'


class LoreEntry(models.Model):
    """世界观条目模型"""
    
    id = models.BigIntegerField(primary_key=True, default=generate_large_id)
    work = models.ForeignKey(
        Work,
        on_delete=models.CASCADE,
        related_name='lore_entries',
        verbose_name='所属作品'
    )
    name = models.CharField('条目名称', max_length=200)
    description = models.TextField('详细描述')
    triggers = models.JSONField('触发词', default=list, help_text='当内容中包含这些词时会触发此条目')
    # NOTE: Kept for backward compatibility / future extension.
    # Current frontend UI does not provide an editor for this field.
    extra_triggers = models.JSONField('额外触发词', default=list, help_text='保留字段：当前前端UI未提供编辑入口')
    factions = models.ManyToManyField(
        Faction,
        related_name='lore_entries',
        blank=True,
        verbose_name='所属阵营'
    )
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        verbose_name = '世界观条目'
        verbose_name_plural = '世界观条目'
        ordering = ['work', 'name']
    
    def __str__(self):
        return f'{self.work.title} - {self.name}'
    
    @property
    def all_triggers(self):
        """获取所有触发词（包括名称）"""
        all_triggers = [self.name]
        all_triggers.extend(self.triggers or [])
        all_triggers.extend(self.extra_triggers or [])
        return list(set(all_triggers))  # 去重


class WritingStyle(models.Model):
    """写作风格模型 - 用户全局的写作风格管理"""

    id = models.BigIntegerField(primary_key=True, default=generate_large_id)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='writing_styles',
        verbose_name='用户'
    )
    name = models.CharField('风格名称', max_length=200)
    style_data = models.TextField('风格内容', help_text='完整的风格描述文本')
    analysis_result = models.JSONField(
        '分析结果',
        null=True,
        blank=True,
        help_text='AI分析的结构化数据，包含多个维度和示例'
    )
    is_nsfw = models.BooleanField('NSFW风格', default=False)

    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        verbose_name = '写作风格'
        verbose_name_plural = '写作风格'
        ordering = ['user', '-updated_at']
        unique_together = ['user', 'name']  # 同一用户不能有重名风格

    def __str__(self):
        return f'{self.user.username} - {self.name}'
