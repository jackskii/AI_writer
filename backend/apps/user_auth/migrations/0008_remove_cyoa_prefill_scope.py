from django.db import migrations, models


def delete_cyoa_prefills(apps, schema_editor):
    UserEditPrefill = apps.get_model('user_auth', 'UserEditPrefill')
    UserEditPrefill.objects.filter(scope='cyoa').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('user_auth', '0007_alter_usersettings_api_provider'),
    ]

    operations = [
        migrations.RunPython(delete_cyoa_prefills, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='usereditprefill',
            name='scope',
            field=models.CharField(
                choices=[('auto_edit', '自动编辑')],
                default='auto_edit',
                max_length=20,
                verbose_name='预设类型',
            ),
        ),
    ]
