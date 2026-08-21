from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0047_maniobra_color'),
    ]

    # 'vacios' es managed=False: mismo patrón que la 0047 para maniobras — el
    # AddField solo mantiene el estado y la columna real va en RunSQL. ADD COLUMN
    # nullable sin default es metadata-only en Postgres, e IF NOT EXISTS /
    # IF EXISTS lo hacen idempotente y reversible.
    #
    # Los GRANT del rol estándar sobre `vacios` son a nivel de tabla, así que la
    # columna nueva queda cubierta sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='vacio',
                    name='color',
                    field=models.CharField(blank=True, max_length=7, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE vacios ADD COLUMN IF NOT EXISTS color varchar(7);",
                    reverse_sql="ALTER TABLE vacios DROP COLUMN IF EXISTS color;",
                ),
            ],
        ),
    ]
