from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0006_outline_chat'),
    ]

    operations = [
        migrations.AddField(
            model_name='outlinechatsession',
            name='api_history_after',
            field=models.DateTimeField(blank=True, null=True, verbose_name='接口历史截止时间'),
        ),
    ]
