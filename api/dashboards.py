"""Dashboards de Finanzas (Fase 6 de docs/planes/PLAN_MODULO_FINANZAS.md).

Solo lectura: agregan lo que las fases 1–5 guardan. Cada acción devuelve las
cifras ya calculadas; la pantalla solo pinta. La comparación contra otro
periodo (P43) es la misma consulta con otro rango.

Reglas que valen en todos (plan, Fase 6):
- Costo de una maniobra = gastos_totales de Gastos + urea de sus reportes de
  viaje (P38, P60). Las reparaciones ya están dentro de gastos_totales (Fase
  5). Los costos extra NO cuentan (P59).
- Venta = Total de las facturas ACTIVAS, con IVA, por fecha de emisión (D2, P9).
- Costo de ventas por mes de entrega de mercancía (P18). Se usa
  maniobras.fecha_entrega_mercancia, que es `date`; la copia de gastos es
  texto con formatos mezclados y el sistema la sincroniza desde la maniobra.
- Servicio: tipo_servicio, con la heurística vieja de respaldo (P1).
- Local = origen y destino iguales sin acentos ni mayúsculas (P39).
"""
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .facturacion import (ZONA_OPERACION, _dinero, cobranza_semanal, principal_de,
                          puede_finanzas, tramo, vencimiento)
from .finanzas import falta_pago
from .models import (CapturaMensual, CargaCombustible, CuentaPorPagar, Factura, Gasto,
                     GastoFijo, GastoFijoPago, Maniobra, NominaEmpleado, fecha_de_ingreso)

SERVICIOS = ('sencillo', 'full', 'carga_suelta')
SIN_CLIENTE = 'Sin cliente asignado'   # dirección sin principal (P48)
SIN_LIGAR = 'Pendiente de ligar'       # factura sin maniobra (P7)


# ── Utilidades ───────────────────────────────────────────────────────────────
def normalizar(texto):
    sin_acentos = unicodedata.normalize('NFKD', str(texto or ''))
    return ''.join(c for c in sin_acentos if not unicodedata.combining(c)).strip().upper()


def servicio_de(m):
    """tipo_servicio, o la heurística de los documentos para los registros
    viejos: 'CARGA SUELTA' en el contenedor manda, más de 12 caracteres es full
    (ver _generar_pdf_cta_port en views.py)."""
    tipo = (m.tipo_servicio or '').strip().lower()
    if tipo in SERVICIOS:
        return tipo
    contenedor = m.contenedor or ''
    if 'CARGA SUELTA' in contenedor.upper():
        return 'carga_suelta'
    return 'full' if len(contenedor) > 12 else 'sencillo'


def es_local(m):
    origen, destino = normalizar(m.origen), normalizar(m.destino)
    return bool(origen) and origen == destino


def ruta_de(m):
    return ' → '.join(p for p in ((m.origen or '').strip(), (m.destino or '').strip()) if p)


def _mes(d):
    return d.strftime('%Y-%m')


def _meses_entre(desde, hasta):
    meses, actual = [], desde.replace(day=1)
    while actual <= hasta:
        meses.append(_mes(actual))
        actual = (actual + timedelta(days=32)).replace(day=1)
    return meses


def _pct(parte, total):
    return str((parte / total * 100).quantize(Decimal('0.01'))) if total else None


