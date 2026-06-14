from rest_framework import serializers
from .models import Work, Act, Chapter, Faction, LoreEntry, WritingStyle


class ActSerializer(serializers.ModelSerializer):
    word_count = serializers.ReadOnlyField()
    chapter_count = serializers.ReadOnlyField()
    
    class Meta:
        model = Act
        fields = [
            'id', 'work', 'name', 'order', 'synopsis', 'act_type',
            'word_count', 'chapter_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['work', 'created_at', 'updated_at']


class ActOverviewSerializer(serializers.ModelSerializer):
    word_count = serializers.ReadOnlyField()
    chapter_count = serializers.ReadOnlyField()

    class Meta:
        model = Act
        fields = [
            'id', 'work', 'name', 'order', 'act_type',
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
        read_only_fields = ['work', 'order', 'chapter_number', 'act_name', 'act_order', 'created_at', 'updated_at', 'last_autosave']


class ChapterOverviewSerializer(serializers.ModelSerializer):
    act_name = serializers.CharField(source='act.name', read_only=True)
    act_order = serializers.IntegerField(source='act.order', read_only=True)

    class Meta:
        model = Chapter
        fields = [
            'id', 'work', 'title', 'order', 'act', 'act_name', 'act_order', 'chapter_number',
            'created_at', 'updated_at', 'last_autosave'
        ]
        read_only_fields = [
            'work', 'order', 'chapter_number', 'act_name', 'act_order',
            'created_at', 'updated_at', 'last_autosave'
        ]


class ChapterListSerializer(serializers.ModelSerializer):
    act_name = serializers.CharField(source='act.name', read_only=True)
    act_order = serializers.IntegerField(source='act.order', read_only=True)
    word_count = serializers.ReadOnlyField()

    class Meta:
        model = Chapter
        fields = [
            'id', 'work', 'title', 'order', 'act', 'act_name', 'act_order', 'chapter_number',
            'word_count', 'created_at', 'updated_at', 'last_autosave'
        ]
        read_only_fields = [
            'work', 'order', 'chapter_number', 'act_name', 'act_order',
            'word_count', 'created_at', 'updated_at', 'last_autosave'
        ]


class WorkSerializer(serializers.ModelSerializer):
    word_count = serializers.ReadOnlyField()
    chapter_count = serializers.ReadOnlyField()
    author = serializers.ReadOnlyField(source='author.username')
    
    class Meta:
        model = Work
        fields = [
            'id', 'title', 'synopsis', 'lore_entry_template', 'author',
            'word_count', 'chapter_count', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class WorkDetailSerializer(WorkSerializer):
    # Keep work detail lightweight: chapter full text should be fetched via chapter detail API.
    chapters = ChapterOverviewSerializer(many=True, read_only=True)
    acts = ActOverviewSerializer(many=True, read_only=True)
    
    class Meta(WorkSerializer.Meta):
        fields = WorkSerializer.Meta.fields + ['chapters', 'acts']


class FactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Faction
        fields = [
            'id', 'work', 'name', 'description',
            'is_default', 'faction_type', 'order',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['work', 'is_default', 'faction_type', 'created_at', 'updated_at']


class LoreEntrySerializer(serializers.ModelSerializer):
    all_triggers = serializers.ReadOnlyField()
    factions = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Faction.objects.all(),
        required=False
    )

    class Meta:
        model = LoreEntry
        fields = [
            'id', 'work', 'name', 'description',
            'triggers', 'extra_triggers', 'all_triggers',
            'factions', 'created_at', 'updated_at'
        ]
        read_only_fields = ['work', 'created_at', 'updated_at']
    
    def validate_factions(self, value):
        """Validate that all factions belong to the same work"""
        if not value:
            return value
        
        # Get the work from the view context
        view = self.context.get('view')
        if view and hasattr(view, 'kwargs'):
            work_id = view.kwargs.get('work_pk')
            if work_id:
                for faction in value:
                    if faction.work_id != int(work_id):
                        raise serializers.ValidationError(
                            f"Faction {faction.id} does not belong to this work"
                        )
        return value


class WritingStyleSerializer(serializers.ModelSerializer):
    class Meta:
        model = WritingStyle
        fields = [
            'id', 'name', 'style_data', 'analysis_result', 'is_nsfw',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'is_nsfw']