from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import Work, Act, Chapter, LoreEntry, WritingStyle
from .serializers import WorkSerializer, WorkDetailSerializer, ActSerializer, ChapterSerializer, LoreEntrySerializer, WritingStyleSerializer


def get_user_api_key(user):
    """获取用户的API密钥"""
    try:
        from apps.user_auth.models import UserSettings
        settings = UserSettings.objects.get(user=user)
        api_key = settings.deepseek_api_key
        if not api_key:
            raise ValueError("API密钥未配置")
        return api_key
    except UserSettings.DoesNotExist:
        raise ValueError("用户设置不存在，请先配置API密钥")
    except Exception as e:
        raise ValueError(f"获取API密钥失败: {str(e)}")


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
            api_key = get_user_api_key(request.user)
            ai_service = AIService(api_key=api_key)
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


class WritingStyleViewSet(viewsets.ModelViewSet):
    """用户全局写作风格管理"""
    serializer_class = WritingStyleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Return only styles belonging to the current user
        return WritingStyle.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        # Automatically set the user to the current user
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'])
    def analyze(self, request):
        """分析文本样本并生成写作风格"""
        from apps.ai_services.services import AIService, run_async_ai_task

        text_sample = request.data.get('text')
        name = request.data.get('name', '未命名风格')

        if not text_sample:
            return Response(
                {'error': '需要提供文本样本'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate text length (1000-100000 words/characters)
        text_length = len(text_sample)
        if text_length < 1000:
            return Response(
                {'error': f'文本太短（{text_length}字），至少需要1000字'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if text_length > 100000:
            return Response(
                {'error': f'文本太长（{text_length}字），最多100000字'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            api_key = get_user_api_key(request.user)
            ai_service = AIService(api_key=api_key)
            analysis_result = run_async_ai_task(
                ai_service.analyze_writing_style(text_sample)
            )

            # Format the analysis result into readable text
            formatted_text = self._format_analysis_result(analysis_result)

            return Response({
                'analysis_result': analysis_result,
                'formatted_text': formatted_text,
                'name': name
            })

        except Exception as e:
            return Response(
                {'error': f'分析失败：{str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def analyze_nsfw(self, request):
        """分析NSFW文本样本并生成写作风格"""
        from apps.ai_services.services import AIService, run_async_ai_task

        text_sample = request.data.get('text')
        name = request.data.get('name', '未命名NSFW风格')

        if not text_sample:
            return Response(
                {'error': '需要提供文本样本'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate text length (1000-100000 words/characters)
        text_length = len(text_sample)
        if text_length < 1000:
            return Response(
                {'error': f'文本太短（{text_length}字），至少需要1000字'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if text_length > 100000:
            return Response(
                {'error': f'文本太长（{text_length}字），最多100000字'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            api_key = get_user_api_key(request.user)
            ai_service = AIService(api_key=api_key)
            analysis_result = run_async_ai_task(
                ai_service.analyze_nsfw_writing_style(text_sample)
            )

            # Format the analysis result into readable text
            formatted_text = self._format_analysis_result(analysis_result)

            return Response({
                'analysis_result': analysis_result,
                'formatted_text': formatted_text,
                'name': name
            })

        except Exception as e:
            return Response(
                {'error': f'NSFW分析失败：{str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _format_analysis_result(self, analysis_result):
        """将结构化分析结果格式化为可读文本"""
        if not analysis_result or 'perspectives' not in analysis_result:
            return ''

        formatted_parts = []

        # Add overall description at the top if present
        if 'overall' in analysis_result and analysis_result['overall']:
            overall = f"【风格总览】\n{analysis_result['overall']}"
            formatted_parts.append(overall)

        # Format each perspective
        for perspective in analysis_result['perspectives']:
            name = perspective.get('name', '')
            description = perspective.get('description', '')
            examples = perspective.get('examples', [])

            # Format with 【】brackets around name, description as paragraph
            part = f"【{name}】\n{description}"

            # Add examples on separate lines if present
            if examples:
                part += "\n示例：\n"
                for example in examples:
                    part += f"{example}\n"

            formatted_parts.append(part)

        # Join with double newline to create spacing between sections
        return '\n\n'.join(formatted_parts)
