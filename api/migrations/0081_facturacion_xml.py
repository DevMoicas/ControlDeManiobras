"""Facturación por XML y Auditoría del Excel (usuario, 2026-10-15).

`api_factura` pasa a ser FACTURACIÓN: nace vacía al asignar el folio, la liga el
No. Factura y la rellena el XML. El Excel se va a una tabla nueva,
`api_facturaexcel` (AUDITORÍA), que solo compara.

Datos — "copiar del Excel", decidido con el usuario:
  1. Auditoría arranca con copia exacta de lo cargado hasta hoy.
  2. Lo cargado se queda en Facturación tal cual, así Cobrar, Dashboards e
     Ingresos no cambian. `cobrada` = sí pasa a fecha_cobro = HOY (no hay fecha
     real que copiar).
  3. Cada maniobra con folio recibe sus filas: una por factura de su No.
     Factura que no exista aún, o una vacía si no tiene ninguna.

GRANT del rol estándar sobre api_factura. Ahora escriben con él:
  - quien guarda una maniobra (crear la fila, su serie y folio, borrar la vacía
    que sobra);
  - los cargos de Finanzas al subir el XML (los datos) y al capturar el cobro.
Sigue sin UPDATE de `estado`: cancelar es solo staff, que va como superusuario.
DELETE solo de filas VACÍAS: la política lo exige en la base, no solo en el
código (`_vacia` en facturacion.py), así que un fallo en una vista no puede
borrar una factura con XML o con cobro. Mismo criterio que la 0038 y la 0040.

api_facturaexcel no tiene GRANT: solo la usa staff.
"""
from django.db import migrations, models

TABLA = 'api_factura'
COLUMNAS_STD = ('serie, folio, empresa, uuid, nombre, rfc, fecha_emision, subtotal, iva, '
                'total, moneda, no_identificacion, descripcion, fecha_cobro, clave_rastreo')
COPIADAS = ('empresa, serie, folio, uuid, nombre, rfc, fecha_emision, subtotal, iva, total, '
            'moneda, estado, created_by, created_at, updated_by, updated_at')


def copiar(apps, schema_editor):
    from api.facturacion import EMPRESA_DE_SERIE, facturas_de_no_factura

    # SQL y no ORM para conservar created_at (auto_now_add lo pisaría).
    schema_editor.execute(f"INSERT INTO api_facturaexcel ({COPIADAS}) SELECT {COPIADAS} FROM {TABLA};")
    schema_editor.execute(
        f"UPDATE {TABLA} SET fecha_cobro = (now() AT TIME ZONE 'America/Mexico_City')::date "
        "WHERE cobrada;")

    # using= explícito: sin él, el router manda las escrituras a 'standard' y el
    # migrate se cuelga esperando su propia transacción.
    alias = schema_editor.connection.alias
    Factura = apps.get_model('api', 'Factura')
    Maniobra = apps.get_model('api', 'Maniobra')
    tomadas = set(Factura.objects.using(alias).values_list('serie', 'folio'))
    con_filas = set(Factura.objects.using(alias).exclude(maniobra=None)
                    .values_list('maniobra_id', flat=True))
    nuevas = []
    for m_id, folio, folio_2, no_factura in (Maniobra.objects.using(alias)
                                             .values_list('id', 'folio', 'folio_2', 'no_factura')):
        if not ((folio or '').strip() or (folio_2 or '').strip()):
            continue
        tiene = m_id in con_filas
        for serie, numero in dict.fromkeys(facturas_de_no_factura(no_factura)):
            if (serie, numero) in tomadas:
                continue  # ya cargada, o de otra maniobra: no se duplica
            tomadas.add((serie, numero))
            nuevas.append(Factura(maniobra_id=m_id, serie=serie, folio=numero,
                                  empresa=EMPRESA_DE_SERIE.get(serie, ''),
                                  created_by='migracion_0081', updated_by='migracion_0081'))
            tiene = True
        if not tiene:
            nuevas.append(Factura(maniobra_id=m_id, created_by='migracion_0081',
                                  updated_by='migracion_0081'))
    Factura.objects.using(alias).bulk_create(nuevas)


def descopiar(apps, schema_editor):
    schema_editor.execute(f"DELETE FROM {TABLA} WHERE uuid IS NULL;")


def grant(apps, schema_editor):
    schema_editor.execute(f"GRANT UPDATE ({COLUMNAS_STD}) ON TABLE {TABLA} TO django_standard_role;")
    schema_editor.execute(f"GRANT DELETE ON TABLE {TABLA} TO django_standard_role;")
    schema_editor.execute(
        f"CREATE POLICY std_delete_{TABLA} ON {TABLA} FOR DELETE TO django_standard_role "
        "USING (uuid IS NULL AND fecha_cobro IS NULL AND clave_rastreo = '');")


def revoke(apps, schema_editor):
    schema_editor.execute(f"DROP POLICY IF EXISTS std_delete_{TABLA} ON {TABLA};")
    schema_editor.execute(f"REVOKE DELETE ON TABLE {TABLA} FROM django_standard_role;")
    schema_editor.execute(f"REVOKE UPDATE ({COLUMNAS_STD}) ON TABLE {TABLA} FROM django_standard_role;")
    # La 0070 y la 0072 vuelven a dar lo suyo: las columnas de la liga y `cobrada`.
    schema_editor.execute(
        f"GRANT UPDATE (maniobra_id, updated_by, updated_at, cobrada) ON TABLE {TABLA} "
        "TO django_standard_role;")


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0080_vacaciones_compartidas_gasto_fijo_tipo'),
    ]

    operations = [
        migrations.AddField(
            model_name='factura',
            name='clave_rastreo',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='factura',
            name='descripcion',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='factura',
            name='fecha_cobro',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='factura',
            name='no_identificacion',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AlterField(
            model_name='factura',
            name='empresa',
            field=models.CharField(blank=True, choices=[('fraba', 'Fraba'), ('soluciones', 'Soluciones')], default='', max_length=20),
        ),
        migrations.AlterField(
            model_name='factura',
            name='fecha_emision',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='factura',
            name='folio',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AlterField(
            model_name='factura',
            name='serie',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AlterField(
            model_name='factura',
            name='subtotal',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AlterField(
            model_name='factura',
            name='total',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AlterField(
            model_name='factura',
            name='uuid',
            field=models.CharField(blank=True, max_length=36, null=True, unique=True),
        ),
        migrations.CreateModel(
            name='FacturaExcel',
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
                ('created_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.CharField(blank=True, editable=False, max_length=150, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-fecha_emision', '-id'],
                'managed': True,
                'indexes': [models.Index(fields=['serie', 'folio'], name='api_factura_serie_a3dff6_idx')],
            },
        ),
        migrations.RunPython(copiar, reverse_code=descopiar),
        migrations.RunPython(grant, reverse_code=revoke),
    ]
