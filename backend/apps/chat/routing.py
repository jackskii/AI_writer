from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/chat/(?P<work_id>\d+)/(?P<chapter_id>\d+)/$', consumers.ChatConsumer.as_asgi()),
    re_path(r'ws/notifications/(?P<work_id>\d+)/$', consumers.NotificationConsumer.as_asgi()),
]