class Filtros:
    """Los filtros de la P42, leídos de la query string. Cada dashboard usa
    solo los suyos: la pantalla manda los que ese dashboard enseña."""

    def __init__(self, params):
        hoy = datetime.now(ZONA_OPERACION).date()
        try:
            self.desde = date.fromisoformat(params.get('desde') or f'{hoy.year}-01-01')
            self.hasta = date.fromisoformat(params.get('hasta') or hoy.isoformat())
        except ValueError:
            raise ValidationError({'detail': 'desde y hasta van como AAAA-MM-DD.'})
        if self.desde > self.hasta:
            raise ValidationError({'detail': 'desde no puede ser posterior a hasta.'})
        self.cliente = params.get('cliente') or ''      # nombre del principal
        self.servicio = params.get('servicio') or ''
        self.unidad = normalizar(params.get('unidad'))
        self.operador = normalizar(params.get('operador'))
        self.ruta = normalizar(params.get('ruta'))
        self.destino = normalizar(params.get('destino'))
        self.maniobra = params.get('maniobra') or ''
        self.alcance = params.get('alcance') or ''      # local / foraneo
        self.empresa = params.get('empresa') or ''

    @property
    def de_maniobra(self):
        """Si hay algún filtro que solo una maniobra puede cumplir."""
        return any((self.cliente, self.servicio, self.unidad, self.operador, self.ruta,
                    self.destino, self.maniobra, self.alcance))

    def pasa(self, m, cliente_nombre):
        if self.cliente and cliente_nombre != self.cliente:
            return False
        if self.servicio and servicio_de(m) != self.servicio:
            return False
        if self.unidad and normalizar(m.unidad) != self.unidad:
            return False
        if self.operador and self.operador not in (normalizar(m.asignacion_operador_status),
                                                   normalizar(m.operador_2)):
            return False
        if self.ruta and normalizar(ruta_de(m)) != self.ruta:
            return False
        if self.destino and normalizar(m.destino) != self.destino:
            return False
        if self.maniobra and str(m.pk) != self.maniobra:
            return False
        if self.alcance and (self.alcance == 'local') != es_local(m):
            return False
        return True


def cliente_de_maniobra(m):
    direccion = m.cliente_fk
    principal = direccion.cliente_principal if direccion else None
    return principal.nombre if principal else SIN_CLIENTE


def costos_de(maniobras):
    """{maniobra_id: costo}. Gastos + urea de los reportes de sus dos folios."""
    ids = [m.pk for m in maniobras]
    gastos = dict(Gasto.objects.filter(maniobra_id__in=ids).values_list('maniobra_id', 'gastos_totales'))
    folios = {}
    for m in maniobras:
        for f in (m.folio, m.folio_2):
            if (f or '').strip():
                folios[f.strip()] = m.pk
    urea = defaultdict(Decimal)
    for folio, total in (CargaCombustible.objects.filter(reporte__folio__in=folios, total_urea__isnull=False)
                         .values_list('reporte__folio', 'total_urea')):
        urea[folios[folio]] += total
    return {m.pk: (gastos.get(m.pk) or Decimal('0')) + urea[m.pk] for m in maniobras}


def _facturas(filtros):
    return (Factura.objects.filter(estado='activa', fecha_emision__range=(filtros.desde, filtros.hasta))
            .select_related('maniobra__cliente_fk__cliente_principal'))


def _maniobras_por_entrega(filtros):
    return (Maniobra.objects.filter(fecha_entrega_mercancia__range=(filtros.desde, filtros.hasta))
            .select_related('cliente_fk__cliente_principal'))


def _opciones(maniobras):
    """Valores para los desplegables de filtros, de las maniobras del periodo."""
    def unicos(valores):
        return sorted({v.strip() for v in valores if (v or '').strip()})
    return {
        'unidades': unicos(m.unidad for m in maniobras),
        'operadores': unicos([m.asignacion_operador_status for m in maniobras]
                             + [m.operador_2 for m in maniobras]),
        'rutas': unicos(ruta_de(m) for m in maniobras),
        'destinos': unicos(m.destino for m in maniobras),
    }


