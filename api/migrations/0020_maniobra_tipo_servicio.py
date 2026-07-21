from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0019_add_audit_fields'),
    ]

    # Mismo patrón que 0017: 'maniobras' es managed=False, así que la columna real
    # va en RunSQL y el AddField solo mantiene el estado de migraciones en sync.
    # ADD COLUMN nullable sin default es metadata-only en Postgres. Los GRANT de
    # 0005 son a nivel de tabla, la columna nueva los hereda.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='maniobra',
                    name='tipo_servicio',
                    field=models.CharField(
                        blank=True,
                        choices=[
                            ('sencillo', 'Sencillo'),
                            ('full', 'Full'),
                            ('carga_suelta', 'Carga suelta'),
                        ],
                        max_length=20,
                        null=True,
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql='ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS tipo_servicio VARCHAR(20);',
                    reverse_sql='ALTER TABLE maniobras DROP COLUMN IF EXISTS tipo_servicio;',
                ),
            ],
        ),
    ]
