from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0020_add_characteristics_and_cyoa_character_version'),
    ]

    operations = [
        migrations.DeleteModel(
            name='CyoaCharacterVersion',
        ),
        migrations.DeleteModel(
            name='GameCharacter',
        ),
        migrations.DeleteModel(
            name='GameEvent',
        ),
        migrations.RemoveField(
            model_name='chapter',
            name='cyoa_session',
        ),
        migrations.RemoveField(
            model_name='work',
            name='work_type',
        ),
    ]