# ── Los dashboards ───────────────────────────────────────────────────────────
def ventas_mensuales(f):
    """Dos dashboards en uno (D1): el dinero de las facturas por servicio, y
    cuántos servicios se vendieron por tipo.

    Los filtros de maniobra solo alcanzan a las facturas ligadas; con alguno
    puesto, las no ligadas van aparte como no asignado (P42). Una maniobra sin
    factura cuenta como servicio en el mes de su fecha PIS, con nota (P8).
    """
    meses = {k: {'mes': k, 'ventas': Decimal('0'), 'ventas_por_servicio': defaultdict(Decimal),
                 'servicios': 0, 'servicios_por_servicio': defaultdict(int), 'sin_factura': 0}
             for k in _meses_entre(f.desde, f.hasta)}
    no_asignado = Decimal('0')
    contadas = set()
    for fac in _facturas(f):
        fila = meses[_mes(fac.fecha_emision)]
        m = fac.maniobra if fac.maniobra_id else None
        if m is None:
            if f.de_maniobra:
                no_asignado += fac.total
                continue
            fila['ventas'] += fac.total
            fila['ventas_por_servicio']['no_asignado'] += fac.total
            continue
        if not f.pasa(m, cliente_de_maniobra(m)):
            continue
        servicio = servicio_de(m)
        fila['ventas'] += fac.total
        fila['ventas_por_servicio'][servicio] += fac.total
        if m.pk not in contadas:          # una maniobra con dos facturas es UN servicio
            contadas.add(m.pk)
            fila['servicios'] += 1
            fila['servicios_por_servicio'][servicio] += 1
    sin_factura = (Maniobra.objects.filter(fecha_pis__range=(f.desde, f.hasta), facturas__isnull=True)
                   .select_related('cliente_fk__cliente_principal'))
    for m in sin_factura:
        if f.pasa(m, cliente_de_maniobra(m)):
            fila = meses[_mes(m.fecha_pis)]
            fila['servicios'] += 1
            fila['servicios_por_servicio'][servicio_de(m)] += 1
            fila['sin_factura'] += 1
    return {
        'meses': [{**v, 'ventas': _dinero(v['ventas']),
                   'ventas_por_servicio': {k: _dinero(x) for k, x in v['ventas_por_servicio'].items()},
                   'servicios_por_servicio': dict(v['servicios_por_servicio'])}
                  for v in meses.values()],
        'no_asignado': _dinero(no_asignado),
        'opciones': _opciones(list(Maniobra.objects.filter(
            Q(fecha_pis__range=(f.desde, f.hasta)) | Q(facturas__fecha_emision__range=(f.desde, f.hasta))
        ).distinct())),
    }


def gastos_mensuales(f):
    """Costo de ventas por mes de entrega de mercancía (P18), por servicio."""
    maniobras = [m for m in _maniobras_por_entrega(f) if f.pasa(m, cliente_de_maniobra(m))]
    costos = costos_de(maniobras)
    meses = {k: {'mes': k, 'costo': Decimal('0'), 'por_servicio': defaultdict(Decimal)}
             for k in _meses_entre(f.desde, f.hasta)}
    for m in maniobras:
        fila = meses[_mes(m.fecha_entrega_mercancia)]
        fila['costo'] += costos[m.pk]
        fila['por_servicio'][servicio_de(m)] += costos[m.pk]
    return {
        'meses': [{'mes': v['mes'], 'costo': _dinero(v['costo']),
                   'por_servicio': {k: _dinero(x) for k, x in v['por_servicio'].items()}}
                  for v in meses.values()],
        'opciones': _opciones(list(_maniobras_por_entrega(f))),
    }


# El rol estándar no tiene permisos sobre la nómina (0067): ver nomina_administrativa.
ALIAS_NOMINA = 'default'


