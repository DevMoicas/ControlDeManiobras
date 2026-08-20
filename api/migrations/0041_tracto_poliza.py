from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0040_grant_pendiente_to_standard_role'),
    ]

    # 'tractos' es managed=False: un AddField no genera DDL, así que la columna
    # real va en RunSQL y el AddField solo mantiene el estado de migraciones en
    # sync. ADD COLUMN de una columna nullable sin default es metadata-only en
    # Postgres (no reescribe la tabla). IF NOT EXISTS / IF EXISTS lo hacen
    # idempotente y reversible. Mismo patrón que la 0032 y la 0034.
    #
    # Los GRANT del rol estándar sobre `tractos` son a nivel de tabla (0005), así
    # que la columna nueva queda cubierta sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='tracto',
                    name='poliza',
                    field=models.CharField(blank=True, max_length=100, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE tractos ADD COLUMN IF NOT EXISTS poliza varchar(100);",
                    reverse_sql="ALTER TABLE tractos DROP COLUMN IF EXISTS poliza;",
                ),
            ],
        ),
    ]
