import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0027_normalize_vacio_status_lowercase'),
    ]

    # 'maniobras' es managed=False: un AddField no genera DDL, así que la columna
    # real va en RunSQL. AddField solo mantiene el estado de migraciones en sync.
    # ADD COLUMN de una columna nullable sin default es metadata-only en Postgres
    # (no reescribe la tabla) y la FK no valida nada porque todas las filas quedan
    # en NULL. IF NOT EXISTS / IF EXISTS lo hacen idempotente y reversible. Mismo
    # patrón que 0017_maniobra_tercero y 0025.
    # Los GRANT del rol estándar sobre `maniobras` son a nivel de tabla, así que la
    # columna nueva queda cubierta sin GRANT adicional (igual que en 0019 y 0025).
    # Sin backfill a propósito: para un folio viejo que solo dice "YAZAKI" no hay
    # forma de saber a cuál de los dos clientes homónimos apuntaba. Se quedan en
    # NULL y caen al fallback por nombre (comportamiento de hoy, sin regresión)
    # hasta que alguien reedite la maniobra y reelija el cliente.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='maniobra',
                    name='cliente_fk',
                    field=models.ForeignKey(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to='api.cliente', db_column='cliente_id',
                        related_name='maniobras',
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE maniobras "
                        "ADD COLUMN IF NOT EXISTS cliente_id bigint "
                        "REFERENCES api_cliente(id) ON DELETE SET NULL;"
                    ),
                    reverse_sql=(
                        "ALTER TABLE maniobras DROP COLUMN IF EXISTS cliente_id;"
                    ),
                ),
            ],
        ),
    ]
