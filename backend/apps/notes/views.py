from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from apps.works.models import Work, Chapter
from .models import Note
from .serializers import NoteSerializer


class NoteViewSet(viewsets.ModelViewSet):
    serializer_class = NoteSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        queryset = Note.objects.all()
        
        # 按作品筛选 (demo模式，跳过权限验证)
        work_id = self.request.query_params.get('work')
        if work_id:
            work = get_object_or_404(Work, id=work_id)
            queryset = queryset.filter(work=work)
        
        # 按章节筛选 (demo模式，跳过权限验证)
        chapter_id = self.request.query_params.get('chapter')
        if chapter_id:
            chapter = get_object_or_404(Chapter, id=chapter_id)
            queryset = queryset.filter(chapter=chapter)
        
        return queryset.order_by('-created_at')

    def perform_create(self, serializer):
        # 如果指定了章节，自动设置作品 (demo模式，跳过权限验证)
        chapter_id = serializer.validated_data.get('chapter')
        if chapter_id:
            chapter = get_object_or_404(Chapter, id=chapter_id.id)
            serializer.save(work=chapter.work)
        else:
            serializer.save()

    def perform_update(self, serializer):
        # Demo模式，跳过权限验证
        serializer.save()

    def perform_destroy(self, instance):
        # Demo模式，跳过权限验证
        instance.delete()
