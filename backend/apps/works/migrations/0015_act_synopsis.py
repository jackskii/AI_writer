from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0014_work_lore_entry_template'),
    ]

    operations = [
        migrations.AddField(
            model_name='act',
            name='synopsis',
            field=models.TextField(blank=True, default='', verbose_name='卷摘要'),
        ),
    ]
