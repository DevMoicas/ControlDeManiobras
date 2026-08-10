from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0031_seed_folios'),
    ]

    # 'vacios' es managed=False: un AddField no genera DDL, así que la columna real
    # va en RunSQL y el AddField solo mantiene el estado de migraciones en sync.
    # ADD COLUMN de una columna nullable sin default es metadata-only en Postgres
    # (no reescribe la tabla). IF NOT EXISTS / IF EXISTS lo hacen idempotente y
    # reversible. Mismo patrón que la 0025_vacio_transportista_operador_entrega.
    # Los GRANT del rol estándar sobre `vacios` son a nivel de tabla, así que la
    # columna nueva queda cubierta sin GRANT adicional (igual que en la 0019/0025).
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='vacio',
                    name='status_eir',
                    field=models.CharField(
                        blank=True,
                        choices=[
                            ('enviado', 'Enviado'),
                            ('pendiente', 'Pendiente'),
                            ('sin_eir_fisico', 'Sin EIR Físico'),
                        ],
                        max_length=20,
                        null=True,
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE vacios ADD COLUMN IF NOT EXISTS status_eir varchar(20);",
                    reverse_sql="ALTER TABLE vacios DROP COLUMN IF EXISTS status_eir;",
                ),
            ],
        ),
    ]
