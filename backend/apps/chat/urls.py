from django.urls import path
from . import views

urlpatterns = [
    path('api/chat/<int:work_id>/<int:chapter_id>/', views.get_chat_history, name='chat-history'),
    path('api/chat/<int:work_id>/<int:chapter_id>/save/', views.save_chat_message, name='save-chat-message'),
    path('api/chat/<int:work_id>/<int:chapter_id>/message/<int:message_id>/', views.delete_chat_message, name='delete-chat-message'),
    path('api/chat/<int:work_id>/<int:chapter_id>/clear/', views.clear_chat_history, name='clear-chat-history'),
    path('api/chat/work/<int:work_id>/', views.get_work_chat_history, name='work-chat-history'),
    path('api/chat/work/<int:work_id>/save/', views.save_work_chat_message, name='work-save-chat-message'),
    path('api/chat/work/<int:work_id>/message/<int:message_id>/', views.delete_work_chat_message, name='delete-work-chat-message'),
    path('api/chat/work/<int:work_id>/clear/', views.clear_work_chat_history, name='work-clear-chat-history'),
    path('api/chat/outline/<int:work_id>/<int:act_id>/', views.get_outline_chat_history, name='outline-chat-history'),
    path('api/chat/outline/<int:work_id>/<int:act_id>/save/', views.save_outline_chat_message, name='outline-save-chat-message'),
    path('api/chat/outline/<int:work_id>/<int:act_id>/keep/', views.keep_outline_chat_rounds, name='outline-keep-chat-rounds'),
    path('api/chat/outline/<int:work_id>/<int:act_id>/message/<int:message_id>/', views.delete_outline_chat_message, name='outline-delete-chat-message'),
    path('api/chat/outline/<int:work_id>/<int:act_id>/clear/', views.clear_outline_chat_history, name='outline-clear-chat-history'),
]
