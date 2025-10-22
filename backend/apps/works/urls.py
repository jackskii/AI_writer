from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import WorkViewSet, ActViewSet, ChapterViewSet, LoreEntryViewSet

# 主路由器
router = DefaultRouter()
router.register(r'works', WorkViewSet, basename='works')
router.register(r'works/(?P<work_pk>\d+)/acts', ActViewSet, basename='work-acts')

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
]