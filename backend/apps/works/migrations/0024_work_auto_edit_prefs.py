from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0023_writingstyle_is_nsfw'),
    ]

    operations = [
        migrations.AddField(
            model_name='work',
            name='auto_edit_reasoning_mode',
            field=models.BooleanField(default=False, verbose_name='自动编辑推理模式'),
        ),
        migrations.AddField(
            model_name='work',
            name='auto_edit_use_nsfw_style',
            field=models.BooleanField(default=False, verbose_name='自动编辑使用NSFW风格'),
        ),
    ]
