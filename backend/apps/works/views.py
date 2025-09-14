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
    permission_classes = [AllowAny]

    def get_queryset(self):
        return Work.objects.all()  # For demo purposes, return all works

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return WorkDetailSerializer
        return WorkSerializer

    def perform_create(self, serializer):
        # For demo purposes, create a dummy user if none exists
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user, created = User.objects.get_or_create(username='demo_user')
        serializer.save(author=user)


class ActViewSet(viewsets.ModelViewSet):
    serializer_class = ActSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id)
        return Act.objects.filter(work=work).order_by('order')

    def perform_create(self, serializer):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id)
        
        # Auto-set order to the next available number
        next_order = work.acts.count() + 1
        
        serializer.save(work=work, order=next_order)


class ChapterViewSet(viewsets.ModelViewSet):
    serializer_class = ChapterSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id)
        return Chapter.objects.filter(work=work)

    def perform_create(self, serializer):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id)
        
        # Get the act from the serializer data - it should be an Act instance now
        act = serializer.validated_data.get('act')
        if not act:
            # If no act specified, get or create the first act
            act, created = Act.objects.get_or_create(
                work=work, order=1,
                defaults={'name': '第1卷'}
            )
        
        # Auto-set order to the next available number globally (across all acts)
        next_order = work.chapters.count() + 1
        
        # Calculate chapter_number within the act
        chapter_number = act.chapters.count() + 1
        
        serializer.save(work=work, act=act, order=next_order, chapter_number=chapter_number)

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



class LoreEntryViewSet(viewsets.ModelViewSet):
    serializer_class = LoreEntrySerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id)
        return LoreEntry.objects.filter(work=work)

    def perform_create(self, serializer):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id)
        serializer.save(work=work)
