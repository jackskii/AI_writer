from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0022_remove_faction_is_collapsed'),
    ]

    operations = [
        migrations.AddField(
            model_name='writingstyle',
            name='is_nsfw',
            field=models.BooleanField(default=False, verbose_name='NSFW风格'),
        ),
    ]
