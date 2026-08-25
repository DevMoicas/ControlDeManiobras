from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0053_reporteviaje_rendimiento'),
    ]

    # STATUS PISO: texto libre con la situacion de la carga mientras sigue en
    # piso. Va entre DESTINO y TRANSPORTISTA en la tabla de Maniobras y entre
    # PESO y ORIGEN en el desglose de pendientes.
    #
    # 'maniobras' es managed=False: un AddField no genera DDL, asi que la
    # columna real va en RunSQL y el AddField solo mantiene el estado de
    # migraciones en sync. ADD COLUMN de una columna nullable sin default es
    # metadata-only en Postgres (no reescribe la tabla, que tiene 412 filas).
    # IF NOT EXISTS / IF EXISTS lo hacen idempotente y reversible. Mismo patron
    # que la 0034 y la 0035.
    #
    # Los GRANT del rol estandar sobre 'maniobras' son a nivel de tabla (0005),
    # asi que la columna nueva queda cubierta sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='maniobra',
                    name='status_piso',
                    field=models.CharField(blank=True, max_length=255, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS status_piso varchar(255);",
                    reverse_sql="ALTER TABLE maniobras DROP COLUMN IF EXISTS status_piso;",
                ),
            ],
        ),
    ]
