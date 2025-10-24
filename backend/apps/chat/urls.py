from django.urls import path
from . import views

urlpatterns = [
    path('api/chat/<int:work_id>/<int:chapter_id>/', views.get_chat_history, name='chat-history'),
    path('api/chat/<int:work_id>/<int:chapter_id>/save/', views.save_chat_message, name='save-chat-message'),
    path('api/chat/<int:work_id>/<int:chapter_id>/clear/', views.clear_chat_history, name='clear-chat-history'),
    path('api/chat/work/<int:work_id>/', views.get_work_chat_history, name='work-chat-history'),
    path('api/chat/work/<int:work_id>/save/', views.save_work_chat_message, name='work-save-chat-message'),
    path('api/chat/work/<int:work_id>/clear/', views.clear_work_chat_history, name='work-clear-chat-history'),
]
