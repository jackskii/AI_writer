from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import models
from django.db.models import Prefetch
from .models import Work, Act, Chapter, Faction, LoreEntry, WritingStyle, GameEvent, GameCharacter, CyoaCharacterVersion
from .serializers import (
    WorkSerializer,
    WorkDetailSerializer,
    ActSerializer,
    ActOverviewSerializer,
    ChapterSerializer,
    ChapterListSerializer,
    FactionSerializer,
    LoreEntrySerializer,
    WritingStyleSerializer,
    GameEventSerializer,
    GameCharacterSerializer,
    CyoaCharacterVersionSerializer,
)


def get_user_api_key(user):
    """获取用户的API密钥和provider"""
    try:
        from apps.user_auth.models import UserSettings
        settings = UserSettings.objects.get(user=user)
        api_key = settings.get_api_key_for_provider()
        provider = settings.api_provider
        default_model = settings.get_default_model()
        if not api_key:
            raise ValueError("API密钥未配置")
        return api_key, provider, default_model
    except UserSettings.DoesNotExist:
        raise ValueError("用户设置不存在，请先配置API密钥")
    except Exception as e:
        raise ValueError(f"获取API密钥失败: {str(e)}")


class WorkViewSet(viewsets.ModelViewSet):
    serializer_class = WorkSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Work.objects.filter(author=self.request.user)
        if self.action == 'retrieve':
            lightweight_chapters = Chapter.objects.select_related('act').only(
                'id', 'work_id', 'title', 'order', 'act_id',
                'chapter_number', 'created_at',
                'updated_at', 'last_autosave', 'act__name', 'act__order'
            ).order_by('act__order', 'chapter_number')
            lightweight_acts = Act.objects.only(
                'id', 'work_id', 'name', 'order',
                'act_type', 'created_at', 'updated_at'
            ).order_by('order')
            queryset = queryset.prefetch_related(
                Prefetch('chapters', queryset=lightweight_chapters),
                Prefetch('acts', queryset=lightweight_acts),
            )
        return queryset

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
        # Sort: normal acts first (by order), then side chapters acts (by order)
        return Act.objects.filter(work=work).order_by(
            models.Case(
                models.When(act_type='normal', then=models.Value(0)),
                models.When(act_type='side_chapters', then=models.Value(1)),
                default=models.Value(0),
                output_field=models.IntegerField(),
            ),
            'order'
        )

    def get_serializer_class(self):
        if self.action == 'list':
            return ActOverviewSerializer
        return ActSerializer

    def perform_create(self, serializer):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        
        act_type = serializer.validated_data.get('act_type', 'normal')
        
        if act_type == 'side_chapters':
            # Side chapters acts should have order >= 9999
            max_side_order = work.acts.filter(act_type='side_chapters').aggregate(
                max_order=models.Max('order')
            )['max_order'] or 9998
            next_order = max(max_side_order + 1, 9999)
            # Auto-generate name if not provided
            if not serializer.validated_data.get('name'):
                serializer.validated_data['name'] = '外传'
        else:
            # Normal acts: find max order of normal acts
            max_normal_order = work.acts.filter(act_type='normal').aggregate(
                max_order=models.Max('order')
            )['max_order'] or 0
            next_order = max_normal_order + 1
            # Auto-generate name if not provided (use order, not chapter_number)
            if not serializer.validated_data.get('name'):
                serializer.validated_data['name'] = f'第{next_order}卷'
        
        serializer.save(work=work, order=next_order)

    def perform_destroy(self, instance):
        """禁止删除外传卷"""
        if instance.act_type == 'side_chapters':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("外传卷不可删除")
        super().perform_destroy(instance)


