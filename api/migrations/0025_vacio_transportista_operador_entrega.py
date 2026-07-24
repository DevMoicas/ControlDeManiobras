from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0024_grant_dispositivoconfianza_to_standard_role'),
    ]

    # 'vacios' es managed=False: un AddField no genera DDL, así que las columnas
    # reales van en RunSQL. AddField solo mantiene el estado de migraciones en sync.
    # ADD COLUMN de columnas nullable sin default es metadata-only en Postgres (no
    # reescribe la tabla). IF NOT EXISTS / IF EXISTS lo hacen idempotente y
    # reversible. Mismo patrón que 0017_maniobra_tercero y 0019_add_audit_fields.
    # Los GRANT del rol estándar sobre `vacios` son a nivel de tabla, así que las
    # columnas nuevas quedan cubiertas sin GRANT adicional (igual que en la 0019).
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='vacio',
                    name='transportista',
                    field=models.CharField(blank=True, max_length=255, null=True),
                ),
                migrations.AddField(
                    model_name='vacio',
                    name='operador_entrega',
                    field=models.CharField(blank=True, max_length=255, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE vacios "
                        "ADD COLUMN IF NOT EXISTS transportista varchar(255), "
                        "ADD COLUMN IF NOT EXISTS operador_entrega varchar(255);"
                    ),
                    reverse_sql=(
                        "ALTER TABLE vacios "
                        "DROP COLUMN IF EXISTS transportista, "
                        "DROP COLUMN IF EXISTS operador_entrega;"
                    ),
                ),
            ],
        ),
    ]
