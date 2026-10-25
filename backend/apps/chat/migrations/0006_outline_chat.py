import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0026_act_outline'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('chat', '0005_delete_airequest'),
    ]

    operations = [
        migrations.CreateModel(
            name='OutlineChatSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('session_id', models.CharField(max_length=100, unique=True, verbose_name='会话ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('act', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='outline_chat_sessions', to='works.act', verbose_name='所属卷')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='outline_chat_sessions', to=settings.AUTH_USER_MODEL, verbose_name='用户')),
                ('work', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='outline_chat_sessions', to='works.work', verbose_name='所属作品')),
            ],
            options={
                'verbose_name': '大纲策划聊天会话',
                'verbose_name_plural': '大纲策划聊天会话',
                'ordering': ['-updated_at'],
                'unique_together': {('work', 'act', 'user')},
            },
        ),
        migrations.CreateModel(
            name='OutlineChatMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('user', '用户'), ('assistant', 'AI助手'), ('system', '系统')], max_length=20, verbose_name='角色')),
                ('content', models.TextField(verbose_name='消息内容')),
                ('metadata', models.JSONField(blank=True, default=dict, verbose_name='元数据')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='chat.outlinechatsession', verbose_name='所属会话')),
            ],
            options={
                'verbose_name': '大纲策划聊天消息',
                'verbose_name_plural': '大纲策划聊天消息',
                'ordering': ['created_at'],
            },
        ),
    ]