class ChapterViewSet(viewsets.ModelViewSet):
    serializer_class = ChapterSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # Show all chapters without pagination

    def get_queryset(self):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        queryset = Chapter.objects.filter(work=work)
        if self.action == 'list':
            return queryset.select_related('act').only(
                'id', 'work_id', 'title', 'order', 'act_id',
                'chapter_number', 'cyoa_session', 'created_at', 'updated_at',
                'last_autosave', 'act__name', 'act__order'
            )
        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return ChapterListSerializer
        return ChapterSerializer

    def _renumber_all_chapters(self, work):
        """重新编号整个作品的所有章节，使其连续编号"""
        # Get all chapters ordered by their global order
        chapters = Chapter.objects.filter(work=work).order_by('order')

        # Batch update to minimize database queries
        updates = []
        for index, chapter in enumerate(chapters):
            new_number = index + 1
            if chapter.chapter_number != new_number:
                chapter.chapter_number = new_number
                updates.append(chapter)

        # Bulk update if there are changes
        if updates:
            Chapter.objects.bulk_update(updates, ['chapter_number'])

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
        # Use Chapter.objects directly to avoid any caching from work.chapters
        from django.db.models import Max
        from django.db import transaction

        with transaction.atomic():
            # Lock the work to prevent race conditions when calculating order
            Work.objects.select_for_update().get(pk=work.pk)

            # Query directly from Chapter model to get fresh data
            max_order = Chapter.objects.filter(work=work).aggregate(Max('order'))['order__max'] or 0
            next_order = max_order + 1

            # Temporarily set chapter_number to order (will be renumbered)
            serializer.save(work=work, act=act, order=next_order, chapter_number=next_order)

        # Renumber all chapters to ensure continuous numbering
        self._renumber_all_chapters(work)

    def perform_destroy(self, instance):
        """删除章节后重新编号所有章节"""
        work = instance.work
        super().perform_destroy(instance)
        # 重新编号整个作品的所有章节
        self._renumber_all_chapters(work)

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
            api_key, provider, default_model = get_user_api_key(request.user)
            ai_service = AIService(api_key=api_key, provider_name=provider, default_model=default_model)
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

        from django.db import transaction
        from django.db.models import F

        with transaction.atomic():
            # Lock all chapters in this work to avoid concurrent reorder races
            all_chapters = list(
                Chapter.objects.select_for_update()
                .filter(work=work)
                .select_related('act')
                .order_by('act__order', 'order')
            )

            if not all_chapters:
                return Response({'status': 'success', 'updated': 0})

            # Ensure chapter_ids contains exactly all chapters in target act
            act_chapter_ids = [ch.id for ch in all_chapters if ch.act_id == act.id]
            if set(act_chapter_ids) != set(chapter_ids):
                return Response(
                    {'error': 'chapter_ids must include all chapters in the target act exactly once'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Build stable act ordering, replacing only target act's chapter order
            chapters_by_act = {}
            for ch in all_chapters:
                chapters_by_act.setdefault(ch.act_id, []).append(ch)

            reordered_act_chapters = [next(ch for ch in chapters_by_act[act.id] if ch.id == cid) for cid in chapter_ids]
            chapters_by_act[act.id] = reordered_act_chapters

            # Flatten to final global chapter order: by act.order, then chapter order within each act
            act_sequence = list(Act.objects.filter(work=work).order_by('order').values_list('id', flat=True))
            final_sequence = []
            for act_id in act_sequence:
                final_sequence.extend(chapters_by_act.get(act_id, []))

            # Two-phase update to avoid unique_together(work, order) collisions:
            # first move all orders to a high range, then assign final 1..N.
            Chapter.objects.filter(work=work).update(order=F('order') + 1000000)
            for idx, ch in enumerate(final_sequence, start=1):
                ch.order = idx
            Chapter.objects.bulk_update(final_sequence, ['order'])

            # Renumber all chapter_number to ensure continuity
            self._renumber_all_chapters(work)

        return Response({'status': 'success', 'updated': len(chapter_ids)})



class FactionViewSet(viewsets.ModelViewSet):
    """阵营管理"""
    serializer_class = FactionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # Return all factions without pagination

    def get_queryset(self):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        # Order: 无归属 (top) → normal factions (by order) → 世界观 (bottom)
        return Faction.objects.filter(work=work).order_by(
            models.Case(
                models.When(faction_type='no_faction', then=models.Value(0)),      # First
                models.When(faction_type='worldbuilding', then=models.Value(2)),   # Last
                default=models.Value(1),                                            # Middle (normal)
                output_field=models.IntegerField(),
            ),
            'order'
        )

    def perform_create(self, serializer):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        
        # Get the next order number for normal factions
        max_order = Faction.objects.filter(
            work=work,
            faction_type='normal'
        ).aggregate(models.Max('order'))['order__max'] or 0
        
        serializer.save(
            work=work,
            order=max_order + 1,
            is_default=False,
            faction_type='normal'
        )

    def perform_destroy(self, instance):
        """Only allow deleting non-default factions"""
        if instance.is_default:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Cannot delete default factions")
        
        # Move lore entries from this faction to "no_faction"
        work = instance.work
        no_faction = Faction.objects.filter(
            work=work,
            faction_type='no_faction'
        ).first()
        
        if no_faction:
            for lore_entry in instance.lore_entries.all():
                lore_entry.factions.remove(instance)
                # Only add to no_faction if the entry has no other factions
                if lore_entry.factions.count() == 0:
                    lore_entry.factions.add(no_faction)
        
        super().perform_destroy(instance)

    @action(detail=True, methods=['patch'])
    def toggle_collapse(self, request, work_pk=None, pk=None):
        """Toggle faction collapsed state"""
        faction = self.get_object()
        faction.is_collapsed = not faction.is_collapsed
        faction.save(update_fields=['is_collapsed'])
        return Response({'is_collapsed': faction.is_collapsed})


class LoreEntryViewSet(viewsets.ModelViewSet):
    serializer_class = LoreEntrySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # Return all lore entries without pagination

    def get_queryset(self):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        return LoreEntry.objects.filter(work=work).prefetch_related('factions')

    def perform_create(self, serializer):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        
        # Get faction IDs from the request
        faction_ids = self.request.data.get('factions', [])
        
        # Save the lore entry first
        lore_entry = serializer.save(work=work)
        
        # If no factions specified, add to "no_faction"
        if not faction_ids:
            no_faction = Faction.objects.filter(
                work=work,
                faction_type='no_faction'
            ).first()
            if no_faction:
                lore_entry.factions.add(no_faction)
        else:
            # Validate and add factions
            factions = Faction.objects.filter(
                id__in=faction_ids,
                work=work
            )
            lore_entry.factions.set(factions)
    
    def perform_update(self, serializer):
        """Handle faction updates on lore entry update"""
        instance = serializer.save()
        
        # Handle faction assignment if provided
        if 'factions' in self.request.data:
            faction_ids = self.request.data.get('factions', [])
            work = instance.work
            
            if not faction_ids:
                # If factions is empty, add to "no_faction"
                no_faction = Faction.objects.filter(
                    work=work,
                    faction_type='no_faction'
                ).first()
                if no_faction:
                    instance.factions.set([no_faction])
            else:
                # Validate and set factions
                factions = Faction.objects.filter(
                    id__in=faction_ids,
                    work=work
                )
                instance.factions.set(factions)


class GameEventViewSet(viewsets.ModelViewSet):
    """CYOA 事件 - 仅用于互动小说"""
    serializer_class = GameEventSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        return GameEvent.objects.filter(work=work).order_by('name')

    def perform_create(self, serializer):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        serializer.save(work=work)


class GameCharacterViewSet(viewsets.ModelViewSet):
    """CYOA 角色 - 仅用于互动小说"""
    serializer_class = GameCharacterSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        return GameCharacter.objects.filter(work=work).order_by('order', 'name')

    def perform_create(self, serializer):
        work_id = self.kwargs.get('work_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        max_order = GameCharacter.objects.filter(work=work).aggregate(
            models.Max('order')
        )['order__max'] or 0
        serializer.save(work=work, order=max_order + 1)


class CyoaCharacterVersionViewSet(viewsets.ModelViewSet):
    """CYOA 角色版本 - 仅用于互动小说，嵌套在 game-characters 下"""
    serializer_class = CyoaCharacterVersionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_character(self):
        work_id = self.kwargs.get('work_pk')
        character_pk = self.kwargs.get('character_pk')
        work = get_object_or_404(Work, id=work_id, author=self.request.user)
        return get_object_or_404(GameCharacter, id=character_pk, work=work)

    def get_queryset(self):
        character = self.get_character()
        return CyoaCharacterVersion.objects.filter(character=character).order_by('order', 'display_name')

    def perform_create(self, serializer):
        character = self.get_character()
        max_order = CyoaCharacterVersion.objects.filter(character=character).aggregate(
            models.Max('order')
        )['order__max'] or 0
        serializer.save(character=character, order=max_order + 1)


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
            api_key, provider, default_model = get_user_api_key(request.user)
            ai_service = AIService(api_key=api_key, provider_name=provider, default_model=default_model)
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
            api_key, provider, default_model = get_user_api_key(request.user)
            ai_service = AIService(api_key=api_key, provider_name=provider, default_model=default_model)
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
