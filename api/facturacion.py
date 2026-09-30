"""Facturación: carga del Excel, liga factura ↔ maniobra e ingresos en Gastos.

Fase 1 de docs/planes/PLAN_MODULO_FINANZAS.md (rama main). El número entre
paréntesis, p. ej. (P11), remite a la pregunta de PREGUNTAS_MODULO_FINANZAS.md
que lo decidió.
"""
import csv
import io
import re
import unicodedata
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .db_context import get_db_alias
from .models import Empleado, Factura, Gasto, Maniobra, PerfilUsuario

# ── Quién entra ──────────────────────────────────────────────────────────────
# Cerrado por defecto (P45, P64): staff o uno de estos cargos EXACTOS. Sin
# perfil, sin empleado, empleado borrado u otro cargo → fuera. Al revés que el
# plan de roles por cargo, que deja pasar: aquí se trata de dinero.
CARGOS_FACTURACION = {'COMERCIAL', 'DIRECTOR GENERAL', 'DIRECTOR OPERATIVO',
                      'DIRECTORA COMERCIAL'}


def puede_facturacion(usuario):
    if usuario.is_staff:
        return True
    try:
        empleado = usuario.perfil.empleado
    except (PerfilUsuario.DoesNotExist, Empleado.DoesNotExist):
        return False
    # strip/upper: empleados.cargo es texto libre editable a mano en pgAdmin.
    return bool(empleado) and (empleado.cargo or '').strip().upper() in CARGOS_FACTURACION


# ── Serie + folio ────────────────────────────────────────────────────────────
EMPRESA_DE_SERIE = {'SEF': 'soluciones', 'S': 'fraba'}  # P29, P61

_PIEZA = re.compile(r'^([A-Z]*)(\d+)$')


def _folio(valor):
    """'0456', 456, 456.0 → '456'. None si no es un número entero."""
    try:
        numero = Decimal(str(valor).strip())
    except InvalidOperation:
        return None
    if numero != numero.to_integral_value() or numero < 0:
        return None
    return str(int(numero))


def facturas_de_no_factura(texto):
    """Las (serie, folio) que nombra una celda No. Factura de Maniobras.

    'I 154/ 153' y 'I 154 // 153' → [('I', '154'), ('I', '153')]: la diagonal,
    una o dos, separa facturas que se suman (P2), y el trozo sin serie hereda la
    del anterior. Se ignoran mayúsculas, espacios y guiones (P6). Lo que no es
    serie + folio ('EFECTIVO', un '201' suelto) no nombra nada (P5).
    """
    facturas, serie = [], ''
    for trozo in (texto or '').split('/'):
        pieza = re.sub(r'[\s-]', '', trozo).upper()
        m = _PIEZA.match(pieza)
        if not m:
            continue
        serie = m.group(1) or serie
        if serie:
            facturas.append((serie, _folio(m.group(2))))
    return facturas


# ── Ingresos en Gastos (P58) ─────────────────────────────────────────────────
def recalcular_ingresos(maniobra_ids, usuario):
    """Gasto.facturado = suma de las facturas ACTIVAS ligadas a la maniobra.

    Solo se llama con maniobras cuya liga acaba de cambiar. Una que se queda sin
    facturas se queda en blanco: el importe que tenía era de las facturas que
    ya no son suyas. Una maniobra cuya liga no cambia no se toca, así que un
    ingreso escrito a mano antes de Facturación sigue ahí.
    """
    for maniobra_id in set(filter(None, maniobra_ids)):
        total = (Factura.objects.filter(maniobra_id=maniobra_id, estado='activa')
                 .aggregate(t=Sum('total'))['t'])
        # update() y no save(): save() recalcula gastos_totales, que no cambia.
        # updated_at a mano porque update() no dispara auto_now, y el refresco
        # automático de la tabla de Gastos mira esa columna.
        Gasto.objects.filter(maniobra_id=maniobra_id).update(
            facturado=str(total) if total is not None else None,
            updated_by=usuario, updated_at=timezone.now(),
        )


def religar_maniobra(maniobra, usuario):
    """Reaplica la liga tras guardar el No. Factura de una maniobra.

    Suelta las facturas que la celda ya no nombra y se queda las que nombra y
    están SIN ligar. Una factura ligada a otra maniobra no se le quita: con un
    número mal tecleado, robársela a la maniobra correcta sería un error
    silencioso. Una factura pertenece a una sola maniobra (P3).
    """
    nombradas = facturas_de_no_factura(maniobra.no_factura)
    filtro = Q(pk__in=[])
    for serie, folio in nombradas:
        filtro |= Q(serie=serie, folio=folio)

    soltadas = Factura.objects.filter(maniobra=maniobra).exclude(filtro).update(
        maniobra=None, updated_by=usuario)
    ligadas = Factura.objects.filter(filtro, maniobra__isnull=True).update(
        maniobra=maniobra, updated_by=usuario)
    if soltadas or ligadas:
        recalcular_ingresos([maniobra.pk], usuario)


