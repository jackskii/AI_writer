from django.db import migrations, models
import django.db.models.deletion
import apps.works.models


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0019_add_game_event_character_cyoa_session'),
    ]

    operations = [
        migrations.AddField(
            model_name='gamecharacter',
            name='characteristics',
            field=models.TextField(blank=True, verbose_name='角色设定（综合描述）'),
        ),
        migrations.CreateModel(
            name='CyoaCharacterVersion',
            fields=[
                ('id', models.BigIntegerField(default=apps.works.models.generate_large_id, primary_key=True, serialize=False)),
                ('display_name', models.CharField(help_text='如：Tia 1、第1章后', max_length=200, verbose_name='版本名称')),
                ('characteristics', models.TextField(blank=True, verbose_name='角色设定')),
                ('state_definitions', models.JSONField(default=list, verbose_name='状态定义')),
                ('order', models.PositiveIntegerField(default=0, verbose_name='排序')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('character', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='versions', to='works.gamecharacter', verbose_name='所属角色')),
                ('source_chapter', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='works.chapter', verbose_name='来源章节')),
            ],
            options={
                'verbose_name': 'CYOA 角色版本',
                'verbose_name_plural': 'CYOA 角色版本',
                'ordering': ['character', 'order', 'display_name'],
            },
        ),
    ]
