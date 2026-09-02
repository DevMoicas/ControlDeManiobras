from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0062_colores_de_celda'),
    ]

    # CITA: la hora a la que hay que estar en la terminal. La columna ya existia
    # como texto libre desde la 0002 y NADIE la habia usado —0 de 236 filas con
    # algo escrito en la base local—, asi que se convierte en vez de dejarla
    # muerta y crear otra con el mismo nombre al lado.
    #
    # timestamptz y no fecha + hora en dos columnas: el par separado
    # (fecha_entrega_mercancia + hora_entrega) existe para las fechas que se
    # RECORTAN a dia y viajan a documentos y gastos como 'YYYY-MM-DD', donde la
    # zona horaria del servidor las correria un dia. La cita no se recorta: se
    # lee entera, y el proyecto ya sabe imprimir un instante en la hora de
    # operacion (_fecha_hora_doc convierte a America/Mexico_City). Es ademas el
    # mismo tipo que ReporteViaje.cita, que es esta misma idea en otra tabla.
    #
    # 'vacios' es managed=False: la conversion real va en RunSQL y el AlterField
    # solo mantiene el estado en sync.
    #
    # ⚠ El USING con el cast es a proposito una RED, no un colador: si en
    # produccion hubiera texto que no sea una fecha, el ALTER falla y la
    # migracion entera se deshace sola. Mejor pararse y mirarlo que convertir a
    # medias y perder lo que alguien escribio.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='vacio',
                    name='cita',
                    field=models.DateTimeField(blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE vacios ALTER COLUMN cita TYPE timestamptz "
                        "USING NULLIF(TRIM(cita), '')::timestamptz;"
                    ),
                    # De vuelta a texto en el formato que espera la pantalla
                    # vieja. Lo que se hubiera capturado como instante se queda
                    # legible, no se pierde.
                    reverse_sql=(
                        "ALTER TABLE vacios ALTER COLUMN cita TYPE varchar(255) "
                        "USING to_char(cita, 'YYYY-MM-DD HH24:MI');"
                    ),
                ),
            ],
        ),
    ]
