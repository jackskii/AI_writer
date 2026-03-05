from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    WorkViewSet,
    ActViewSet,
    ChapterViewSet,
    FactionViewSet,
    LoreEntryViewSet,
    WritingStyleViewSet,
    GameEventViewSet,
    GameCharacterViewSet,
    CyoaCharacterVersionViewSet,
)

# 主路由器
router = DefaultRouter()
router.register(r'works', WorkViewSet, basename='works')
router.register(r'works/(?P<work_pk>\d+)/acts', ActViewSet, basename='work-acts')
router.register(r'styles', WritingStyleViewSet, basename='styles')  # User-global styles

# 简单的章节和世界观路由 (TODO: 后续改为嵌套路由)
urlpatterns = [
    path('api/', include(router.urls)),
    path('api/works/<int:work_pk>/chapters/', ChapterViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='work-chapters-list'),
    # Reorder must come before detail URLs to avoid matching 'reorder' as a pk
    path('api/works/<int:work_pk>/chapters/reorder/',
         ChapterViewSet.as_view({'post': 'reorder'}), name='chapter-reorder'),
    path('api/works/<int:work_pk>/chapters/<int:pk>/', ChapterViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='work-chapters-detail'),
    path('api/works/<int:work_pk>/chapters/<int:pk>/autosave/',
         ChapterViewSet.as_view({'patch': 'autosave'}), name='chapter-autosave'),
    path('api/works/<int:work_pk>/chapters/<int:pk>/summary/',
         ChapterViewSet.as_view({'post': 'summary'}), name='chapter-summary'),
    
    # Faction routes
    path('api/works/<int:work_pk>/factions/', FactionViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='work-factions-list'),
    path('api/works/<int:work_pk>/factions/<int:pk>/', FactionViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='work-factions-detail'),
    path('api/works/<int:work_pk>/factions/<int:pk>/toggle_collapse/',
         FactionViewSet.as_view({'patch': 'toggle_collapse'}), name='work-factions-toggle-collapse'),
    
    # Lore routes
    path('api/works/<int:work_pk>/lore/', LoreEntryViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='work-lore-list'),
    path('api/works/<int:work_pk>/lore/<int:pk>/', LoreEntryViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='work-lore-detail'),
    # CYOA: game events and characters (for interactive_novel)
    path('api/works/<int:work_pk>/game-events/', GameEventViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='work-game-events-list'),
    path('api/works/<int:work_pk>/game-events/<int:pk>/', GameEventViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='work-game-events-detail'),
    path('api/works/<int:work_pk>/game-characters/', GameCharacterViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='work-game-characters-list'),
    path('api/works/<int:work_pk>/game-characters/<int:pk>/', GameCharacterViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='work-game-characters-detail'),
    # CYOA character versions (nested under character)
    path('api/works/<int:work_pk>/game-characters/<int:character_pk>/versions/', CyoaCharacterVersionViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='work-game-character-versions-list'),
    path('api/works/<int:work_pk>/game-characters/<int:character_pk>/versions/<int:pk>/', CyoaCharacterVersionViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='work-game-character-versions-detail'),
]