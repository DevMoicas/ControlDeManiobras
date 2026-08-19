from django.db import migrations, models


def _añadir(nombre, tipo_sql):
    return migrations.RunSQL(
        sql=f"ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS {nombre} {tipo_sql};",
        reverse_sql=f"ALTER TABLE maniobras DROP COLUMN IF EXISTS {nombre};",
    )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0034_maniobra_saca_gasto_unidad'),
    ]

    # Segundo operador: un Full puede repartirse entre dos, y cada uno se lleva
    # UN contenedor con su propio tracto y sus remolques. El reparto es
    # posicional y fijo: folio/tipo/peso/contenedor + unidad + remolque y
    # remolque_2 son del operador 1; los campos _2 y remolque_3/4, del operador 2.
    #
    # 'maniobras' es managed=False: un AddField no genera DDL, así que las
    # columnas reales van en RunSQL y el AddField solo mantiene el estado de
    # migraciones en sync. ADD COLUMN de una columna nullable sin default es
    # metadata-only en Postgres (no reescribe la tabla). IF NOT EXISTS /
    # IF EXISTS lo hacen idempotente y reversible. Mismo patrón que la 0034.
    # Los GRANT del rol estándar sobre 'maniobras' son a nivel de tabla (0005),
    # así que las columnas nuevas quedan cubiertas sin GRANT adicional.
    #
    # Sin backfill a propósito: los Full anteriores guardan sus dos contenedores
    # dentro de la columna 1 ("A / B") y ahí se quedan. Partirlos en masa sobre
    # datos vivos, con separadores mezclados ('-' y '/') según la época del
    # registro, arriesga estropearlos a cambio de nada: el frontend lee los dos
    # formatos y cada fila pasa al nuevo la primera vez que se edita.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(model_name='maniobra', name='operador_2',
                                    field=models.CharField(blank=True, max_length=100, null=True)),
                migrations.AddField(model_name='maniobra', name='unidad_2',
                                    field=models.CharField(blank=True, max_length=100, null=True)),
                migrations.AddField(model_name='maniobra', name='folio_2',
                                    field=models.CharField(blank=True, max_length=100, null=True)),
                migrations.AddField(model_name='maniobra', name='remolque_3',
                                    field=models.CharField(blank=True, max_length=255, null=True)),
                migrations.AddField(model_name='maniobra', name='remolque_4',
                                    field=models.CharField(blank=True, max_length=100, null=True)),
                migrations.AddField(model_name='maniobra', name='tipo_2',
                                    field=models.CharField(blank=True, max_length=100, null=True)),
                migrations.AddField(model_name='maniobra', name='peso_2',
                                    field=models.CharField(blank=True, max_length=50, null=True)),
                migrations.AddField(model_name='maniobra', name='contenedor_2',
                                    field=models.CharField(blank=True, max_length=255, null=True)),
            ],
            database_operations=[
                _añadir('operador_2',   'varchar(100)'),
                _añadir('unidad_2',     'varchar(100)'),
                _añadir('folio_2',      'varchar(100)'),
                _añadir('remolque_3',   'varchar(255)'),
                _añadir('remolque_4',   'varchar(100)'),
                _añadir('tipo_2',       'varchar(100)'),
                _añadir('peso_2',       'varchar(50)'),
                _añadir('contenedor_2', 'varchar(255)'),
            ],
        ),
    ]
