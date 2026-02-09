from django.db import migrations, models
import django.db.models.deletion
import apps.works.models


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0010_continuous_chapter_numbering'),
    ]

    operations = [
        # Create Faction model
        migrations.CreateModel(
            name='Faction',
            fields=[
                ('id', models.BigIntegerField(default=apps.works.models.generate_large_id, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200, verbose_name='阵营名称')),
                ('description', models.TextField(blank=True, verbose_name='阵营描述')),
                ('is_default', models.BooleanField(default=False, verbose_name='是否默认')),
                ('faction_type', models.CharField(choices=[('normal', '普通阵营'), ('no_faction', '无归属'), ('worldbuilding', '世界观')], default='normal', max_length=20, verbose_name='阵营类型')),
                ('order', models.PositiveIntegerField(default=0, verbose_name='排序')),
                ('is_collapsed', models.BooleanField(default=False, verbose_name='是否折叠')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('work', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='factions', to='works.work', verbose_name='所属作品')),
            ],
            options={
                'verbose_name': '阵营',
                'verbose_name_plural': '阵营',
                'ordering': ['work', 'order'],
            },
        ),
        # Add factions ManyToMany field to LoreEntry
        migrations.AddField(
            model_name='loreentry',
            name='factions',
            field=models.ManyToManyField(blank=True, related_name='lore_entries', to='works.faction', verbose_name='所属阵营'),
        ),
    ]
