from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0057_maniobra_pendiente_programar'),
    ]

    # FORMULAS: el desglose que se teclea en una celda de dinero ("=150+230+430",
    # cinco casetas pagadas por separado). La columna de dinero sigue guardando
    # solo el total; esto es lo que permite volver a ensenar la suma al editar,
    # como hace Excel. Va en la base y no en el navegador porque la tabla es
    # compartida: la formula que escribe una persona la ven las demas. Mismo
    # razonamiento que la 0057.
    #
    # 'gastos' es managed=False: un AddField no genera DDL, asi que la columna
    # real va en RunSQL y el AddField solo mantiene el estado en sync. Mismo
    # patron que la 0047 y la 0057.
    #
    # NOT NULL DEFAULT '{}': "sin formulas" y "no se sabe" son lo mismo, y un
    # NULL solo daria a la interfaz un caso mas. Desde Postgres 11 un ADD COLUMN
    # con default constante NO reescribe la tabla.
    #
    # Los GRANT del rol estandar sobre 'gastos' son a nivel de tabla, asi que la
    # columna nueva queda cubierta sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='gasto',
                    name='formulas',
                    field=models.JSONField(blank=True, default=dict),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE gastos ADD COLUMN IF NOT EXISTS "
                        "formulas jsonb NOT NULL DEFAULT '{}'::jsonb;"
                    ),
                    reverse_sql="ALTER TABLE gastos DROP COLUMN IF EXISTS formulas;",
                ),
            ],
        ),
    ]
