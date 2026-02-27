from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0016_act_act_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='work',
            name='work_type',
            field=models.CharField(
                choices=[('novel', '普通小说'), ('interactive_novel', '互动小说')],
                default='novel',
                max_length=32,
                verbose_name='作品类型',
            ),
        ),
    ]