# ── Lectura del archivo ──────────────────────────────────────────────────────
def _cabecera(texto):
    """' Fecha Emisión' → 'fecha emision'. Por nombre y no por posición: el
    ejemplo trae ' Serie' y ' Folio' con un espacio delante."""
    sin_acentos = unicodedata.normalize('NFKD', str(texto or ''))
    return ''.join(c for c in sin_acentos if not unicodedata.combining(c)).strip().lower()


COLUMNAS = {
    'tipo': 'tipo comprobante', 'nombre': 'nombre', 'rfc': 'rfc',
    'serie': 'serie', 'folio': 'folio', 'uuid': 'uuid',
    'fecha': 'fecha emision', 'subtotal': 'subtotal', 'iva': 'iva tras',
    'total': 'total', 'moneda': 'moneda',
}


def _filas(archivo):
    """Las filas del archivo como listas, cabecera incluida. xlsx, xls o csv (P12)."""
    nombre = (archivo.name or '').lower()
    if nombre.endswith('.xlsx'):
        hoja = load_workbook(archivo, read_only=True, data_only=True).worksheets[0]
        return [list(f) for f in hoja.iter_rows(values_only=True)]
    if nombre.endswith('.xls'):
        import xlrd  # solo aquí: es la única vía que lo necesita
        libro = xlrd.open_workbook(file_contents=archivo.read())
        hoja = libro.sheet_by_index(0)
        return [[xlrd.xldate_as_datetime(c.value, libro.datemode)
                 if c.ctype == xlrd.XL_CELL_DATE else c.value
                 for c in hoja.row(i)] for i in range(hoja.nrows)]
    if nombre.endswith('.csv'):
        crudo = archivo.read()
        try:
            texto = crudo.decode('utf-8-sig')
        except UnicodeDecodeError:
            texto = crudo.decode('latin-1')  # el export de Excel en Windows
        return list(csv.reader(io.StringIO(texto)))
    raise ValueError('Formato no admitido: sube un .xlsx, .xls o .csv.')


def _fecha(valor):
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    texto = str(valor or '').strip()
    for formato, largo in (('%Y-%m-%d', 10), ('%d/%m/%Y', 10)):
        try:
            return datetime.strptime(texto[:largo], formato).date()
        except ValueError:
            pass
    return None


def _importe(valor, obligatorio=True):
    if valor in (None, ''):
        return None if obligatorio else Decimal('0')
    try:
        return Decimal(str(valor).replace(',', '').strip()).quantize(Decimal('0.01'))
    except InvalidOperation:
        return None


