from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0056_carga_orden_sin_tope'),
    ]

    # PENDIENTE DE PROGRAMAR: la casilla del desglose de PENDIENTES de la
    # pantalla de inicio. Se marca cuando el servicio ya se reviso y pinta la
    # fila de verde. Va en la base y no en el navegador porque el repaso es
    # compartido: lo que marca una persona lo ven las demas.
    #
    # 'maniobras' es managed=False: un AddField no genera DDL, asi que la columna
    # real va en RunSQL y el AddField solo mantiene el estado de migraciones en
    # sync. Mismo patron que la 0054 y la 0055.
    #
    # NOT NULL DEFAULT false y no nullable: aqui "sin marcar" y "no se sabe" son
    # lo mismo, asi que un tercer estado NULL solo daria a la interfaz un caso
    # mas que distinguir. Desde Postgres 11 un ADD COLUMN con default constante
    # NO reescribe la tabla, asi que sigue siendo barato sobre las 414 filas.
    #
    # Los GRANT del rol estandar sobre 'maniobras' son a nivel de tabla (0005),
    # asi que la columna nueva queda cubierta sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='maniobra',
                    name='pendiente_programar',
                    field=models.BooleanField(default=False),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS "
                        "pendiente_programar boolean NOT NULL DEFAULT false;"
                    ),
                    reverse_sql=(
                        "ALTER TABLE maniobras DROP COLUMN IF EXISTS pendiente_programar;"
                    ),
                ),
            ],
        ),
    ]
