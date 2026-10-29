from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


GREETING = """回复：
你好，我是这一卷的大纲策划。我们先讨论这一卷，我暂时不修改左边的大纲。这一卷要发生什么？

待写入：
"""


def archive_existing_rounds(apps, schema_editor):
    OutlineChatSession = apps.get_model('chat', 'OutlineChatSession')
    OutlineChatRound = apps.get_model('chat', 'OutlineChatRound')
    OutlineChatMessage = apps.get_model('chat', 'OutlineChatMessage')
    now = django.utils.timezone.now()
    for session in OutlineChatSession.objects.all():
        existing = list(
            OutlineChatMessage.objects.filter(session=session).order_by('created_at')
        )
        if existing:
            closed = OutlineChatRound.objects.create(session=session, closed_at=now)
            OutlineChatMessage.objects.filter(session=session).update(round=closed)
        open_round = OutlineChatRound.objects.create(session=session)
        OutlineChatMessage.objects.create(
            session=session,
            round=open_round,
            role='assistant',
            content=GREETING,
        )


def unarchive_rounds(apps, schema_editor):
    OutlineChatMessage = apps.get_model('chat', 'OutlineChatMessage')
    OutlineChatMessage.objects.update(round=None)


class Migration(migrations.Migration):
    # Data writes and the later NOT NULL alter must commit separately.
    # PostgreSQL rejects ALTER TABLE while deferred FK triggers are still pending.
    atomic = False

    dependencies = [
        ('chat', '0008_outline_chat_keep_pairs'),
    ]

    operations = [
        migrations.CreateModel(
            name='OutlineChatRound',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('closed_at', models.DateTimeField(blank=True, null=True, verbose_name='结束时间')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('session', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='rounds',
                    to='chat.outlinechatsession',
                    verbose_name='所属会话',
                )),
            ],
            options={
                'verbose_name': '大纲策划对话轮',
                'verbose_name_plural': '大纲策划对话轮',
                'ordering': ['created_at'],
            },
        ),
        migrations.AddField(
            model_name='outlinechatmessage',
            name='round',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='messages',
                to='chat.outlinechatround',
                verbose_name='所属轮次',
            ),
        ),
        migrations.RunPython(archive_existing_rounds, unarchive_rounds),
        migrations.AlterField(
            model_name='outlinechatmessage',
            name='round',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='messages',
                to='chat.outlinechatround',
                verbose_name='所属轮次',
            ),
        ),
    ]
