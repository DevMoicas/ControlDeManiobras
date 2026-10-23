"""Compensación (usuario, 2026-10-22): abonos de clientes a sus facturas.

  1. api_banco con los bancos de México (solo los lista Compensación).
  2. api_factura.abonado. Las que ya estaban cobradas a mano nacen con
     abonado = total: siguen cobradas y con saldo 0, sin abonos ficticios.
  3. api_pago: el pago del comprobante del banco (fecha, monto, clave, banco,
     ordenante), del CSV o a mano. Su monto es la Cobranza semanal. Clave de
     rastreo única entre los pagos activos.
  4. api_abono: lo que un pago abona a UNA factura; un pago, varias facturas.

Qué recibe el rol estándar (los cargos de Finanzas escriben con él):
  api_banco    SELECT.
  api_pago,    SELECT, INSERT. Sin UPDATE ni DELETE: cancelar es solo staff,
  api_abono    que va como superusuario (P65).
  api_factura  UPDATE (abonado). fecha_cobro y clave_rastreo ya los tenía (0081)
               y ahora solo los pone el abono.
"""
import django.db.models.deletion
from django.db import migrations, models

# ponytail: lista fija de bancos de México; si falta alguno, otra migración.
BANCOS = [
    'ABC Capital', 'Actinver', 'Afirme', 'Autofin', 'Banamex', 'Banca Mifel', 'BanCoppel',
    'Banco Azteca', 'Banco Base', 'Banco del Bienestar', 'Banco Covalto', 'Banco Inmobiliario Mexicano',
    'Banco S3 Caceis', 'Bancomext', 'Banjército', 'Banobras', 'Bank of America', 'Bank of China',
    'Bankaool', 'Banorte', 'Banregio', 'Bansí', 'BanBajío', 'Barclays', 'BBVA México', 'CIBanco',
    'Compartamos', 'Consubanco', 'Forjadores', 'HSBC', 'Hey Banco', 'ICBC', 'Inbursa', 'Intercam',
    'Invex', 'J.P. Morgan', 'KEB Hana', 'Mercado Pago', 'Mizuho', 'Monex', 'MUFG', 'Multiva',
    'Nafin', 'Nu México', 'Sabadell', 'Santander', 'Scotiabank', 'Shinhan', 'STP',
    'Ve por Más', 'Volkswagen Bank',
]


TABLAS_RLS = (('api_banco', ('select',)), ('api_pago', ('select', 'insert')),
              ('api_abono', ('select', 'insert')))


def datos(apps, schema_editor):
    alias = schema_editor.connection.alias
    apps.get_model('api', 'Banco').objects.using(alias).bulk_create(
        [apps.get_model('api', 'Banco')(nombre=n) for n in BANCOS])
    apps.get_model('api', 'Factura').objects.using(alias).filter(
        fecha_cobro__isnull=False, total__isnull=False).update(abonado=models.F('total'))


def grant(apps, schema_editor):
    ex = schema_editor.execute
    ex("GRANT SELECT ON TABLE api_banco TO django_standard_role;")
    for tabla in ('api_pago', 'api_abono'):
        ex(f"GRANT SELECT, INSERT ON TABLE {tabla} TO django_standard_role;")
        ex(f"GRANT USAGE, SELECT ON SEQUENCE {tabla}_id_seq TO django_standard_role;")
    ex("GRANT UPDATE (abonado) ON TABLE api_factura TO django_standard_role;")
    for tabla, ops in TABLAS_RLS:
        ex(f"ALTER TABLE {tabla} ENABLE ROW LEVEL SECURITY;")
        for op in ops:
            clausula = 'USING (true)' if op == 'select' else 'WITH CHECK (true)'
            ex(f"CREATE POLICY std_{op}_{tabla} ON {tabla} FOR {op.upper()} "
               f"TO django_standard_role {clausula};")


def revoke(apps, schema_editor):
    ex = schema_editor.execute
    for tabla, ops in TABLAS_RLS:
        for op in ops:
            ex(f"DROP POLICY IF EXISTS std_{op}_{tabla} ON {tabla};")
        ex(f"ALTER TABLE {tabla} DISABLE ROW LEVEL SECURITY;")
        ex(f"REVOKE ALL PRIVILEGES ON TABLE {tabla} FROM django_standard_role;")
    for tabla in ('api_pago', 'api_abono'):
        ex(f"REVOKE ALL PRIVILEGES ON SEQUENCE {tabla}_id_seq FROM django_standard_role;")
    ex("REVOKE UPDATE (abonado) ON TABLE api_factura FROM django_standard_role;")


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0086_ligar_facturas_sueltas'),
    ]

    operations = [
        migrations.CreateModel(
            name='Banco',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=80, unique=True)),
            ],
            options={
                'ordering': ['nombre'],
                'managed': True,
            },
        ),
        migrations.AddField(
            model_name='factura',
            name='abonado',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.CreateModel(
            name='Pago',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fecha', models.DateField()),
                ('monto', models.DecimalField(decimal_places=2, max_digits=14)),
                ('clave_rastreo', models.CharField(blank=True, default='', max_length=50)),
                ('banco', models.CharField(max_length=80)),
                ('rfc', models.CharField(blank=True, default='', max_length=20)),
                ('nombre', models.CharField(blank=True, default='', max_length=255)),
                ('estado', models.CharField(choices=[('activa', 'Activa'), ('cancelada', 'Cancelada')], default='activa', max_length=10)),
                ('created_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-fecha', '-id'],
                'managed': True,
                'constraints': [models.UniqueConstraint(condition=models.Q(('estado', 'activa'), models.Q(('clave_rastreo', ''), _negated=True)), fields=('clave_rastreo',), name='pago_clave_rastreo_unica')],
            },
        ),
        migrations.CreateModel(
            name='Abono',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('monto', models.DecimalField(decimal_places=2, max_digits=14)),
                ('parcialidad', models.PositiveSmallIntegerField(default=1)),
                ('estado', models.CharField(choices=[('activa', 'Activa'), ('cancelada', 'Cancelada')], default='activa', max_length=10)),
                ('created_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('factura', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='abonos', to='api.factura')),
                ('pago', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='abonos', to='api.pago')),
            ],
            options={
                'ordering': ['factura', 'parcialidad', 'id'],
                'managed': True,
            },
        ),
        migrations.RunPython(datos, migrations.RunPython.noop),
        migrations.RunPython(grant, reverse_code=revoke),
    ]
