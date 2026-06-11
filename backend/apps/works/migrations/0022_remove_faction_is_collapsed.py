from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0021_remove_cyoa'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='faction',
            name='is_collapsed',
        ),
    ]
