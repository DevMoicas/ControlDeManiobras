from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0041_tracto_poliza'),
    ]

    # 'vacios' es managed=False: un AddField no genera DDL, así que las columnas
    # reales van en RunSQL y el AddField solo mantiene el estado de migraciones en
    # sync. ADD COLUMN de una columna nullable sin default es metadata-only en
    # Postgres (no reescribe la tabla). IF NOT EXISTS / IF EXISTS lo hacen
    # idempotente y reversible. Mismo patrón que la 0025, que añadió
    # transportista y operador_entrega a esta misma tabla.
    #
    # Los GRANT del rol estándar sobre `vacios` son a nivel de tabla (0005), así
    # que las columnas nuevas quedan cubiertas sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='vacio',
                    name='tipo_contenedor',
                    field=models.CharField(blank=True, max_length=100, null=True),
                ),
                migrations.AddField(
                    model_name='vacio',
                    name='coordinador',
                    field=models.CharField(blank=True, max_length=255, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE vacios ADD COLUMN IF NOT EXISTS tipo_contenedor varchar(100);",
                    reverse_sql="ALTER TABLE vacios DROP COLUMN IF EXISTS tipo_contenedor;",
                ),
                migrations.RunSQL(
                    sql="ALTER TABLE vacios ADD COLUMN IF NOT EXISTS coordinador varchar(255);",
                    reverse_sql="ALTER TABLE vacios DROP COLUMN IF EXISTS coordinador;",
                ),
            ],
        ),
    ]
