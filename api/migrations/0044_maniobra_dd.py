from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0043_vacio_reprogramado'),
    ]

    # 'maniobras' es managed=False: el AddField solo mantiene el estado de
    # migraciones y la columna real va en RunSQL. ADD COLUMN de una columna
    # nullable sin default es metadata-only en Postgres (no reescribe la tabla),
    # e IF NOT EXISTS / IF EXISTS lo hacen idempotente y reversible. Mismo patrón
    # que la 0034 y la 0041.
    #
    # Los GRANT del rol estándar sobre `maniobras` son a nivel de tabla (0005),
    # así que la columna nueva queda cubierta sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='maniobra',
                    name='dd',
                    field=models.CharField(blank=True, max_length=100, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS dd varchar(100);",
                    reverse_sql="ALTER TABLE maniobras DROP COLUMN IF EXISTS dd;",
                ),
            ],
        ),
    ]