def cargar_facturas(archivo, usuario):
    """Crea las facturas del archivo. Devuelve el resumen para la pantalla.

    La carga no se detiene por una fila mala (P11): se salta y se apunta en
    `omitidas`. Todo el archivo va en una transacción: o entra lo válido
    entero, o nada si revienta algo inesperado.
    """
    filas = _filas(archivo)
    if not filas:
        raise ValueError('El archivo está vacío.')
    indice = {_cabecera(c): i for i, c in enumerate(filas[0])}
    faltan = [c for c in COLUMNAS.values() if c not in indice]
    if faltan:
        raise ValueError('Faltan columnas: ' + ', '.join(faltan) + '.')

    existentes = set(Factura.objects.values_list('uuid', flat=True))
    nuevas, omitidas = [], []
    for n, fila in enumerate(filas[1:], start=2):  # n = fila de Excel
        dato = {k: (fila[indice[c]] if indice[c] < len(fila) else None)
                for k, c in COLUMNAS.items()}
        if all(v in (None, '') for v in dato.values()):
            continue

        def omitir(motivo):
            omitidas.append({'fila': n, 'serie': str(dato['serie'] or '').strip(),
                             'folio': str(dato['folio'] or '').strip(), 'motivo': motivo})

        serie = str(dato['serie'] or '').strip().upper()
        uuid = str(dato['uuid'] or '').strip().lower()
        tipo = str(dato['tipo'] or '').strip().upper()
        moneda = str(dato['moneda'] or '').strip().upper()
        folio, fecha = _folio(dato['folio']), _fecha(dato['fecha'])
        subtotal, total = _importe(dato['subtotal']), _importe(dato['total'])
        iva = _importe(dato['iva'], obligatorio=False)

        if tipo != 'I':  # P66: solo comprobantes de ingreso
            omitir(f'Tipo de comprobante {tipo or "vacío"}, no es de ingreso')
        elif moneda != 'MXN':  # P17
            omitir(f'Moneda {moneda or "vacía"}, solo se admite MXN')
        elif serie not in EMPRESA_DE_SERIE:
            omitir(f'Serie desconocida: {serie or "vacía"}')
        elif not uuid:
            omitir('Sin UUID')
        elif uuid in existentes:  # P11: en la base o antes en el mismo archivo
            omitir('UUID repetido')
        elif not folio or not fecha or subtotal is None or total is None or iva is None:
            omitir('Folio, fecha o importes ilegibles')
        else:
            existentes.add(uuid)
            nuevas.append(Factura(
                empresa=EMPRESA_DE_SERIE[serie], serie=serie, folio=folio, uuid=uuid,
                nombre=str(dato['nombre'] or '').strip()[:255],
                rfc=str(dato['rfc'] or '').strip()[:20],
                fecha_emision=fecha, subtotal=subtotal, iva=iva, total=total,
                created_by=usuario, updated_by=usuario,
            ))

    # La liga: cada factura nueva busca la maniobra cuyo No. Factura la nombra.
    # Si la nombran dos maniobras no se elige a ciegas: queda pendiente de ligar
    # y se avisa, porque una factura es de una sola maniobra (P3).
    nombrada_por = {}
    for m_id, texto in (Maniobra.objects.exclude(no_factura__isnull=True)
                        .exclude(no_factura='').values_list('id', 'no_factura')):
        for clave in facturas_de_no_factura(texto):
            nombrada_por.setdefault(clave, set()).add(m_id)
    ambiguas = []
    for f in nuevas:
        candidatas = nombrada_por.get((f.serie, f.folio), set())
        if len(candidatas) == 1:
            f.maniobra_id = next(iter(candidatas))
        elif candidatas:
            ambiguas.append({'serie': f.serie, 'folio': f.folio,
                             'maniobras': sorted(candidatas)})

    with transaction.atomic(using=get_db_alias()):
        Factura.objects.bulk_create(nuevas)
        recalcular_ingresos([f.maniobra_id for f in nuevas], usuario)

    return {
        'creadas': len(nuevas),
        'ligadas': sum(1 for f in nuevas if f.maniobra_id),
        'omitidas': omitidas,
        'ambiguas': ambiguas,
    }


# ── API ──────────────────────────────────────────────────────────────────────
class FacturaSerializer(serializers.ModelSerializer):
    # El folio de la maniobra ligada (P15). El UUID no sale nunca (P16).
    maniobra_folio = serializers.CharField(source='maniobra.folio', default=None,
                                           read_only=True)

    class Meta:
        model = Factura
        fields = ['id', 'empresa', 'serie', 'folio', 'nombre', 'rfc',
                  'fecha_emision', 'subtotal', 'iva', 'total', 'estado',
                  'cobrada', 'maniobra', 'maniobra_folio']
        read_only_fields = fields


class FacturaViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Solo lectura más tres acciones. Nadie edita una factura: se carga del
    Excel y como mucho se cancela (P14, P65)."""
    serializer_class = FacturaSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # `acceso` responde a cualquiera: es como el frontend sabe si pintar
        # la tarjeta. Todo lo demás, solo quien puede.
        if self.action != 'acceso' and not puede_facturacion(request.user):
            raise PermissionDenied('Facturación es solo para dirección, comercial y administradores.')

    def get_queryset(self):
        qs = Factura.objects.select_related('maniobra')
        estado = self.request.query_params.get('estado')
        return qs.filter(estado=estado) if estado in ('activa', 'cancelada') else qs

    @action(detail=False, methods=['get'])
    def acceso(self, request):
        return Response({'ver': puede_facturacion(request.user),
                         'cancelar': request.user.is_staff})

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def cargar(self, request):
        archivo = request.FILES.get('archivo')
        if not archivo:
            return Response({'detail': 'Falta el archivo.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            resumen = cargar_facturas(archivo, request.user.username)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(resumen, status=status.HTTP_201_CREATED)

    def _cambiar_estado(self, request, estado):
        if not request.user.is_staff:  # P65: cancelar solo staff
            raise PermissionDenied('Solo un administrador puede cancelar o reactivar facturas.')
        factura = self.get_object()
        with transaction.atomic(using=get_db_alias()):
            factura.estado = estado
            factura.updated_by = request.user.username
            factura.save(update_fields=['estado', 'updated_by', 'updated_at'])
            recalcular_ingresos([factura.maniobra_id], request.user.username)
        return Response(self.get_serializer(factura).data)

    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        return self._cambiar_estado(request, 'cancelada')

    # ponytail: reactivar no se pidió; existe para deshacer una cancelación por error.
    @action(detail=True, methods=['post'])
    def reactivar(self, request, pk=None):
        return self._cambiar_estado(request, 'activa')
