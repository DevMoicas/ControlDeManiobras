from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0042_vacio_tipo_contenedor_coordinador'),
    ]

    # 'vacios' es managed=False: el AddField solo mantiene el estado y la columna
    # real va en RunSQL. Mismo patrón que 0025 y 0042 sobre esta misma tabla.
    #
    # `reprogramado` sale NOT NULL DEFAULT false y no nullable como el resto de la
    # tabla: es una respuesta de sí/no y un tercer valor (NULL = "no se sabe") no
    # significa nada aquí, solo abre la puerta a un booleano de tres estados.
    # Desde Postgres 11 un ADD COLUMN con DEFAULT constante NO reescribe la tabla,
    # así que las filas existentes quedan en false sin coste.
    #
    # Los GRANT del rol estándar sobre `vacios` son a nivel de tabla (0005), así
    # que las columnas nuevas quedan cubiertas sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='vacio',
                    name='reprogramado',
                    field=models.BooleanField(default=False),
                ),
                migrations.AddField(
                    model_name='vacio',
                    name='fecha_reprogramacion',
                    field=models.DateField(blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE vacios ADD COLUMN IF NOT EXISTS "
                        "reprogramado boolean NOT NULL DEFAULT false;"
                    ),
                    reverse_sql="ALTER TABLE vacios DROP COLUMN IF EXISTS reprogramado;",
                ),
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE vacios ADD COLUMN IF NOT EXISTS "
                        "fecha_reprogramacion date;"
                    ),
                    reverse_sql="ALTER TABLE vacios DROP COLUMN IF EXISTS fecha_reprogramacion;",
                ),
            ],
        ),
    ]
