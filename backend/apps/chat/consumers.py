import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from apps.works.models import Work, Chapter
from apps.ai_services.services import AIService

User = get_user_model()

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.work_id = self.scope['url_route']['kwargs']['work_id']
        self.chapter_id = self.scope['url_route']['kwargs']['chapter_id']
        self.room_group_name = f'chat_{self.work_id}_{self.chapter_id}'

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        try:
            text_data_json = json.loads(text_data)
            message = text_data_json.get('message', '')
            message_type = text_data_json.get('type', 'chat')

            if message_type == 'chat' and message:
                # Get AI response
                ai_response = await self.get_ai_response(message)
                
                # Send message back to WebSocket
                await self.send(text_data=json.dumps({
                    'type': 'chat_message',
                    'user_message': message,
                    'ai_response': ai_response,
                    'timestamp': self.get_timestamp()
                }))

            elif message_type == 'typing':
                # Broadcast typing indicator to group
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'typing_indicator',
                        'is_typing': text_data_json.get('is_typing', False)
                    }
                )

        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON format'
            }))
        except Exception as e:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': str(e)
            }))

    async def typing_indicator(self, event):
        # Send typing indicator to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'typing',
            'is_typing': event['is_typing']
        }))

    @database_sync_to_async
    def get_ai_response(self, message):
        try:
            # Get work and chapter
            work = Work.objects.get(id=self.work_id)
            chapter = Chapter.objects.get(id=self.chapter_id, work=work)
            
            # Create AI service and get response
            ai_service = AIService()
            response = ai_service.chat(work, chapter, message)
            
            return response.get('content', '抱歉，AI暂时无法响应。')
        except Exception as e:
            return f'抱歉，出现错误：{str(e)}'

    def get_timestamp(self):
        from datetime import datetime
        return datetime.now().isoformat()


class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.work_id = self.scope['url_route']['kwargs']['work_id']
        self.room_group_name = f'notifications_{self.work_id}'

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        pass  # This consumer only sends notifications

    async def send_notification(self, event):
        # Send notification to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'notification',
            'message': event['message'],
            'notification_type': event.get('notification_type', 'info'),
            'timestamp': self.get_timestamp()
        }))

    def get_timestamp(self):
        from datetime import datetime
        return datetime.now().isoformat()