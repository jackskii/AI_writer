from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('user_auth', '0008_remove_cyoa_prefill_scope'),
    ]

    operations = [
        migrations.AddField(
            model_name='usersettings',
            name='reasoning_effort',
            field=models.CharField(blank=True, default='medium', max_length=50, verbose_name='Reasoning Effort'),
        ),
    ]
