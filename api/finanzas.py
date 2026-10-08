"""Cuentas por pagar, gastos fijos y gastos financieros.

Fase 4 de docs/planes/PLAN_MODULO_FINANZAS.md (rama main). El número entre
paréntesis, p. ej. (P34), remite a PREGUNTAS_MODULO_FINANZAS.md.

Quién entra: el mismo grupo que Facturación (P45, P56): staff o los cuatro
cargos. Cancelar y borrar, solo staff.
"""
from datetime import date, datetime, timedelta

from django.db.models import Exists, OuterRef, Q, Value
from django.db.models.functions import Coalesce, Trim, Upper
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .facturacion import ZONA_OPERACION, _dinero, puede_finanzas
from .models import (CapturaMensual, CuentaPorPagar, Factura, GastoFijo, GastoFijoPago,
                     Maniobra, UnidadTercero)

# Fletes y locales aparecen desde aquí (decidido con el usuario el 2026-09-30,
# igual que Facturación, P4): el histórico viejo no se llena de filas vacías.
INICIO_CUENTAS_POR_PAGAR = date(2026, 8, 1)
TRANSPORTISTA_PROPIO = 'FRABA CONTAINER'  # la regla de _es_de_fraba en views.py (P32)


def _hoy():
    return datetime.now(ZONA_OPERACION).date()


def _mes(texto):
    """'2026-08' (o '2026-08-15') → date(2026, 8, 1). None si no se entiende."""
    try:
        anio, mes = str(texto or '')[:7].split('-')
        return date(int(anio), int(mes), 1)
    except ValueError:
        return None


