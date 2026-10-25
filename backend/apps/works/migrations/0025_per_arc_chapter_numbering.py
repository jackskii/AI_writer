# Generated for per-arc chapter numbering

from django.db import migrations


def renumber_chapters_per_act(apps, schema_editor):
    """Renumber chapters to be continuous within each act (1..N per act)."""
    from django.db import connection

    with connection.cursor() as cursor:
        # Get all acts (work_id, act_id), ordered by work then act order
        cursor.execute("""
            SELECT id, work_id FROM works_act ORDER BY work_id, "order"
        """)
        acts = cursor.fetchall()

        for (act_id, work_id) in acts:
            cursor.execute("""
                WITH numbered_chapters AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY "order") as new_num
                    FROM works_chapter
                    WHERE work_id = %s AND act_id = %s
                )
                UPDATE works_chapter
                SET chapter_number = nc.new_num
                FROM numbered_chapters nc
                WHERE works_chapter.id = nc.id
            """, [work_id, act_id])


def reverse_renumber_chapters_globally(apps, schema_editor):
    """Reverse: renumber chapters continuously across the whole work (old behavior)."""
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute("SELECT id FROM works_work")
        work_ids = cursor.fetchall()

        for (work_id,) in work_ids:
            cursor.execute("""
                WITH numbered_chapters AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY "order") as new_num
                    FROM works_chapter
                    WHERE work_id = %s
                )
                UPDATE works_chapter
                SET chapter_number = nc.new_num
                FROM numbered_chapters nc
                WHERE works_chapter.id = nc.id
            """, [work_id])


class Migration(migrations.Migration):

    dependencies = [
        ('works', '0024_work_auto_edit_prefs'),
    ]

    operations = [
        migrations.RunPython(
            renumber_chapters_per_act,
            reverse_renumber_chapters_globally,
        ),
    ]
