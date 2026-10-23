"""Facturas en blanco de los servicios viejos (usuario, 2026-10-23).

Sale del diagnóstico en prod (diagnostico_facturas.py): 13 facturas que no
salían en Facturación. No las bloqueaba el folio repetido, sino:

  1. Quemada y entregada con el mismo No. Factura (copia del Excel): la factura
     se quedó en la quemada y la entregada tenía una fila en blanco. Se pasa a
     la entregada y se borra el No. Factura de la quemada.
  2. Una factura que cobró dos servicios: se queda ligada al primero y el otro
     ya no tiene fila en blanco; Facturación lo muestra al lado (comparte_con).
     Es la regla nueva de `sincronizar_facturas`, aplicada a lo que ya hay.
  3. Maniobras sin folio pero con No. Factura (capturadas así o de la carga
     histórica): nunca tuvieron fila. Se crea, o se liga su XML si llegó suelto.
     Solo aquí: lo nuevo sigue naciendo al asignar el folio.

Los ids son los de prod; en otra base no coinciden y el paso 1 no hace nada.
"""
from datetime import date

from django.db import migrations
from django.db.models import Sum
from django.utils import timezone

QUIEN = 'migracion_0088'

# (folio, quemada, entregada, facturas): del diagnóstico del 2026-10-23.
DE_QUEMADA_A_ENTREGADA = [
    ('N-2192', 4875, 4876, [('SEF', '407')]),
    ('R-2236', 4483, 4905, [('SEF', '436'), ('SEF', '440'), ('SEF', '441')]),
]


def arreglar(apps, schema_editor):
    from api.facturacion import EMPRESA_DE_SERIE, facturas_de_no_factura
    from api.models import Gasto as GastoVivo

    # using= explícito: sin él el router manda las escrituras a 'standard' y el
    # migrate se cuelga esperando su propia transacción.
    alias = schema_editor.connection.alias
    Factura = apps.get_model('api', 'Factura').objects.using(alias)
    Maniobra = apps.get_model('api', 'Maniobra').objects.using(alias)
    # El modelo vivo: en el estado de migraciones Gasto no tiene `maniobra`.
    Gasto = GastoVivo.objects.using(alias)
    vacias = dict(serie='', uuid__isnull=True, fecha_cobro__isnull=True, clave_rastreo='')
    tocadas = set()

    # 1. De la quemada a la entregada.
    for folio, quemada, entregada, claves in DE_QUEMADA_A_ENTREGADA:
        if Maniobra.filter(id__in=[quemada, entregada], folio=folio).count() != 2:
            continue
        for serie, numero in claves:
            Factura.filter(maniobra_id=quemada, serie=serie, folio=numero).update(
                maniobra_id=entregada, updated_by=QUIEN, updated_at=timezone.now())
        Factura.filter(maniobra_id=entregada, **vacias).delete()
        Maniobra.filter(id=quemada).update(no_factura=None, updated_by=QUIEN, updated_at=timezone.now())
        tocadas |= {quemada, entregada}

    nombra = {m_id: (folio, folio_2, list(dict.fromkeys(facturas_de_no_factura(no_factura))))
              for m_id, folio, folio_2, no_factura in (
                  Maniobra.filter(fecha_pis__gte=date(2026, 1, 1))
                  .values_list('id', 'folio', 'folio_2', 'no_factura'))}
    for m_id, (folio, folio_2, claves) in nombra.items():
        if not claves:
            continue
        propias = set(Factura.filter(maniobra_id=m_id).exclude(serie='').values_list('serie', 'folio'))
        # 2. Todas las que nombra son de otra maniobra: fuera la fila en blanco.
        if not propias and all(Factura.filter(serie=s, folio=n).exclude(maniobra=None).exists()
                               for s, n in claves):
            Factura.filter(maniobra_id=m_id, **vacias).delete()
            continue
        # 3. Sin folio y sin filas: las de su No. Factura.
        if (folio or '').strip() or (folio_2 or '').strip() or Factura.filter(maniobra_id=m_id).exists():
            continue
        for serie, numero in claves:
            mismas = Factura.filter(serie=serie, folio=numero)
            suelta = mismas.filter(maniobra=None).first()
            if suelta:
                suelta.maniobra_id, suelta.updated_by = m_id, QUIEN
                suelta.save(update_fields=['maniobra', 'updated_by', 'updated_at'])
                tocadas.add(m_id)
            elif not mismas.exists():
                Factura.create(maniobra_id=m_id, serie=serie, folio=numero,
                               empresa=EMPRESA_DE_SERIE.get(serie, ''),
                               created_by=QUIEN, updated_by=QUIEN)

    # Igual que recalcular_ingresos: el ingreso es la suma de sus facturas activas.
    for m_id in tocadas:
        total = Factura.filter(maniobra_id=m_id, estado='activa').aggregate(t=Sum('total'))['t']
        Gasto.filter(maniobra_id=m_id).update(
            facturado=str(total) if total is not None else None,
            updated_by=QUIEN, updated_at=timezone.now())


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0087_compensacion'),
    ]

    operations = [
        migrations.RunPython(arreglar, migrations.RunPython.noop),
    ]
