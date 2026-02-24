from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('user_auth', '0004_usereditprefill'),
    ]

    operations = [
        migrations.AddField(
            model_name='usersettings',
            name='_encrypted_openrouter_api_key',
            field=models.TextField(blank=True, default='', verbose_name='OpenRouter API Key (加密)'),
        ),
        migrations.AddField(
            model_name='usersettings',
            name='openrouter_model',
            field=models.CharField(default='x-ai/grok-4-fast', max_length=100, verbose_name='OpenRouter Model'),
        ),
    ]
