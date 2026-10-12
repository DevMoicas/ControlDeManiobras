"""Erratas de destino en maniobras (usuario, 2026-10-12).

El filtro de rutas ya agrupa lo que solo cambia de formato (dashboards.clave_ruta),
pero no puede saber que MONTEREY es MONTERREY: eso se corrige en el dato. La
lista sale del `ver` contra producción del 2026-10-12 (5 maniobras; los reportes
de viaje no tenían ninguna). SILAO, GTO = SILAO lo confirmó el usuario.
"""
from django.db import migrations

ERRATAS = {
    'MONTEREY': 'MONTERREY',
    'SAN LUI POTOSI': 'SAN LUIS POTOSI',
    'SILAO, GTO': 'SILAO',
    'CUATITLAN IZCALLI': 'CUAUTITLAN IZCALLI',
}


def corregir(apps, schema_editor):
    # using= explicito: sin el, el router manda las escrituras a 'standard' y el
    # migrate se queda colgado esperando el bloqueo de su propia transaccion.
    alias = schema_editor.connection.alias
    for modelo in ('Maniobra', 'ReporteViaje'):
        filas = apps.get_model('api', modelo).objects.using(alias)
        for mal, bien in ERRATAS.items():
            filas.filter(destino=mal).update(destino=bien)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0077_maniobra_vacio_no_aplica'),
    ]

    # Sin vuelta atras: ya no se distingue que fila tenia la errata.
    operations = [
        migrations.RunPython(corregir, migrations.RunPython.noop),
    ]
