from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Work, Faction


@receiver(post_save, sender=Work)
def create_default_factions(sender, instance, created, **kwargs):
    """Create default factions when a new Work is created"""
    if created:
        # Create "无归属" faction (for unassigned characters)
        Faction.objects.create(
            work=instance,
            name='无归属',
            description='未分配到任何阵营的角色',
            is_default=True,
            faction_type='no_faction',
            order=0
        )
        
        # Create "世界观" faction (for worldbuilding elements)
        Faction.objects.create(
            work=instance,
            name='世界观',
            description='地点、历史、规则等世界观设定',
            is_default=True,
            faction_type='worldbuilding',
            order=9999  # Always at the bottom
        )
