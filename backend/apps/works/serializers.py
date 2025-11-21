from rest_framework import serializers
from .models import Work, Act, Chapter, LoreEntry, WritingStyle


class ActSerializer(serializers.ModelSerializer):
    word_count = serializers.ReadOnlyField()
    chapter_count = serializers.ReadOnlyField()
    
    class Meta:
        model = Act
        fields = [
            'id', 'work', 'name', 'order', 
            'word_count', 'chapter_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['work', 'created_at', 'updated_at']


class ChapterSerializer(serializers.ModelSerializer):
    word_count = serializers.ReadOnlyField()
    act_name = serializers.CharField(source='act.name', read_only=True)
    act_order = serializers.IntegerField(source='act.order', read_only=True)
    
    class Meta:
        model = Chapter
        fields = [
            'id', 'work', 'title', 'content', 'order', 'act', 'act_name', 'act_order', 'chapter_number',
            'summary', 'word_count', 'created_at', 
            'updated_at', 'last_autosave'
        ]
        read_only_fields = ['work', 'act_name', 'act_order', 'created_at', 'updated_at', 'last_autosave']


class WorkSerializer(serializers.ModelSerializer):
    word_count = serializers.ReadOnlyField()
    chapter_count = serializers.ReadOnlyField()
    author = serializers.ReadOnlyField(source='author.username')
    
    class Meta:
        model = Work
        fields = [
            'id', 'title', 'synopsis', 'author',
            'word_count', 'chapter_count', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class WorkDetailSerializer(WorkSerializer):
    chapters = ChapterSerializer(many=True, read_only=True)
    acts = ActSerializer(many=True, read_only=True)
    
    class Meta(WorkSerializer.Meta):
        fields = WorkSerializer.Meta.fields + ['chapters', 'acts']


class LoreEntrySerializer(serializers.ModelSerializer):
    all_triggers = serializers.ReadOnlyField()

    class Meta:
        model = LoreEntry
        fields = [
            'id', 'work', 'name', 'description',
            'triggers', 'extra_triggers', 'all_triggers',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['work', 'created_at', 'updated_at']


class WritingStyleSerializer(serializers.ModelSerializer):
    class Meta:
        model = WritingStyle
        fields = [
            'id', 'name', 'style_data', 'analysis_result',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']