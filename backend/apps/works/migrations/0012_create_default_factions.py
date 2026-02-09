from django.db import migrations
import random


def generate_large_id():
    """Generate a random 7-digit ID"""
    return random.randint(1000000, 9999999)


def create_default_factions(apps, schema_editor):
    """Create default factions for all existing works"""
    Work = apps.get_model('works', 'Work')
    Faction = apps.get_model('works', 'Faction')
    
    for work in Work.objects.all():
        # Check if work already has default factions
        has_no_faction = Faction.objects.filter(work=work, faction_type='no_faction').exists()
        has_worldbuilding = Faction.objects.filter(work=work, faction_type='worldbuilding').exists()
        
        if not has_no_faction:
            Faction.objects.create(
                id=generate_large_id(),
                work=work,
                name='无归属',
                description='未分配到任何阵营的角色',
                is_default=True,
                faction_type='no_faction',
                order=0
            )
        
        if not has_worldbuilding:
            Faction.objects.create(
                id=generate_large_id(),
                work=work,
                name='世界观',
                description='地点、历史、规则等世界观设定',
                is_default=True,
                faction_type='worldbuilding',
                order=9999
            )


def reverse_default_factions(apps, schema_editor):
    """Remove default factions (reverse migration)"""
    Faction = apps.get_model('works', 'Faction')
    Faction.objects.filter(is_default=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0011_add_faction_model'),
    ]

    operations = [
        migrations.RunPython(create_default_factions, reverse_default_factions),
    ]
