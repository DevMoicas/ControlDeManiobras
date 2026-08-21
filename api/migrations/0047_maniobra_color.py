from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0046_grant_torrecontrol_to_standard_role'),
    ]

    # 'maniobras' es managed=False: el AddField solo mantiene el estado de
    # migraciones y la columna real va en RunSQL. ADD COLUMN de una columna
    # nullable sin default es metadata-only en Postgres (no reescribe la tabla),
    # e IF NOT EXISTS / IF EXISTS lo hacen idempotente y reversible. Mismo patrón
    # que la 0034, la 0041 y la 0044.
    #
    # Los GRANT del rol estándar sobre `maniobras` son a nivel de tabla (0005),
    # así que la columna nueva queda cubierta sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='maniobra',
                    name='color',
                    field=models.CharField(blank=True, max_length=7, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS color varchar(7);",
                    reverse_sql="ALTER TABLE maniobras DROP COLUMN IF EXISTS color;",
                ),
            ],
        ),
    ]
