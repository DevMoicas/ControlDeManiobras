from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0061_vacio_maniobra'),
    ]

    # COLORES: el relleno de CELDAS sueltas, {columna: "#rrggbb"}. Es el otro
    # balde de pintura, aparte del que ya rellena la fila entera (`color`, de las
    # migraciones 0047/0048/0059): pintar la fila para senalar UN dato tapa los
    # otros treinta, y en una hoja de calculo esto se hace celda a celda.
    # `color` no se sustituye ni cambia; el de la celda simplemente le gana.
    #
    # UN SOLO jsonb y no una columna por celda: son 30 columnas en maniobras, y
    # ninguna necesita indexarse ni filtrarse por su color. Mismo razonamiento y
    # mismo tipo que `gastos.formulas` (0058), que ya guarda {campo: valor}.
    #
    # Las tres tablas a la vez porque es una sola decision: el balde nuevo sale
    # en Maniobras, Vacios y Gastos, y partirlo en tres migraciones solo daria
    # tres ocasiones de que una se quede sin aplicar.
    #
    # Las tres son managed=False: un AddField no genera DDL, asi que la columna
    # real va en RunSQL y el AddField solo mantiene el estado en sync.
    #
    # NOT NULL DEFAULT '{}': "sin pintar" y "no se sabe" son lo mismo, y un NULL
    # solo daria a la interfaz un caso mas. Desde Postgres 11 un ADD COLUMN con
    # default constante NO reescribe la tabla.
    #
    # Los GRANT del rol estandar sobre las tres son a nivel de tabla, asi que la
    # columna nueva queda cubierta sin GRANT adicional.
    _TABLAS = ('maniobras', 'vacios', 'gastos')

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name=modelo,
                    name='colores',
                    field=models.JSONField(blank=True, default=dict),
                )
                for modelo in ('maniobra', 'vacio', 'gasto')
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="".join(
                        f"ALTER TABLE {tabla} ADD COLUMN IF NOT EXISTS "
                        f"colores jsonb NOT NULL DEFAULT '{{}}'::jsonb;"
                        for tabla in _TABLAS
                    ),
                    reverse_sql="".join(
                        f"ALTER TABLE {tabla} DROP COLUMN IF EXISTS colores;"
                        for tabla in _TABLAS
                    ),
                ),
            ],
        ),
    ]
