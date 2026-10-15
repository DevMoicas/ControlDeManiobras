"""Facturación solo desde las maniobras de julio de 2026 (usuario, 2026-10-15).

La 0081 creó una fila vacía para CADA maniobra con folio, incluidas las de
años anteriores, y eso obligaría a subir el XML de cada factura vieja. Se
borran las filas VACÍAS (sin XML, sin cobro, sin clave: la misma condición que
`_vacia` y la política de la 0081) de maniobras con fecha PIS anterior a julio
de 2026 o sin ella. Las que tienen datos se quedan: alimentan Cobrar,
Dashboards e Ingresos y cuadran con Auditoría.

Sin vuelta atrás de datos: lo borrado eran huecos sin información.
"""
from datetime import date

from django.db import migrations


def borrar_antiguas(apps, schema_editor):
    Factura = apps.get_model('api', 'Factura')
    # using= explícito: sin él el router manda la escritura a 'standard' y el
    # migrate se cuelga esperando su propia transacción.
    (Factura.objects.using(schema_editor.connection.alias)
     .filter(uuid__isnull=True, fecha_cobro__isnull=True, clave_rastreo='')
     .exclude(maniobra__fecha_pis__gte=date(2026, 7, 1))
     .delete())


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0081_facturacion_xml'),
    ]

    operations = [
        migrations.RunPython(borrar_antiguas, migrations.RunPython.noop),
    ]