def _sumar_meses(mes, n):
    total = mes.year * 12 + (mes.month - 1) + n
    return date(total // 12, total % 12 + 1, 1)


def _clave_mes(mes):
    return mes.strftime('%Y-%m')


class SoloFinanzasMixin:
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not puede_finanzas(request.user):
            raise PermissionDenied('Finanzas es solo para dirección, comercial y administradores.')

    def _usuario(self):
        return self.request.user.username


class SoloStaffBorraMixin:
    """Aparte de SoloFinanzasMixin a propósito: con `destroy` definido el router
    expone DELETE, y las cuentas por pagar no se borran nunca (P55)."""

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:  # P56: borrar solo staff
            raise PermissionDenied('Solo un administrador puede borrar.')
        return super().destroy(request, *args, **kwargs)


# ── Cuentas por pagar ────────────────────────────────────────────────────────
def maniobras_de_terceros(origen):
    """Las maniobras que generan una cuenta por pagar de ese origen.

    Flete: el viaje lo hizo un tercero, transportista distinto de FRABA
    CONTAINER y de vacío (P32, la misma regla de _es_de_fraba). Local: sus
    placas PIS están en el catálogo de unidades de terceros (P33) y ese tercero
    SOLO lo sacó de puerto: si el dueño de las placas PIS es el mismo
    transportista del viaje, el servicio es un flete y va solo a Fletes
    (usuario, 2026-10-08). Una placa dada de alta a nombre de varios terceros
    cuenta como de cualquiera de ellos. En todo, mayúsculas y espacios no
    cuentan: son textos escritos a mano.
    """
    qs = (Maniobra.objects.filter(fecha_pis__gte=INICIO_CUENTAS_POR_PAGAR)
          .annotate(t=Upper(Trim(Coalesce('transportista', Value(''))))))
    if origen == 'flete':
        return qs.exclude(t__in=['', TRANSPORTISTA_PROPIO])
    placas = {p.strip().upper() for p in UnidadTercero.objects.values_list('placas', flat=True) if p}
    del_mismo_transportista = (UnidadTercero.objects
                               .annotate(up=Upper(Trim('placas')),
                                         ut=Upper(Trim(Coalesce('transportista', Value('')))))
                               .filter(up=OuterRef('p'), ut=OuterRef('t'))
                               .exclude(ut=''))
    return (qs.annotate(p=Upper(Trim(Coalesce('placas_pis', Value('')))))
            .filter(p__in=placas)
            .exclude(Exists(del_mismo_transportista)))


def empresa_de_maniobra(maniobra_id):
    """La empresa de la factura de VENTA ligada (P61); None si no tiene."""
    return (Factura.objects.filter(maniobra_id=maniobra_id, estado='activa')
            .values_list('empresa', flat=True).first())


class CuentaPorPagarSerializer(serializers.ModelSerializer):
    dias_credito = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    empresa = serializers.ChoiceField(choices=Factura.EMPRESAS, required=False, allow_blank=True)
    vencimiento = serializers.SerializerMethodField()

    class Meta:
        model = CuentaPorPagar
        fields = ['id', 'origen', 'maniobra', 'empresa', 'no_factura', 'total', 'concepto',
                  'fecha', 'dias_credito', 'vencimiento', 'estado', 'pagada']
        # estado y pagada tienen su acción: cancelar es solo staff (P55, P56).
        read_only_fields = ['estado', 'pagada']

    def get_vencimiento(self, cuenta):
        return cuenta.fecha + timedelta(days=cuenta.dias_credito)  # naturales (P36)

    def validate_dias_credito(self, valor):
        return valor or 0

    def validate(self, datos):
        if self.instance:
            # La maniobra y el origen se fijan al crear: moverlos convertiría la
            # cuenta de un viaje en la de otro sin dejar rastro.
            for campo in ('origen', 'maniobra'):
                if campo in datos and datos[campo] != getattr(self.instance, campo):
                    raise serializers.ValidationError({campo: 'No se puede cambiar.'})
            return datos
        origen, maniobra = datos.get('origen'), datos.get('maniobra')
        if origen == 'mantenimiento' and maniobra:
            raise serializers.ValidationError({'maniobra': 'Mantenimiento no va ligado a una maniobra (P35).'})
        if origen in ('flete', 'local'):
            if not maniobra:
                raise serializers.ValidationError({'maniobra': 'Falta la maniobra.'})
            if not maniobras_de_terceros(origen).filter(pk=maniobra.pk).exists():
                raise serializers.ValidationError({'maniobra': f'Esa maniobra no es un {origen} de tercero.'})
            if CuentaPorPagar.objects.filter(origen=origen, maniobra=maniobra, estado='activa').exists():
                raise serializers.ValidationError(
                    {'maniobra': 'Esa maniobra ya tiene su cuenta. Edítala, o cancélala para capturar otra.'})
        if not datos.get('empresa'):
            # Sin empresa elegida: la de la factura de venta ligada (P61).
            datos['empresa'] = empresa_de_maniobra(maniobra.pk) if maniobra else None
            if not datos['empresa']:
                raise serializers.ValidationError({'empresa': 'Elige Fraba o Soluciones.'})
        return datos

    def update(self, instancia, datos):
        # Solo las columnas tocadas: el rol estándar tiene UPDATE por columna y
        # un save() completo intentaría escribir también `estado`.
        # origen y maniobra llegan iguales o ya los rechazó validate().
        datos = {k: v for k, v in datos.items() if k not in ('origen', 'maniobra')}
        for campo, valor in datos.items():
            setattr(instancia, campo, valor)
        instancia.save(update_fields=[*datos, 'updated_by', 'updated_at'])
        return instancia


class CuentaPorPagarViewSet(SoloFinanzasMixin, mixins.ListModelMixin, mixins.CreateModelMixin,
                            mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                            viewsets.GenericViewSet):
    """Sin DELETE: se cancela (P55)."""
    serializer_class = CuentaPorPagarSerializer
    pagination_class = None  # decenas al mes; la pantalla las pinta todas

    def get_queryset(self):
        qs = CuentaPorPagar.objects.all()
        origen = self.request.query_params.get('origen')
        estado = self.request.query_params.get('estado')
        if origen:
            qs = qs.filter(origen=origen)
        return qs.filter(estado=estado) if estado in ('activa', 'cancelada') else qs

    def perform_create(self, serializer):
        serializer.save(created_by=self._usuario(), updated_by=self._usuario())

    def perform_update(self, serializer):
        serializer.instance.updated_by = self._usuario()
        serializer.save()

    @action(detail=False, methods=['get'])
    def maniobras(self, request):
        """Las maniobras de Fletes o Locales, cada una con su cuenta activa (o
        None si aún no se captura) y la empresa que saldría por su factura."""
        origen = request.query_params.get('origen')
        if origen not in ('flete', 'local'):
            return Response({'detail': 'origen debe ser flete o local.'}, status=status.HTTP_400_BAD_REQUEST)
        # La que ya tiene su cuenta activa sigue saliendo aunque la regla haya
        # cambiado: si no, la cuenta seguiría siendo costo sin que nadie la vea.
        con_cuenta = CuentaPorPagar.objects.filter(origen=origen, estado='activa').values('maniobra_id')
        maniobras = list(Maniobra.objects.filter(
            Q(pk__in=maniobras_de_terceros(origen).values('pk')) | Q(pk__in=con_cuenta),
        ).order_by('-fecha_pis', '-id'))
        ids = [m.pk for m in maniobras]
        cuentas = {c.maniobra_id: c for c in CuentaPorPagar.objects.filter(
            origen=origen, estado='activa', maniobra_id__in=ids)}
        empresas = dict(Factura.objects.filter(maniobra_id__in=ids, estado='activa')
                        .order_by('-id').values_list('maniobra_id', 'empresa'))
        return Response([{
            'maniobra': m.pk, 'folio': m.folio, 'transportista': m.transportista,
            'terminal': m.terminal, 'fecha_pis': m.fecha_pis, 'placas_pis': m.placas_pis,
            'tipo_servicio': m.tipo_servicio, 'tipo': m.tipo, 'peso': m.peso,
            'contenedor': m.contenedor, 'referencia': m.referencia,
            'origen_ruta': m.origen, 'destino': m.destino,
            'empresa_sugerida': empresas.get(m.pk),
            'cuenta': self.get_serializer(cuentas[m.pk]).data if m.pk in cuentas else None,
        } for m in maniobras])

    @action(detail=True, methods=['post'])
    def pagada(self, request, pk=None):
        valor = {True: True, 'true': True, False: False, 'false': False}.get(request.data.get('pagada'))
        if valor is None:
            return Response({'detail': 'pagada debe ser true o false.'}, status=status.HTTP_400_BAD_REQUEST)
        cuenta = self.get_object()
        cuenta.pagada, cuenta.updated_by = valor, self._usuario()
        cuenta.save(update_fields=['pagada', 'updated_by', 'updated_at'])
        return Response(self.get_serializer(cuenta).data)

    def _estado(self, request, estado):
        if not request.user.is_staff:  # P55, P56
            raise PermissionDenied('Solo un administrador puede cancelar o reactivar.')
        cuenta = self.get_object()
        cuenta.estado, cuenta.updated_by = estado, self._usuario()
        cuenta.save(update_fields=['estado', 'updated_by', 'updated_at'])
        return Response(self.get_serializer(cuenta).data)

    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        return self._estado(request, 'cancelada')

    @action(detail=True, methods=['post'])
    def reactivar(self, request, pk=None):
        return self._estado(request, 'activa')


# ── Gastos fijos ─────────────────────────────────────────────────────────────
def falta_pago(periodicidad, meses_pagados, mes):
    """Si a `mes` le toca pago y no lo tiene (P54, P68, P71).

    Toca si es el último mes con monto + k × periodicidad. Un concepto sin
    ningún pago anterior toca todos los meses.
    """
    if mes in meses_pagados:
        return False
    anteriores = [m for m in meses_pagados if m < mes]
    if not anteriores:
        return True
    ultimo = max(anteriores)
    distancia = (mes.year - ultimo.year) * 12 + (mes.month - ultimo.month)
    return distancia % periodicidad == 0


class GastoFijoSerializer(serializers.ModelSerializer):
    class Meta:
        model = GastoFijo
        fields = ['id', 'empresa', 'concepto', 'dia_pago', 'monto', 'periodicidad']

    def validate_dia_pago(self, valor):
        if valor is not None and not 1 <= valor <= 31:
            raise serializers.ValidationError('Del 1 al 31.')
        return valor


class GastoFijoViewSet(SoloFinanzasMixin, SoloStaffBorraMixin, viewsets.ModelViewSet):
    serializer_class = GastoFijoSerializer
    pagination_class = None
    queryset = GastoFijo.objects.all()

    def perform_create(self, serializer):
        serializer.save(created_by=self._usuario(), updated_by=self._usuario())

    def perform_update(self, serializer):
        serializer.save(updated_by=self._usuario())

    @action(detail=False, methods=['get'])
    def rejilla(self, request):
        """Seis meses desde `desde` (P30): cada concepto con lo pagado por mes
        y los meses que tocaba pagar y siguen vacíos, hasta el mes en curso."""
        desde = _mes(request.query_params.get('desde'))
        if not desde:
            return Response({'detail': 'desde debe ser AAAA-MM.'}, status=status.HTTP_400_BAD_REQUEST)
        meses = [_sumar_meses(desde, i) for i in range(6)]
        mes_actual = _hoy().replace(day=1)
        qs = GastoFijo.objects.prefetch_related('pagos')
        empresa = request.query_params.get('empresa')
        if empresa:
            qs = qs.filter(empresa=empresa)
        filas = []
        for g in qs:
            pagados = {p.mes: p.monto for p in g.pagos.all() if p.monto is not None}
            alta = g.created_at.date().replace(day=1)
            filas.append({
                **GastoFijoSerializer(g).data,
                'pagos': {_clave_mes(m): (_dinero(pagados[m]) if m in pagados else None) for m in meses},
                # Solo meses ya llegados y desde el alta: un gasto dado de alta
                # en septiembre no "debe" julio.
                'faltan': [_clave_mes(m) for m in meses
                           if alta <= m <= mes_actual and falta_pago(g.periodicidad, set(pagados), m)],
            })
        return Response({'meses': [_clave_mes(m) for m in meses], 'gastos': filas})

    @action(detail=True, methods=['post'])
    def pago(self, request, pk=None):
        """Escribe una celda. Monto vacío = no pagado (la fila queda en NULL)."""
        mes = _mes(request.data.get('mes'))
        if not mes:
            return Response({'detail': 'mes debe ser AAAA-MM.'}, status=status.HTTP_400_BAD_REQUEST)
        crudo = request.data.get('monto')
        campo = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0, allow_null=True)
        monto = campo.run_validation(None if crudo in (None, '') else crudo)
        pago, _ = GastoFijoPago.objects.update_or_create(
            gasto_fijo=self.get_object(), mes=mes,
            defaults={'monto': monto, 'updated_by': self._usuario()})
        return Response({'mes': _clave_mes(mes), 'monto': None if pago.monto is None else _dinero(pago.monto)})


# ── Gastos financieros: capturas mensuales ───────────────────────────────────
class CapturaMensualSerializer(serializers.ModelSerializer):
    mes = serializers.CharField()

    class Meta:
        model = CapturaMensual
        fields = ['id', 'mes', 'tipo', 'concepto', 'monto']

    def validate_mes(self, valor):
        mes = _mes(valor)
        if not mes:
            raise serializers.ValidationError('AAAA-MM.')
        return mes

    def to_representation(self, instancia):
        datos = super().to_representation(instancia)
        datos['mes'] = _clave_mes(instancia.mes)
        return datos


class CapturaMensualViewSet(SoloFinanzasMixin, SoloStaffBorraMixin, viewsets.ModelViewSet):
    serializer_class = CapturaMensualSerializer
    pagination_class = None

    def get_queryset(self):
        qs = CapturaMensual.objects.all()
        mes = _mes(self.request.query_params.get('mes'))
        return qs.filter(mes=mes) if mes else qs

    def perform_create(self, serializer):
        serializer.save(created_by=self._usuario(), updated_by=self._usuario())

    def perform_update(self, serializer):
        serializer.save(updated_by=self._usuario())
