"""Liga las facturas del Excel que quedaron sueltas (usuario, 2026-10-19).

La 0081 no ligó las facturas ya cargadas (las daba por "tomadas") y la 0085
solo rehízo enero a junio. Las maniobras de 2026 cuyo No. Factura nombra una
factura sin maniobra se quedaron "pendiente de ligar" hasta que alguien las
volviera a guardar (caso A-2255, S 1894 // S 1906 // S 1931). Aquí se hace lo
que haría `sincronizar_facturas` al guardarlas: ligar la suelta y quitar la
fila vacía que sobra.

Una factura que nombran dos maniobras no se liga a ciegas (P3): se queda
suelta y se arregla corrigiendo el No. Factura.
"""
from collections import Counter
from datetime import date

from django.db import migrations
from django.db.models import Sum
from django.utils import timezone

QUIEN = 'migracion_0086'


def ligar(apps, schema_editor):
    from api.facturacion import facturas_de_no_factura
    from api.models import Gasto as GastoVivo

    # using= explícito: sin él el router manda las escrituras a 'standard' y el
    # migrate se cuelga esperando su propia transacción.
    alias = schema_editor.connection.alias
    Factura = apps.get_model('api', 'Factura').objects.using(alias)
    # El modelo vivo: en el estado de migraciones Gasto no tiene `maniobra`.
    Gasto = GastoVivo.objects.using(alias)
    Maniobra = apps.get_model('api', 'Maniobra').objects.using(alias)

    sueltas = {(f.serie, f.folio): f for f in Factura.filter(maniobra__isnull=True).exclude(serie='')}
    nombra = {m_id: list(dict.fromkeys(facturas_de_no_factura(no_factura)))
              for m_id, no_factura in (Maniobra.filter(fecha_pis__gte=date(2026, 1, 1))
                                       .values_list('id', 'no_factura'))}
    veces = Counter(clave for claves in nombra.values() for clave in claves)

    con_dinero = set()
    for m_id, claves in nombra.items():
        ligo = False
        for clave in claves:
            f = sueltas.get(clave)
            if f is None or veces[clave] > 1:
                continue
            f.maniobra_id, f.updated_by = m_id, QUIEN
            f.save(using=alias, update_fields=['maniobra', 'updated_by', 'updated_at'])
            ligo = True
            if f.total is not None:
                con_dinero.add(m_id)
        if ligo:  # la fila por emitir que tenía en su lugar ya sobra
            Factura.filter(maniobra_id=m_id, serie='', uuid__isnull=True,
                           fecha_cobro__isnull=True, clave_rastreo='').delete()

    # Igual que recalcular_ingresos: el ingreso es la suma de sus facturas activas.
    for m_id in con_dinero:
        total = Factura.filter(maniobra_id=m_id, estado='activa').aggregate(t=Sum('total'))['t']
        Gasto.filter(maniobra_id=m_id).update(
            facturado=str(total) if total is not None else None,
            updated_by=QUIEN, updated_at=timezone.now())


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0085_facturacion_desde_enero'),
    ]

    operations = [
        migrations.RunPython(ligar, migrations.RunPython.noop),
    ]
