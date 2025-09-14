from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import NoteViewSet

router = DefaultRouter()
router.register(r'notes', NoteViewSet, basename='notes')

urlpatterns = [
    path('api/', include(router.urls)),
]