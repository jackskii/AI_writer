from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0007_outline_chat_api_history_after'),
    ]

    operations = [
        migrations.AddField(
            model_name='outlinechatsession',
            name='keep_pairs',
            field=models.PositiveIntegerField(default=5, verbose_name='保留轮数'),
        ),
    ]
