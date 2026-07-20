from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0016_maniobra_fecha_pis_entrega_indices'),
    ]

    # 'maniobras' es managed=False: un AddField no genera DDL, así que la columna
    # real va en RunSQL. AddField solo mantiene el estado de migraciones en sync
    # (para que makemigrations no vuelva a detectar el cambio). ADD COLUMN de una
    # columna nullable sin default es metadata-only en Postgres (no reescribe la
    # tabla), así que no hace falta CONCURRENTLY ni atomic=False. IF NOT EXISTS /
    # IF EXISTS lo hacen idempotente y reversible sin sorpresas.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='maniobra',
                    name='tercero',
                    field=models.CharField(blank=True, max_length=20, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql='ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS tercero VARCHAR(20);',
                    reverse_sql='ALTER TABLE maniobras DROP COLUMN IF EXISTS tercero;',
                ),
            ],
        ),
    ]
