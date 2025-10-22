from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import Work, Act, Chapter, LoreEntry
from .serializers import WorkSerializer, WorkDetailSerializer, ActSerializer, ChapterSerializer, LoreEntrySerializer


class WorkViewSet(viewsets.ModelViewSet):
    serializer_class = WorkSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Work.objects.filter(author=self.request.user)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return WorkDetailSerializer
        return WorkSerializer

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


class ActViewSet(viewsets.ModelViewSet):
    serializer_class = ActSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        return Act.objects.filter(work=work).order_by('order')

    def perform_create(self, serializer):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        
        # Auto-set order to the next available number
        next_order = work.acts.count() + 1
        
        serializer.save(work=work, order=next_order)


class ChapterViewSet(viewsets.ModelViewSet):
    serializer_class = ChapterSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        return Chapter.objects.filter(work=work)

    def _renumber_chapters_in_act(self, act):
        """重新编号指定act中的所有章节"""
        chapters = act.chapters.all().order_by('chapter_number')
        for index, chapter in enumerate(chapters):
            if chapter.chapter_number != index + 1:
                chapter.chapter_number = index + 1
                chapter.save(update_fields=['chapter_number'])

    def perform_create(self, serializer):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)

        # Get the act from the serializer data - it should be an Act instance now
        act = serializer.validated_data.get('act')
        if not act:
            # If no act specified, get or create the first act
            act, created = Act.objects.get_or_create(
                work=work, order=1,
                defaults={'name': '第1卷'}
            )
        else:
            # Validate that the act belongs to this work
            if act.work != work:
                from rest_framework.exceptions import ValidationError
                raise ValidationError(f"Act {act.id} does not belong to work {work.id}")

        # Auto-set order to the next available number globally (across all acts)
        next_order = work.chapters.count() + 1

        # Calculate chapter_number within the act
        chapter_number = act.chapters.count() + 1

        serializer.save(work=work, act=act, order=next_order, chapter_number=chapter_number)

    def perform_destroy(self, instance):
        """删除章节后重新编号该act中的其他章节"""
        act = instance.act
        super().perform_destroy(instance)
        # 重新编号该act中的所有章节
        self._renumber_chapters_in_act(act)

    @action(detail=True, methods=['patch'])
    def autosave(self, request, work_pk=None, pk=None):
        """自动保存章节内容"""
        chapter = self.get_object()
        content = request.data.get('content', '')
        
        # 更新内容和自动保存时间
        chapter.content = content
        chapter.last_autosave = timezone.now()
        chapter.save(update_fields=['content', 'last_autosave', 'updated_at'])
        
        # TODO: 检查是否需要触发AI建议
        # from apps.ai_services.tasks import check_suggestion_trigger
        # check_suggestion_trigger.delay(chapter.id)
        
        return Response({'status': 'saved', 'timestamp': chapter.last_autosave})

    @action(detail=True, methods=['post'])
    def summary(self, request, work_pk=None, pk=None):
        """生成章节摘要"""
        chapter = self.get_object()

        try:
            from apps.ai_services.services import AIService, run_async_ai_task
            ai_service = AIService()
            summary = run_async_ai_task(
                ai_service.generate_summary(chapter)
            )

            # 保存摘要到章节
            chapter.summary = summary
            chapter.save(update_fields=['summary'])

            return Response({'summary': summary})
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def reorder(self, request, work_pk=None):
        """重新排序章节并自动更新章节号"""
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)

        # 期望请求格式: { "act_id": 123, "chapter_ids": [1, 2, 3, ...] }
        act_id = request.data.get('act_id')
        chapter_ids = request.data.get('chapter_ids', [])

        if not act_id or not chapter_ids:
            return Response(
                {'error': 'act_id and chapter_ids are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        act = get_object_or_404(Act, id=act_id, work=work)

        # 验证所有章节都属于这个act和work
        chapters = Chapter.objects.filter(id__in=chapter_ids, work=work, act=act)
        if len(chapters) != len(chapter_ids):
            return Response(
                {'error': 'Some chapters not found or do not belong to this act'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 更新章节号（在该act内的顺序）
        for index, chapter_id in enumerate(chapter_ids):
            chapter = chapters.get(id=chapter_id)
            chapter.chapter_number = index + 1
            chapter.save(update_fields=['chapter_number'])

        return Response({'status': 'success', 'updated': len(chapter_ids)})



class LoreEntryViewSet(viewsets.ModelViewSet):
    serializer_class = LoreEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        return LoreEntry.objects.filter(work=work)

    def perform_create(self, serializer):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        serializer.save(work=work)
