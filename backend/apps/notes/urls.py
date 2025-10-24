from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import NoteViewSet, AutoEditViewSet

router = DefaultRouter()
router.register(r'notes', NoteViewSet, basename='notes')
router.register(r'auto-edits', AutoEditViewSet, basename='auto-edits')

urlpatterns = [
    path('api/', include(router.urls)),
]