from django.urls import path
from . import views

urlpatterns = [
    path('api/ai/chat/', views.ai_chat, name='ai-chat'),
    path('api/ai/continue/', views.ai_continue, name='ai-continue'),
    path('api/ai/continue/stream/', views.ai_continue_stream, name='ai-continue-stream'),
    path('api/ai/suggest/', views.ai_suggest, name='ai-suggest'),
    path('api/ai/summarize/', views.ai_summarize, name='ai-summarize'),
    path('api/ai/summarize/stream/', views.ai_summarize_stream, name='ai-summarize-stream'),
]