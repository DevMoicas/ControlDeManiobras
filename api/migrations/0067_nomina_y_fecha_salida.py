import django.db.models.deletion
from django.db import migrations, models


# Nomina: dos tablas nuevas (managed) y una columna en `empleados` (managed=False).
#
# ── Sobre los GRANT, que aqui se OMITEN a proposito ──────────────────────────
# Toda tabla managed nueva del proyecto venia otorgando SELECT/INSERT/UPDATE a
# django_standard_role (ver la 0008, la 0018, la 0021…). Estas dos no.
#
# Son sueldos, primas y finiquitos. La nomina es admin-only en la API (ver
# NominaViewSet), y sin GRANT lo es tambien EN LA BASE: un usuario estandar no
# puede leerla ni aunque un fallo de permisos en una vista futura le dejara
# llegar. Es la misma linea que ya trazo la decision A1 con los borrados y el
# ADR-0014 con ingresos y utilidad, apretada un punto mas porque esto son
# nominas. Los administradores escriben por el alias `default` (superusuario,
# ver middleware.py), asi que no necesitan GRANT ninguno.
#
# Consecuencia a tener presente: si algun dia la nomina la lleva alguien que no
# es admin, no basta con abrir el permiso en la vista — hay que otorgar aqui.
#
# `empleados` es otra historia: la usa todo el mundo desde Catalogos y sus GRANT
# son a nivel de TABLA (0005), asi que la columna nueva entra ya cubierta.


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0066_chofer_coordinador'),
    ]

    operations = [
        # 'empleados' es managed=False: un AddField no genera DDL, asi que la
        # columna real va en RunSQL y el AddField solo mantiene el estado en
        # sync. Mismo patron que la 0066 sobre `choferes`. ADD COLUMN nullable
        # sin default es metadata-only en Postgres (no reescribe la tabla).
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='empleado',
                    name='fecha_salida',
                    field=models.DateField(blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE empleados ADD COLUMN IF NOT EXISTS fecha_salida date;",
                    reverse_sql="ALTER TABLE empleados DROP COLUMN IF EXISTS fecha_salida;",
                ),
            ],
        ),
        migrations.CreateModel(
            name='NominaEmpleado',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sueldo', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('dias_tomados', models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True)),
                ('finiquito', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('formulas', models.JSONField(blank=True, default=dict)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
                ('empleado', models.OneToOneField(db_column='empleado_id', db_constraint=False, on_delete=django.db.models.deletion.CASCADE, related_name='nomina', to='api.empleado')),
            ],
            options={
                'ordering': ['empleado_id'],
                'managed': True,
            },
        ),
        migrations.CreateModel(
            name='VacacionDia',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fecha', models.DateField(unique=True)),
                ('nota', models.CharField(blank=True, default='', max_length=255)),
                ('color', models.CharField(blank=True, default='', max_length=7)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('empleado', models.ForeignKey(db_column='empleado_id', db_constraint=False, on_delete=django.db.models.deletion.CASCADE, related_name='vacaciones', to='api.empleado')),
            ],
            options={
                'ordering': ['fecha'],
                'managed': True,
            },
        ),
    ]
