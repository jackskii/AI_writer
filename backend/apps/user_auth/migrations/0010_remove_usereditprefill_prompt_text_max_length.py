from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('user_auth', '0009_usersettings_reasoning_effort'),
    ]

    operations = [
        migrations.AlterField(
            model_name='usereditprefill',
            name='prompt_text',
            field=models.TextField(verbose_name='提示文本'),
        ),
    ]
