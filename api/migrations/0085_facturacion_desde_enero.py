"""Facturación desde enero de 2026, no desde julio (usuario, 2026-10-16).

La 0082 borró las filas vacías de las maniobras anteriores a julio. Aquí se
rehacen las de enero a junio de 2026 con la regla de `sincronizar_facturas`:
una fila por factura del No. Factura (o se liga su XML si llegó suelto; si es
de otra maniobra no se toca) y, si no queda ninguna, una vacía. Solo maniobras
con folio y sin filas: las que conservaron filas con datos ya están bien.

No se llama a `sincronizar_facturas` directamente porque usa los modelos vivos
y el router mandaría las escrituras a 'standard', colgando el migrate.
"""
from datetime import date

from django.db import migrations
from django.db.models import Sum
from django.utils import timezone

QUIEN = 'migracion_0085'


def rehacer(apps, schema_editor):
    from api.facturacion import EMPRESA_DE_SERIE, facturas_de_no_factura

    alias = schema_editor.connection.alias
    Factura = apps.get_model('api', 'Factura').objects.using(alias)
    Gasto = apps.get_model('api', 'Gasto').objects.using(alias)
    Maniobra = apps.get_model('api', 'Maniobra').objects.using(alias)

    con_filas = set(Factura.exclude(maniobra=None).values_list('maniobra_id', flat=True))
    ligadas = set()  # maniobras con un XML recién ligado: su ingreso cambia
    for m_id, folio, folio_2, no_factura in (
            Maniobra.filter(fecha_pis__gte=date(2026, 1, 1), fecha_pis__lt=date(2026, 7, 1))
            .exclude(id__in=con_filas)
            .values_list('id', 'folio', 'folio_2', 'no_factura')):
        if not ((folio or '').strip() or (folio_2 or '').strip()):
            continue
        tiene = False
        for serie, numero in dict.fromkeys(facturas_de_no_factura(no_factura)):
            mismas = Factura.filter(serie=serie, folio=numero)
            suelta = mismas.filter(maniobra__isnull=True).first()
            if suelta:
                suelta.maniobra_id, suelta.updated_by = m_id, QUIEN
                suelta.save(update_fields=['maniobra', 'updated_by', 'updated_at'])
                if suelta.total is not None:
                    ligadas.add(m_id)
                tiene = True
            elif not mismas.exists():
                Factura.create(maniobra_id=m_id, serie=serie, folio=numero,
                               empresa=EMPRESA_DE_SERIE.get(serie, ''),
                               created_by=QUIEN, updated_by=QUIEN)
                tiene = True
        if not tiene:
            Factura.create(maniobra_id=m_id, created_by=QUIEN, updated_by=QUIEN)

    # Igual que recalcular_ingresos: el ingreso es la suma de sus facturas activas.
    for m_id in ligadas:
        total = Factura.filter(maniobra_id=m_id, estado='activa').aggregate(t=Sum('total'))['t']
        Gasto.filter(maniobra_id=m_id).update(
            facturado=str(total) if total is not None else None,
            updated_by=QUIEN, updated_at=timezone.now())


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0084_reporte_diesel_llegada'),
    ]

    operations = [
        migrations.RunPython(rehacer, migrations.RunPython.noop),
    ]
