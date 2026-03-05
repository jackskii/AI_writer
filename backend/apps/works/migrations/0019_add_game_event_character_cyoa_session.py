from django.db import migrations, models
import django.db.models.deletion
import apps.works.models


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0018_remove_chapter_act_name_alter_chapter_act_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='GameEvent',
            fields=[
                ('id', models.BigIntegerField(default=apps.works.models.generate_large_id, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200, verbose_name='事件名称')),
                ('setting_description', models.TextField(blank=True, help_text='给 LLM 的场景/背景描述', verbose_name='场景描述')),
                ('goal', models.TextField(blank=True, help_text='事件要达成的目标或主题', verbose_name='事件目标')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('work', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='game_events', to='works.work', verbose_name='所属作品')),
            ],
            options={
                'verbose_name': 'CYOA 事件',
                'verbose_name_plural': 'CYOA 事件',
                'ordering': ['work', 'name'],
            },
        ),
        migrations.CreateModel(
            name='GameCharacter',
            fields=[
                ('id', models.BigIntegerField(default=apps.works.models.generate_large_id, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200, verbose_name='角色名称')),
                ('age', models.CharField(blank=True, max_length=100, verbose_name='年龄')),
                ('appearance', models.TextField(blank=True, verbose_name='外貌描述')),
                ('backstory', models.TextField(blank=True, verbose_name='背景/经历')),
                ('state_definitions', models.JSONField(default=list, help_text='列表，每项含 name 与 stages（每阶段含 label）', verbose_name='状态定义')),
                ('order', models.PositiveIntegerField(default=0, verbose_name='排序')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('work', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='game_characters', to='works.work', verbose_name='所属作品')),
            ],
            options={
                'verbose_name': 'CYOA 角色',
                'verbose_name_plural': 'CYOA 角色',
                'ordering': ['work', 'order', 'name'],
            },
        ),
        migrations.AddField(
            model_name='chapter',
            name='cyoa_session',
            field=models.JSONField(blank=True, null=True, verbose_name='CYOA 会话配置'),
        ),
    ]
