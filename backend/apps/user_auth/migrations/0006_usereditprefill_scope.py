from django.db import migrations, models


def add_default_scope_to_existing_prefills(apps, schema_editor):
    """Set scope='auto_edit' for all existing prefills"""
    UserEditPrefill = apps.get_model('user_auth', 'UserEditPrefill')
    UserEditPrefill.objects.all().update(scope='auto_edit')


def reverse_add_scope(apps, schema_editor):
    """Reverse migration - nothing to do as we're not removing data"""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('user_auth', '0005_usersettings_openrouter'),
    ]

    operations = [
        migrations.AddField(
            model_name='usereditprefill',
            name='scope',
            field=models.CharField(
                choices=[('auto_edit', '自动编辑'), ('cyoa', 'CYOA')],
                default='auto_edit',
                max_length=20,
                verbose_name='预设类型',
            ),
        ),
        migrations.RunPython(add_default_scope_to_existing_prefills, reverse_add_scope),
        migrations.AlterUniqueTogether(
            name='usereditprefill',
            unique_together={('user', 'scope', 'name')},
        ),
    ]
