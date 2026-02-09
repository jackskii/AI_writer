from django.urls import path
from . import views

urlpatterns = [
    # Streaming endpoints (primary)
    path('api/ai/chat/stream/', views.ai_chat_stream, name='ai-chat-stream'),
    path('api/ai/work/chat/stream/', views.ai_work_chat_stream, name='ai-work-chat-stream'),
    path('api/ai/summarize/stream/', views.ai_summarize_stream, name='ai-summarize-stream'),
    path('api/ai/auto-edit/stream/', views.ai_auto_edit_stream, name='ai-auto-edit-stream'),
    path('api/ai/auto-describe-entry/', views.ai_auto_describe_entry, name='ai-auto-describe-entry'),
    path('api/ai/auto-describe-entry/chapters/', views.ai_auto_describe_entry_chapters, name='ai-auto-describe-entry-chapters'),

    # Non-streaming endpoints
    path('api/ai/suggest/', views.ai_suggest, name='ai-suggest'),
    path('api/ai/prefills/', views.ai_prefills, name='ai-prefills'),
]
