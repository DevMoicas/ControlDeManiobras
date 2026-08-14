from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0033_grant_terceros_to_standard_role'),
    ]

    # 'maniobras' y 'gastos' son managed=False: un AddField no genera DDL, así que
    # las columnas reales van en RunSQL y el AddField solo mantiene el estado de
    # migraciones en sync. ADD COLUMN de una columna nullable sin default es
    # metadata-only en Postgres (no reescribe la tabla). IF NOT EXISTS / IF EXISTS
    # lo hacen idempotente y reversible. Mismo patrón que la 0032.
    # Los GRANT del rol estándar sobre ambas tablas son a nivel de tabla (0005),
    # así que las columnas nuevas quedan cubiertas sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='maniobra',
                    name='saca',
                    field=models.CharField(blank=True, max_length=100, null=True),
                ),
                migrations.AddField(
                    model_name='gasto',
                    name='unidad',
                    field=models.CharField(blank=True, max_length=100, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS saca varchar(100);",
                    reverse_sql="ALTER TABLE maniobras DROP COLUMN IF EXISTS saca;",
                ),
                migrations.RunSQL(
                    sql="ALTER TABLE gastos ADD COLUMN IF NOT EXISTS unidad varchar(100);",
                    reverse_sql="ALTER TABLE gastos DROP COLUMN IF EXISTS unidad;",
                ),
            ],
        ),
    ]
