from rest_framework import serializers
from .models import Note, AutoEdit, AutoEditVersion


class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = [
            'id', 'work', 'chapter', 'content', 'color',
            'text_start_position', 'text_end_position', 'linked_text',
            'is_ai_generated', 'note_type', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class AutoEditVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutoEditVersion
        fields = ['id', 'version_number', 'edited_text', 'created_at']
        read_only_fields = ['created_at']


class AutoEditSerializer(serializers.ModelSerializer):
    versions = AutoEditVersionSerializer(many=True, read_only=True)
    current_text = serializers.ReadOnlyField()

    class Meta:
        model = AutoEdit
        fields = [
            'id', 'work', 'chapter', 'text_start_position', 'text_end_position',
            'original_text', 'active_version_index', 'versions', 'current_text',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'current_text']