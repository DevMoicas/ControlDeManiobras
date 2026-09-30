import django.db.models.deletion
from django.db import migrations, models


# Fase 1 de PLAN_MODULO_FINANZAS.md: las facturas leídas del Excel.
#
# ── GRANT del rol estándar ───────────────────────────────────────────────────
# Lo usan dos tipos de petición no-admin:
#   - la carga del Excel por los cargos de Finanzas → INSERT (y su secuencia,
#     que nace después del GRANT sobre ALL SEQUENCES de la 0005);
#   - guardar el No. Factura de una maniobra, que liga o suelta facturas →
#     UPDATE, pero SOLO de las columnas de la liga.
# Sin DELETE (las facturas no se borran, P65) y sin UPDATE de importes ni de
# `estado`: cancelar es solo staff (P65), que escribe como superusuario. Así ni
# un fallo de permisos en una vista futura deja a un usuario estándar tocar el
# dinero de una factura.
TABLA     = 'api_factura'
SECUENCIA = 'api_factura_id_seq'


def grant(apps, schema_editor):
    schema_editor.execute(f"GRANT SELECT, INSERT ON TABLE {TABLA} TO django_standard_role;")
    schema_editor.execute(
        f"GRANT UPDATE (maniobra_id, updated_by, updated_at) ON TABLE {TABLA} TO django_standard_role;"
    )
    schema_editor.execute(f"GRANT USAGE, SELECT ON SEQUENCE {SECUENCIA} TO django_standard_role;")
    schema_editor.execute(f"ALTER TABLE {TABLA} ENABLE ROW LEVEL SECURITY;")
    for op, clausula in (('select', 'USING (true)'),
                         ('insert', 'WITH CHECK (true)'),
                         ('update', 'USING (true) WITH CHECK (true)')):
        schema_editor.execute(
            f"CREATE POLICY std_{op}_{TABLA} ON {TABLA} FOR {op.upper()} "
            f"TO django_standard_role {clausula};"
        )


def revoke(apps, schema_editor):
    for op in ('select', 'insert', 'update'):
        schema_editor.execute(f"DROP POLICY IF EXISTS std_{op}_{TABLA} ON {TABLA};")
    schema_editor.execute(f"ALTER TABLE {TABLA} DISABLE ROW LEVEL SECURITY;")
    schema_editor.execute(f"REVOKE ALL PRIVILEGES ON TABLE {TABLA} FROM django_standard_role;")
    schema_editor.execute(f"REVOKE ALL PRIVILEGES ON SEQUENCE {SECUENCIA} FROM django_standard_role;")


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0069_perfil_usuario'),
    ]

    operations = [
        migrations.CreateModel(
            name='Factura',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('empresa', models.CharField(choices=[('fraba', 'Fraba'), ('soluciones', 'Soluciones')], max_length=20)),
                ('serie', models.CharField(max_length=20)),
                ('folio', models.CharField(max_length=40)),
                ('uuid', models.CharField(max_length=36, unique=True)),
                ('nombre', models.CharField(blank=True, default='', max_length=255)),
                ('rfc', models.CharField(blank=True, default='', max_length=20)),
                ('fecha_emision', models.DateField()),
                ('subtotal', models.DecimalField(decimal_places=2, max_digits=14)),
                ('iva', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('total', models.DecimalField(decimal_places=2, max_digits=14)),
                ('moneda', models.CharField(default='MXN', max_length=5)),
                ('estado', models.CharField(choices=[('activa', 'Activa'), ('cancelada', 'Cancelada')], default='activa', max_length=10)),
                ('cobrada', models.BooleanField(default=False)),
                ('created_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('maniobra', models.ForeignKey(blank=True, db_constraint=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='facturas', to='api.maniobra')),
            ],
            options={
                'ordering': ['-fecha_emision', '-id'],
                'managed': True,
                'indexes': [models.Index(fields=['serie', 'folio'], name='api_factura_serie_3f1d2a_idx')],
            },
        ),
        migrations.RunPython(grant, reverse_code=revoke),
    ]
