from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.db import models
from apps.works.models import Work, Chapter
from .models import Note, AutoEdit, AutoEditVersion
from .serializers import NoteSerializer, AutoEditSerializer


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


class AutoEditViewSet(viewsets.ModelViewSet):
    serializer_class = AutoEditSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        queryset = AutoEdit.objects.all()

        # 按章节筛选
        chapter_id = self.request.query_params.get('chapter')
        if chapter_id:
            chapter = get_object_or_404(Chapter, id=chapter_id)
            queryset = queryset.filter(chapter=chapter)

        return queryset.order_by('-created_at')

    def perform_create(self, serializer):
        # 保存AutoEdit及其版本
        auto_edit = serializer.save()

        # 如果请求中包含版本数据，创建版本记录
        versions_data = self.request.data.get('versions', [])
        for version_data in versions_data:
            AutoEditVersion.objects.create(
                auto_edit=auto_edit,
                version_number=version_data['version_number'],
                edited_text=version_data['edited_text']
            )

    @action(detail=True, methods=['post'])
    def add_version(self, request, pk=None):
        """添加新的编辑版本"""
        auto_edit = self.get_object()

        # 获取最大版本号
        max_version = auto_edit.versions.aggregate(
            max_ver=models.Max('version_number')
        )['max_ver'] or 0

        # 创建新版本
        new_version = AutoEditVersion.objects.create(
            auto_edit=auto_edit,
            version_number=max_version + 1,
            edited_text=request.data.get('edited_text')
        )

        # 自动切换到新版本
        auto_edit.active_version_index = new_version.version_number
        auto_edit.save()

        serializer = self.get_serializer(auto_edit)
        return Response(serializer.data)

    @action(detail=True, methods=['patch'])
    def switch_version(self, request, pk=None):
        """切换版本"""
        auto_edit = self.get_object()
        version_index = request.data.get('version_index')

        auto_edit.active_version_index = version_index
        auto_edit.save()

        serializer = self.get_serializer(auto_edit)
        return Response(serializer.data)
