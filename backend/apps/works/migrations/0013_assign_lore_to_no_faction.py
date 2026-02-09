from django.db import migrations


def assign_lore_to_no_faction(apps, schema_editor):
    """Assign existing lore entries without factions to 'no_faction'"""
    LoreEntry = apps.get_model('works', 'LoreEntry')
    Faction = apps.get_model('works', 'Faction')
    
    for lore_entry in LoreEntry.objects.all():
        # If lore entry has no factions, assign to no_faction
        if lore_entry.factions.count() == 0:
            no_faction = Faction.objects.filter(
                work=lore_entry.work,
                faction_type='no_faction'
            ).first()
            if no_faction:
                lore_entry.factions.add(no_faction)


def reverse_assignment(apps, schema_editor):
    """Clear all faction assignments (reverse migration)"""
    LoreEntry = apps.get_model('works', 'LoreEntry')
    for lore_entry in LoreEntry.objects.all():
        lore_entry.factions.clear()


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0012_create_default_factions'),
    ]

    operations = [
        migrations.RunPython(assign_lore_to_no_faction, reverse_assignment),
    ]
