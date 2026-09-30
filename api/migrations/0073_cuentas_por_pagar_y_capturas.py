import django.db.models.deletion
from django.db import migrations, models


# Fase 4 de PLAN_MODULO_FINANZAS.md: cuentas por pagar, gastos fijos y capturas
# mensuales. Las escriben staff (superusuario) y los cargos de Finanzas, que van
# con el rol estándar. Qué recibe el rol estándar, tabla por tabla:
#
#   api_cuentaporpagar  SELECT, INSERT y UPDATE SOLO de las columnas que se
#                       editan. Sin `estado` (cancelar es solo staff, P55/P56),
#                       sin origen ni maniobra (se fijan al crear) y sin DELETE.
#   api_gastofijo       SELECT, INSERT, UPDATE. Sin DELETE (borrar, solo staff).
#   api_gastofijopago   SELECT, INSERT, UPDATE. Vaciar una celda deja el monto en
#                       NULL, así que tampoco necesita DELETE.
#   api_capturamensual  SELECT, INSERT, UPDATE. Sin DELETE.
#
# Más la USAGE de cada secuencia (nacen después del GRANT de la 0005) y RLS.
TABLAS = ['api_cuentaporpagar', 'api_gastofijo', 'api_gastofijopago', 'api_capturamensual']
COLUMNAS_CXP = ('empresa, no_factura, total, concepto, fecha, dias_credito, pagada, '
                'updated_by, updated_at')


def grant(apps, schema_editor):
    for tabla in TABLAS:
        if tabla == 'api_cuentaporpagar':
            schema_editor.execute(f"GRANT SELECT, INSERT ON TABLE {tabla} TO django_standard_role;")
            schema_editor.execute(f"GRANT UPDATE ({COLUMNAS_CXP}) ON TABLE {tabla} TO django_standard_role;")
        else:
            schema_editor.execute(f"GRANT SELECT, INSERT, UPDATE ON TABLE {tabla} TO django_standard_role;")
        schema_editor.execute(f"GRANT USAGE, SELECT ON SEQUENCE {tabla}_id_seq TO django_standard_role;")
        schema_editor.execute(f"ALTER TABLE {tabla} ENABLE ROW LEVEL SECURITY;")
        for op, clausula in (('select', 'USING (true)'),
                             ('insert', 'WITH CHECK (true)'),
                             ('update', 'USING (true) WITH CHECK (true)')):
            schema_editor.execute(
                f"CREATE POLICY std_{op}_{tabla} ON {tabla} FOR {op.upper()} "
                f"TO django_standard_role {clausula};"
            )


def revoke(apps, schema_editor):
    for tabla in TABLAS:
        for op in ('select', 'insert', 'update'):
            schema_editor.execute(f"DROP POLICY IF EXISTS std_{op}_{tabla} ON {tabla};")
        schema_editor.execute(f"ALTER TABLE {tabla} DISABLE ROW LEVEL SECURITY;")
        schema_editor.execute(f"REVOKE ALL PRIVILEGES ON TABLE {tabla} FROM django_standard_role;")
        schema_editor.execute(f"REVOKE ALL PRIVILEGES ON SEQUENCE {tabla}_id_seq FROM django_standard_role;")


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0072_grant_factura_cobrada'),
    ]

    operations = [
        migrations.CreateModel(
            name='CapturaMensual',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mes', models.DateField()),
                ('tipo', models.CharField(choices=[('financiero', 'Gasto financiero'), ('impuesto', 'Impuesto'), ('comision', 'Comisión de ventas')], max_length=15)),
                ('concepto', models.CharField(max_length=255)),
                ('monto', models.DecimalField(decimal_places=2, max_digits=14)),
                ('created_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['mes', 'tipo', 'id'],
                'managed': True,
            },
        ),
        migrations.CreateModel(
            name='GastoFijo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('empresa', models.CharField(choices=[('fraba', 'Fraba'), ('soluciones', 'Soluciones')], max_length=20)),
                ('concepto', models.CharField(max_length=255)),
                ('dia_pago', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('monto', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('periodicidad', models.PositiveSmallIntegerField(choices=[(1, 'Mensual'), (2, 'Bimestral'), (3, 'Trimestral'), (6, 'Semestral'), (12, 'Anual')], default=1)),
                ('created_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['empresa', 'concepto'],
                'managed': True,
            },
        ),
        migrations.CreateModel(
            name='CuentaPorPagar',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('origen', models.CharField(choices=[('flete', 'Flete'), ('local', 'Local'), ('mantenimiento', 'Mantenimiento')], max_length=15)),
                ('empresa', models.CharField(choices=[('fraba', 'Fraba'), ('soluciones', 'Soluciones')], max_length=20)),
                ('no_factura', models.CharField(blank=True, default='', max_length=100)),
                ('total', models.DecimalField(decimal_places=2, max_digits=14)),
                ('concepto', models.CharField(blank=True, default='', max_length=255)),
                ('fecha', models.DateField()),
                ('dias_credito', models.PositiveIntegerField(default=0)),
                ('estado', models.CharField(choices=[('activa', 'Activa'), ('cancelada', 'Cancelada')], default='activa', max_length=10)),
                ('pagada', models.BooleanField(default=False)),
                ('created_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('maniobra', models.ForeignKey(blank=True, db_constraint=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='cuentas_por_pagar', to='api.maniobra')),
            ],
            options={
                'ordering': ['-fecha', '-id'],
                'managed': True,
                'constraints': [models.UniqueConstraint(condition=models.Q(('estado', 'activa'), ('maniobra__isnull', False)), fields=('maniobra', 'origen'), name='cxp_una_activa_por_maniobra_y_origen')],
            },
        ),
        migrations.CreateModel(
            name='GastoFijoPago',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mes', models.DateField()),
                ('monto', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('updated_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('gasto_fijo', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pagos', to='api.gastofijo')),
            ],
            options={
                'ordering': ['mes'],
                'managed': True,
                'constraints': [models.UniqueConstraint(fields=('gasto_fijo', 'mes'), name='gasto_fijo_un_pago_por_mes')],
            },
        ),
        migrations.RunPython(grant, reverse_code=revoke),
    ]
