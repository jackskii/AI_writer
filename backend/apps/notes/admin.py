from django.contrib import admin
from .models import Note, AutoEdit, AutoEditVersion


class AutoEditVersionInline(admin.TabularInline):
    model = AutoEditVersion
    extra = 0


@admin.register(AutoEdit)
class AutoEditAdmin(admin.ModelAdmin):
    list_display = ['id', 'chapter', 'original_text_preview', 'active_version_index', 'created_at']
    list_filter = ['work', 'chapter', 'created_at']
    search_fields = ['original_text']
    inlines = [AutoEditVersionInline]

    def original_text_preview(self, obj):
        return obj.original_text[:50] + '...' if len(obj.original_text) > 50 else obj.original_text
    original_text_preview.short_description = '原始文本'


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ['id', 'work', 'chapter', 'content_preview', 'color', 'note_type', 'created_at']
    list_filter = ['work', 'chapter', 'note_type', 'is_ai_generated']
    search_fields = ['content']

    def content_preview(self, obj):
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_preview.short_description = '内容'
