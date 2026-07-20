from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0015_chofer_rfc_licencia_opcionales'),
    ]

    # 'maniobras' es managed=False: un AlterField no genera DDL, así que el índice
    # real va en RunSQL. AlterField solo mantiene el estado de migraciones en sync
    # (para que makemigrations no vuelva a detectar el cambio). CREATE INDEX
    # CONCURRENTLY evita bloquear la tabla mientras se construye el índice;
    # IF NOT EXISTS lo hace idempotente. CONCURRENTLY no puede correr dentro de
    # una transacción, de ahí atomic = False.
    atomic = False

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='maniobra',
                    name='fecha_pis',
                    field=models.DateField(blank=True, db_index=True, max_length=50, null=True),
                ),
                migrations.AlterField(
                    model_name='maniobra',
                    name='fecha_entrega_mercancia',
                    field=models.DateField(blank=True, db_index=True, max_length=50, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql='CREATE INDEX CONCURRENTLY IF NOT EXISTS maniobras_fecha_pis_idx ON maniobras (fecha_pis);',
                    reverse_sql='DROP INDEX CONCURRENTLY IF EXISTS maniobras_fecha_pis_idx;',
                ),
                migrations.RunSQL(
                    sql='CREATE INDEX CONCURRENTLY IF NOT EXISTS maniobras_fecha_entrega_mercancia_idx ON maniobras (fecha_entrega_mercancia);',
                    reverse_sql='DROP INDEX CONCURRENTLY IF EXISTS maniobras_fecha_entrega_mercancia_idx;',
                ),
            ],
        ),
    ]
