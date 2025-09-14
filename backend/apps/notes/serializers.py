from rest_framework import serializers
from .models import Note


class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = [
            'id', 'work', 'chapter', 'content', 'color',
            'text_start_position', 'text_end_position', 'linked_text',
            'is_ai_generated', 'note_type', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']