def nomina_administrativa(claves):
    """Nómina de los empleados con usuario staff (P63), por mes: sueldo semanal × 4.

    Cuatro semanas fijas por mes (usuario, 2026-10-06), lo que cierra la P62: no
    hay que decidir a qué mes va cada semana. Cuenta el mes entero, sin
    prorratear, si el empleado estuvo dado de alta algún día de él; sin fecha de
    ingreso legible cuenta siempre. El sueldo no tiene historial: cambiarlo
    mueve también los meses pasados (sin confirmar, ver PENDIENTE §13).

    ALIAS_NOMINA ('default', administrador): el rol estándar no tiene permisos sobre la nómina (0067)
    y los dashboards también los ven cargos de Finanzas que no son staff. Solo
    sale el TOTAL del mes, nunca un sueldo.
    """
    total = defaultdict(Decimal)
    filas = (NominaEmpleado.objects.using(ALIAS_NOMINA).select_related('empleado')
             .filter(sueldo__isnull=False, empleado__perfil__usuario__is_staff=True))
    for n in filas:
        ingreso, salida = fecha_de_ingreso(n.empleado), n.empleado.fecha_salida
        for k in claves:
            primero = date.fromisoformat(f'{k}-01')
            ultimo = (primero + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            if (ingreso is None or ingreso <= ultimo) and (salida is None or salida >= primero):
                total[k] += n.sueldo_mensual()
    return total


def utilidad_mensual(f):
    """La cascada del resumen, mes a mes (solo filtro de periodo, P42).

    Un mes con gastos fijos que tocaban y no se capturaron lleva `faltan_pagos`
    (P54).
    """
    claves = _meses_entre(f.desde, f.hasta)
    ventas = defaultdict(Decimal)
    for fac in _facturas(f):
        ventas[_mes(fac.fecha_emision)] += fac.total
    maniobras = list(_maniobras_por_entrega(f))
    costos = costos_de(maniobras)
    costo_ventas = defaultdict(Decimal)
    for m in maniobras:
        costo_ventas[_mes(m.fecha_entrega_mercancia)] += costos[m.pk]
    fijos = defaultdict(Decimal)
    for mes, monto in GastoFijoPago.objects.filter(
            mes__range=(f.desde.replace(day=1), f.hasta), monto__isnull=False).values_list('mes', 'monto'):
        fijos[_mes(mes)] += monto
    capturas = defaultdict(Decimal)
    for mes, tipo, monto in CapturaMensual.objects.filter(
            mes__range=(f.desde.replace(day=1), f.hasta)).values_list('mes', 'tipo', 'monto'):
        capturas[(_mes(mes), tipo)] += monto

    mes_actual = datetime.now(ZONA_OPERACION).date().replace(day=1)
    pagados = defaultdict(set)
    for gid, mes in GastoFijoPago.objects.filter(monto__isnull=False).values_list('gasto_fijo_id', 'mes'):
        pagados[gid].add(mes)
    gastos_fijos = list(GastoFijo.objects.all())
    nomina = nomina_administrativa(claves)

    filas = []
    for k in claves:
        primero = date.fromisoformat(f'{k}-01')
        bruta = ventas[k] - costo_ventas[k]
        comisiones = capturas[(k, 'comision')]
        operacional = bruta - (fijos[k] + comisiones + nomina[k])
        antes = operacional - capturas[(k, 'financiero')]
        filas.append({
            'mes': k,
            'ventas': _dinero(ventas[k]), 'costo_ventas': _dinero(costo_ventas[k]),
            'utilidad_bruta': _dinero(bruta),
            'gastos_fijos': _dinero(fijos[k]), 'comisiones': _dinero(comisiones),
            'nomina_administrativa': _dinero(nomina[k]),
            'utilidad_operacional': _dinero(operacional),
            'financieros': _dinero(capturas[(k, 'financiero')]),
            'utilidad_antes_impuestos': _dinero(antes),
            'impuestos': _dinero(capturas[(k, 'impuesto')]),
            'utilidad_neta': _dinero(antes - capturas[(k, 'impuesto')]),
            'faltan_pagos': primero <= mes_actual and any(
                g.created_at.date().replace(day=1) <= primero
                and falta_pago(g.periodicidad, pagados[g.pk], primero) for g in gastos_fijos),
        })
    return {'meses': filas}


def cuentas_por_cobrar(f):
    """Antigüedad de saldos (filtros: periodo por emisión y cliente, P42) y
    cobranza semanal del periodo."""
    hoy = datetime.now(ZONA_OPERACION).date()
    antiguedad = defaultdict(Decimal)
    fuera = defaultdict(Decimal)
    for fac in _facturas(f).filter(cobrada=False):
        p = principal_de(fac)
        nombre = p.nombre if p else (SIN_CLIENTE if fac.maniobra_id else SIN_LIGAR)
        if f.cliente and nombre != f.cliente:
            continue
        venc = vencimiento(fac)
        if venc is None:
            fuera[nombre] += fac.total
        else:
            antiguedad[tramo((hoy - venc).days)] += fac.total
    semanas = cobranza_semanal(f.desde, f.hasta)
    if f.cliente:
        # cobranza_semanal no filtra por cliente: se rehace aquí con el filtro.
        por_semana = defaultdict(Decimal)
        for fac in _facturas(f):
            p = principal_de(fac)
            if (p.nombre if p else SIN_CLIENTE) == f.cliente:
                lunes = fac.fecha_emision - timedelta(days=fac.fecha_emision.weekday())
                por_semana[lunes] += fac.total
        semanas = [{'semana': k, 'total': _dinero(v)} for k, v in sorted(por_semana.items())]
    return {
        'antiguedad': {k: _dinero(antiguedad[k]) for k in ('por_vencer', '0_30', '31_60', '61_90', 'mas_90')},
        'fuera_de_antiguedad': _dinero(sum(fuera.values(), Decimal('0'))),
        'semanas': semanas,
    }


def cuentas_por_pagar(f):
    """Por origen, lo pendiente y lo pagado del periodo (por fecha de la
    factura), filtrable por empresa (P42). Canceladas fuera."""
    hoy = datetime.now(ZONA_OPERACION).date()
    qs = CuentaPorPagar.objects.filter(estado='activa', fecha__range=(f.desde, f.hasta))
    if f.empresa:
        qs = qs.filter(empresa=f.empresa)
    por_origen = {o: {'por_pagar': Decimal('0'), 'pagado': Decimal('0'), 'vencido': Decimal('0')}
                  for o, _ in CuentaPorPagar.ORIGENES}
    meses = {k: Decimal('0') for k in _meses_entre(f.desde, f.hasta)}
    for c in qs:
        o = por_origen[c.origen]
        if c.pagada:
            o['pagado'] += c.total
        else:
            o['por_pagar'] += c.total
            if c.fecha + timedelta(days=c.dias_credito) < hoy:
                o['vencido'] += c.total
        meses[_mes(c.fecha)] += c.total
    return {
        'por_origen': {k: {x: _dinero(y) for x, y in v.items()} for k, v in por_origen.items()},
        'meses': [{'mes': k, 'total': _dinero(v)} for k, v in meses.items()],
    }


def ventas_por_cliente(f):
    """% de cada cliente principal sobre las ventas del periodo (resumen, P47).
    Agrupa por el cliente del catálogo ligado a la maniobra, no por el texto."""
    totales = defaultdict(Decimal)
    for fac in _facturas(f):
        p = principal_de(fac)
        totales[p.nombre if p else (SIN_CLIENTE if fac.maniobra_id else SIN_LIGAR)] += fac.total
    total = sum(totales.values(), Decimal('0'))
    filas = sorted(({'cliente': k, 'total': v} for k, v in totales.items()), key=lambda x: -x['total'])
    if f.cliente:
        filas = [x for x in filas if x['cliente'] == f.cliente]
    return {'total': _dinero(total),
            'clientes': [{'cliente': x['cliente'], 'total': _dinero(x['total']),
                          'porcentaje': _pct(x['total'], total)} for x in filas]}


def ventas_por_servicio(f):
    """Ventas por servicio, partidas en local y foráneo (resumen, P39)."""
    celdas = defaultdict(Decimal)
    no_asignado = Decimal('0')
    for fac in _facturas(f):
        if not fac.maniobra_id:
            no_asignado += fac.total
            continue
        m = fac.maniobra
        servicio, alcance = servicio_de(m), ('local' if es_local(m) else 'foraneo')
        if (f.servicio and servicio != f.servicio) or (f.alcance and alcance != f.alcance):
            continue
        celdas[(servicio, alcance)] += fac.total
    return {
        'servicios': [{'servicio': s, 'local': _dinero(celdas[(s, 'local')]),
                       'foraneo': _dinero(celdas[(s, 'foraneo')]),
                       'total': _dinero(celdas[(s, 'local')] + celdas[(s, 'foraneo')])}
                      for s in SERVICIOS if not f.servicio or s == f.servicio],
        'no_asignado': _dinero(no_asignado),
    }


def _operaciones(f):
    """Maniobras del periodo (por entrega) que pasan los filtros, con su
    ingreso (facturas activas ligadas, de cualquier fecha) y su costo."""
    maniobras = [m for m in _maniobras_por_entrega(f) if f.pasa(m, cliente_de_maniobra(m))]
    costos = costos_de(maniobras)
    ingresos = dict(Factura.objects.filter(estado='activa', maniobra_id__in=[m.pk for m in maniobras])
                    .values('maniobra_id').annotate(t=Sum('total')).values_list('maniobra_id', 't'))
    return maniobras, costos, ingresos


def costos_por_unidad(f):
    """Costo por tracto (P38), filtrable por unidad, viaje, operador y destino."""
    maniobras, costos, _ = _operaciones(f)
    por_unidad = defaultdict(lambda: {'viajes': 0, 'costo': Decimal('0')})
    for m in maniobras:
        u = por_unidad[(m.unidad or '').strip() or 'Sin unidad']
        u['viajes'] += 1
        u['costo'] += costos[m.pk]
    return {
        'unidades': sorted(({'unidad': k, 'viajes': v['viajes'], 'costo': _dinero(v['costo']),
                             'costo_promedio': _dinero(v['costo'] / v['viajes'])}
                            for k, v in por_unidad.items()), key=lambda x: -Decimal(x['costo'])),
        'viajes': [{'maniobra': m.pk, 'folio': m.folio, 'unidad': m.unidad, 'destino': m.destino,
                    'costo': _dinero(costos[m.pk])} for m in maniobras],
        'opciones': _opciones(list(_maniobras_por_entrega(f))),
    }


def rentabilidad(f):
    """Ingreso / costo × 100 por maniobra (P37): 200 % es ganar el doble de lo
    gastado. Sin costo no hay división: null."""
    maniobras, costos, ingresos = _operaciones(f)
    filas, total_i, total_c = [], Decimal('0'), Decimal('0')
    for m in maniobras:
        ingreso, costo = ingresos.get(m.pk) or Decimal('0'), costos[m.pk]
        total_i += ingreso
        total_c += costo
        filas.append({'maniobra': m.pk, 'folio': m.folio, 'cliente': cliente_de_maniobra(m),
                      'ingreso': _dinero(ingreso), 'costo': _dinero(costo),
                      'rentabilidad': _pct(ingreso, costo)})
    return {'total_ingreso': _dinero(total_i), 'total_costo': _dinero(total_c),
            'rentabilidad': _pct(total_i, total_c), 'operaciones': filas,
            'opciones': _opciones(list(_maniobras_por_entrega(f)))}


# ── API ──────────────────────────────────────────────────────────────────────
DASHBOARDS = {
    'ventas': ventas_mensuales, 'gastos': gastos_mensuales, 'utilidad': utilidad_mensual,
    'cuentas-por-cobrar': cuentas_por_cobrar, 'cuentas-por-pagar': cuentas_por_pagar,
    'ventas-por-cliente': ventas_por_cliente, 'ventas-por-servicio': ventas_por_servicio,
    'costos-por-unidad': costos_por_unidad, 'rentabilidad': rentabilidad,
}


class DashboardViewSet(viewsets.ViewSet):
    """GET /api/dashboards/<nombre>/?desde=&hasta=&… Mismo acceso que Finanzas."""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not puede_finanzas(request.user):
            raise PermissionDenied('Finanzas es solo para dirección, comercial y administradores.')

    def retrieve(self, request, pk=None):
        funcion = DASHBOARDS.get(pk)
        if funcion is None:
            return Response({'detail': 'Dashboard desconocido.'}, status=404)
        return Response(funcion(Filtros(request.query_params)))
