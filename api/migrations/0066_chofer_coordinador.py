from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0065_documentos_de_catalogos'),
    ]

    # 'choferes' es managed=False: un AddField no genera DDL, asi que la columna
    # real va en RunSQL y el AddField solo mantiene el estado de migraciones en
    # sync. Mismo patron que la 0042 sobre `vacios`.
    #
    # ADD COLUMN de una columna nullable sin default es metadata-only en Postgres
    # (no reescribe la tabla). IF NOT EXISTS / IF EXISTS lo hacen idempotente y
    # reversible.
    #
    # Los GRANT del rol estandar sobre `choferes` son a nivel de tabla (0005),
    # asi que la columna nueva queda cubierta sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='chofer',
                    name='coordinador',
                    field=models.CharField(blank=True, max_length=255, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE choferes ADD COLUMN IF NOT EXISTS coordinador varchar(255);",
                    reverse_sql="ALTER TABLE choferes DROP COLUMN IF EXISTS coordinador;",
                ),
            ],
        ),
    ]
