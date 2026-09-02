from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0064_patio_con_cita'),
    ]

    # Vencimientos con documento adjunto en Tractos y Remolques: Permisos Full,
    # Fisico Mecanica y Humo (Humo solo en tractos). La FECHA va en su tabla; el
    # ARCHIVO en api_fotoregistro, con tipos nuevos.
    #
    # `tractos` y `remolques` son managed=False, asi que un AddField no genera
    # DDL: la columna real va en RunSQL y el AddField solo mantiene el estado en
    # sync. Mismo patron que la 0032. ADD COLUMN de una columna nullable sin
    # default es metadata-only en Postgres (no reescribe la tabla), y el IF NOT
    # EXISTS / IF EXISTS lo hace idempotente y reversible.
    #
    # Los GRANT del rol estandar sobre `tractos` y `remolques` son a nivel de
    # TABLA (migracion 0005), asi que las columnas nuevas entran ya cubiertas.
    #
    # El AlterField de fotoregistro es solo la lista de `choices`: es validacion
    # de Django, no una restriccion de la base, asi que no genera ningun ALTER.
    # Los seis valores nuevos caben en el varchar(20) que ya existe.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='tracto',
                    name='fecha_vencimiento_permisos_full',
                    field=models.DateField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='tracto',
                    name='fecha_vencimiento_fisico_mecanica',
                    field=models.DateField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='tracto',
                    name='fecha_vencimiento_humo',
                    field=models.DateField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='remolque',
                    name='fecha_vencimiento_permisos_full',
                    field=models.DateField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='remolque',
                    name='fecha_vencimiento_fisico_mecanica',
                    field=models.DateField(blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE tractos
                            ADD COLUMN IF NOT EXISTS fecha_vencimiento_permisos_full date,
                            ADD COLUMN IF NOT EXISTS fecha_vencimiento_fisico_mecanica date,
                            ADD COLUMN IF NOT EXISTS fecha_vencimiento_humo date;
                    """,
                    reverse_sql="""
                        ALTER TABLE tractos
                            DROP COLUMN IF EXISTS fecha_vencimiento_permisos_full,
                            DROP COLUMN IF EXISTS fecha_vencimiento_fisico_mecanica,
                            DROP COLUMN IF EXISTS fecha_vencimiento_humo;
                    """,
                ),
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE remolques
                            ADD COLUMN IF NOT EXISTS fecha_vencimiento_permisos_full date,
                            ADD COLUMN IF NOT EXISTS fecha_vencimiento_fisico_mecanica date;
                    """,
                    reverse_sql="""
                        ALTER TABLE remolques
                            DROP COLUMN IF EXISTS fecha_vencimiento_permisos_full,
                            DROP COLUMN IF EXISTS fecha_vencimiento_fisico_mecanica;
                    """,
                ),
            ],
        ),
        migrations.AlterField(
            model_name='fotoregistro',
            name='tipo',
            field=models.CharField(
                choices=[
                    ('maniobra', 'Maniobra'),
                    ('vacio', 'Vacío'),
                    ('tracto_tarjeta', 'Tracto · Tarjeta de Circulación'),
                    ('tracto_full', 'Tracto · Permisos Full'),
                    ('tracto_fisico', 'Tracto · Físico Mecánica'),
                    ('tracto_humo', 'Tracto · Humo'),
                    ('remolque_full', 'Remolque · Permisos Full'),
                    ('remolque_fisico', 'Remolque · Físico Mecánica'),
                ],
                max_length=20,
            ),
        ),
    ]
