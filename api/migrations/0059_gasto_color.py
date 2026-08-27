from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0058_gasto_formulas'),
    ]

    # COLOR: el balde de pintura de la fila, el mismo que ya tienen Maniobras y
    # Vacios (0047 y 0048). Va en la base porque la tabla es compartida: la fila
    # que pinta una persona la ven las demas.
    #
    # 'gastos' es managed=False: el AddField solo mantiene el estado y la columna
    # real va en RunSQL. ADD COLUMN nullable sin default es metadata-only en
    # Postgres (no reescribe la tabla), e IF NOT EXISTS / IF EXISTS lo hacen
    # idempotente y reversible. Mismo patron que la 0048.
    #
    # Los GRANT del rol estandar sobre 'gastos' son a nivel de tabla, asi que la
    # columna nueva queda cubierta sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='gasto',
                    name='color',
                    field=models.CharField(blank=True, max_length=7, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE gastos ADD COLUMN IF NOT EXISTS color varchar(7);",
                    reverse_sql="ALTER TABLE gastos DROP COLUMN IF EXISTS color;",
                ),
            ],
        ),
    ]
