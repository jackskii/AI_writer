from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0013_assign_lore_to_no_faction'),
    ]

    operations = [
        migrations.AddField(
            model_name='work',
            name='lore_entry_template',
            field=models.TextField(blank=True, help_text='自定义AI生成条目描述的模板，为空则使用默认模板', null=True, verbose_name='条目生成模板'),
        ),
    ]
