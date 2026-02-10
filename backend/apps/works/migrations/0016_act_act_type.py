from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0015_act_synopsis'),
    ]

    operations = [
        migrations.AddField(
            model_name='act',
            name='act_type',
            field=models.CharField(
                choices=[('normal', '正常卷'), ('side_chapters', '外传')],
                default='normal',
                max_length=20,
                verbose_name='卷类型'
            ),
        ),
    ]
