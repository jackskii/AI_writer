from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0025_per_arc_chapter_numbering'),
    ]

    operations = [
        migrations.AddField(
            model_name='act',
            name='outline',
            field=models.TextField(blank=True, default='', verbose_name='卷大纲'),
        ),
        migrations.AddField(
            model_name='act',
            name='outline_autosave',
            field=models.DateTimeField(blank=True, null=True, verbose_name='大纲自动保存时间'),
        ),
    ]
