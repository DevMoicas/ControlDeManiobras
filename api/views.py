import base64
import re
import django_filters
from rest_framework import viewsets, mixins
from .models import Tracto, Remolque, Chofer, Maniobra, Gasto, Vacio, Empleado, Patio, Cliente, Origen, Destino, FotoRegistro, MovimientoLocal, Transportista, Cargo, UnidadTercero, OperadorTercero, DispositivoConfianza, DIAS_CONFIANZA, Folio, CostoExtra, Pendiente, PENDIENTE_VIDA, LETRAS_CICLO, BATCH_SIZE, FORMATO_CODIGO, START_NUMERO
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from .Serializers import TractoSerializer, RemolqueSerializer, ChoferSerializer, ManiobraSerializer, GastoSerializer, VacioSerializer, EmpleadoSerializer, PatioSerializer, ClienteSerializer, OrigenSerializer, DestinoSerializer, MovimientoLocalSerializer, TransportistaSerializer, CargoSerializer, UnidadTerceroSerializer, OperadorTerceroSerializer, FolioSerializer, CostoExtraSerializer, PendienteSerializer
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView
from .Serializers import CustomTokenObtainPairSerializer, DispositivoConfianzaSerializer
from . import confianza
from .db_context import get_db_alias
from rest_framework.filters import OrderingFilter, SearchFilter
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.response import Response
from rest_framework import status
import os
import subprocess
import tempfile
import logging
import io
from datetime import date
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.db.models import Q
from django.http import FileResponse, HttpResponse
from openpyxl import load_workbook
from PIL import Image
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


# ── Documentos de viaje ──────────────────────────────────────────────────────
_TEMPLATE_PATH = (
    settings.BASE_DIR / 'api' / 'documentos' / 'templates' / 'CTA_PTE_FORMATO.xlsx'
)
_TEMPLATE_PATH_TERCEROS = (
    settings.BASE_DIR / 'api' / 'documentos' / 'templates' / 'FORMATO_CTA_PTE_TERCEROS.xlsx'
)
# NOTA: el template ya trae su logo. openpyxl SOLO conserva las imágenes al guardar
# si Pillow está instalado — por eso Pillow es dependencia obligatoria aquí.

_MESES_ES = {
    1:  'ENERO',
    2:  'FEBRERO',
    3:  'MARZO',
    4:  'ABRIL',
    5:  'MAYO',
    6:  'JUNIO',
    7:  'JULIO',
    8:  'AGOSTO',
    9:  'SEPTIEMBRE',
    10: 'OCTUBRE',
    11: 'NOVIEMBRE',
    12: 'DICIEMBRE',
}

# ponytail: el binario varía por SO/PATH — se prueban en orden hasta encontrar uno.
# libreoffice/soffice cubren Linux y Windows-con-PATH; la ruta completa cubre la
# instalación estándar de Windows cuando no está en el PATH. Si en prod (Linux) el
# binario tiene otra ruta, agregarla aquí.
_LIBREOFFICE_BINS = [
    'libreoffice',
    'soffice',
    r'C:\Program Files\LibreOffice\program\soffice.exe',
]


def _mayus(valor):
    """Todo lo que se escribe al Excel va en MAYÚSCULAS. Números/None se dejan igual."""
    return valor.upper() if isinstance(valor, str) else valor


_CHARS_FORMULA = ('=', '+', '-', '@')


def _sin_formula(valor):
    """Anti-inyección de fórmulas en Excel (CWE-1236): si un texto empieza por
    = + - o @, Excel/LibreOffice lo interpretaría como fórmula. Se antepone una
    comilla (') para forzar que sea texto. Es no-op en números/None y en textos
    que no empiezan por esos caracteres, así que un documento con datos legítimos
    queda idéntico; solo cambia el input malicioso."""
    if isinstance(valor, str) and valor[:1] in _CHARS_FORMULA:
        return "'" + valor
    return valor


def _xlsx_a_pdf(xlsx_path: str, output_dir: str) -> str:
    """
    Convierte un archivo .xlsx a PDF usando LibreOffice headless.
    Devuelve la ruta al PDF generado.
    Lanza Exception si LibreOffice retorna error.
    """
    env = os.environ.copy()
    env['HOME'] = output_dir   # LibreOffice necesita HOME para su perfil temporal

    result = None
    for binario in _LIBREOFFICE_BINS:
        try:
            result = subprocess.run(
                [
                    binario,
                    '--headless',
                    '--norestore',
                    '--convert-to', 'pdf',
                    '--outdir', output_dir,
                    xlsx_path,
                ],
                capture_output=True,
                timeout=60,
                env=env,
            )
            break
        except FileNotFoundError:
            continue

    if result is None:
        raise Exception(
            "LibreOffice no está instalado en el servidor (se buscó: "
            f"{', '.join(_LIBREOFFICE_BINS)})."
        )

    if result.returncode != 0:
        raise Exception(
            f"LibreOffice falló (código {result.returncode}): "
            f"{result.stderr.decode('utf-8', errors='replace')}"
        )

    pdf_name = os.path.splitext(os.path.basename(xlsx_path))[0] + '.pdf'
    pdf_path = os.path.join(output_dir, pdf_name)

    if not os.path.exists(pdf_path):
        raise Exception("LibreOffice no generó el archivo PDF esperado.")

    return pdf_path


_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def _responder_documento(wb, tmp_dir: str, basename: str, formato: str):
    """
    Guarda el workbook y devuelve un HttpResponse.
    formato == 'excel' → devuelve el .xlsx directo (sin convertir).
    cualquier otro valor → convierte a PDF con LibreOffice y lo devuelve.
    """
    xlsx_tmp = os.path.join(tmp_dir, f'{basename}.xlsx')
    wb.save(xlsx_tmp)

    if formato == 'excel':
        with open(xlsx_tmp, 'rb') as f:
            data = f.read()
        resp = HttpResponse(data, content_type=_XLSX_MIME)
        resp['Content-Disposition'] = f'attachment; filename="{basename}.xlsx"'
        return resp

    pdf_path = _xlsx_a_pdf(xlsx_tmp, tmp_dir)
    with open(pdf_path, 'rb') as f:
        pdf_bytes = f.read()
    resp = HttpResponse(pdf_bytes, content_type='application/pdf')
    resp['Content-Disposition'] = f'attachment; filename="{basename}.pdf"'
    return resp


def _concat_placas_remolques(placas: str, remolque_1: str, remolque_2: str) -> str:
    """
    Construye la cadena concatenada de placas y remolques.
    Formato:
      - Sin remolques:    "ABC-123"
      - Un remolque:      "ABC-123 / DEF-456"
      - Dos remolques:    "ABC-123 / DEF-456, GHI-789"
    """
    remolques = [r.strip() for r in [remolque_1, remolque_2] if r and r.strip()]
    if remolques:
        return f"{placas.strip()} / {', '.join(remolques)}"
    return placas.strip()


def _dividir_por_guion(segmento: str) -> tuple[str, str]:
    """
    Divide un segmento de texto en (parte_1, parte_2) usando '-' como separador.
    Si no hay '-', parte_2 queda vacía.
    Ej: "40 - 20" -> ("40", "20")   |   "40" -> ("40", "")
    """
    if '-' in segmento:
        izquierda, derecha = segmento.split('-', 1)
        return izquierda.strip(), derecha.strip()
    return segmento.strip(), ''


def _parsear_tipo(tipo_raw: str) -> tuple[str, str, str, str]:
    """
    Parsea el campo 'tipo' de Maniobra. El frontend garantiza el formato
    'IZQUIERDA / DERECHA' para registros nuevos (la diagonal es obligatoria
    y no editable en ManiobrasPage). Cada lado puede además tener un '-'
    interno para representar dos valores (ej. viajes full con dos tipos
    de contenedor distintos, o carga suelta con dos tipos de bulto).

    Ejemplos:
      "40 / HC"                      -> ("40", "",   "HC", "")
      "40 - 20 / HC - DC"            -> ("40", "20", "HC", "DC")
      "7 / PALLETS"                  -> ("7",  "",   "PALLETS", "")
      "9 - 14 / PALLETS - CARTONES"  -> ("9",  "14", "PALLETS", "CARTONES")
      "" o cualquier texto sin '/'   -> ("", "", "", "")  (registro viejo sin
                                          migrar: se trata como vacío, no error)

    Devuelve (numero_1, numero_2, letra_1, letra_2).
    """
    if not tipo_raw or '/' not in tipo_raw:
        return '', '', '', ''
    parte_izquierda, parte_derecha = tipo_raw.split('/', 1)
    numero_1, numero_2 = _dividir_por_guion(parte_izquierda)
    letra_1, letra_2   = _dividir_por_guion(parte_derecha)
    return numero_1, numero_2, letra_1, letra_2


def _es_carga_suelta(contenedor: str) -> bool:
    """
    True si la columna Contenedor de la maniobra contiene la palabra
    'CARGA SUELTA' (comparación tipo 'contains', no exige coincidencia exacta).
    """
    return 'CARGA SUELTA' in (contenedor or '').upper()


def _sumar_peso(peso_raw):
    """
    El campo peso puede traer dos cantidades separadas por '-' o '/', con o sin
    espacios (ej. "23412 - 22000", "8376/12117", "8376 / 12117"; carga suelta o
    full con dos pesos). Devuelve la suma numérica de las partes. Un solo valor
    se devuelve como número; si nada es numérico devuelve '' (celda en blanco,
    sin error).
    """
    partes = [p.strip() for p in re.split(r'[-/]', str(peso_raw)) if p.strip()]
    total = 0.0
    encontrado = False
    for p in partes:
        try:
            total += float(p)
            encontrado = True
        except (ValueError, TypeError):
            continue
    return total if encontrado else ''


def _validar_operador_vigente(nombre_operador):
    """
    Verifica que el operador (por nombre) no tenga licencia vencida.
    Devuelve (es_valido: bool, mensaje_error: str | None).
    Si el nombre no coincide con ningún chofer registrado, se permite
    (solo se bloquea si SÍ se encuentra el chofer Y su licencia está vencida).
    """
    if not nombre_operador:
        return True, None

    chofer = Chofer.objects.filter(nombre=nombre_operador).first()
    if not chofer:
        return True, None

    if chofer.fecha_vencimiento_licencia and chofer.fecha_vencimiento_licencia < date.today():
        return False, (
            f"No se puede asignar a {nombre_operador}: "
            f"su licencia venció el {chofer.fecha_vencimiento_licencia.strftime('%d/%m/%Y')}."
        )

    return True, None


def _generar_pdf_cta_port(request_data, template_path, nombre_archivo_pdf: str, formato: str = 'pdf'):
    """
    Lógica compartida para generar el PDF de la hoja 'CTA PORT FRABA CONTAINER'.
    La usan tanto DocumentoCtaPortView (Fraba Container) como
    DocumentoCtaPortTercerosView (Terceros) — ambos templates comparten
    EXACTAMENTE el mismo mapeo de celdas para esta hoja, solo cambia el
    archivo de template de origen y el nombre del PDF de salida.

    Devuelve:
      - HttpResponse con el PDF en caso de éxito.
      - rest_framework Response con status de error en caso de fallo.
    """
    # ── Leer datos del body (en MAYÚSCULAS para el Excel) ──────────────────
    folio       = request_data.get('folio', '').strip().upper()
    ccp         = request_data.get('ccp', '').strip().upper()
    origen      = request_data.get('origen', '').strip().upper()
    destino     = request_data.get('destino', '').strip().upper()

    # Datos del cliente
    cliente_nombre    = request_data.get('cliente_nombre', '').strip().upper()
    cliente_domicilio = request_data.get('cliente_domicilio', '').strip().upper()
    cliente_colonia   = request_data.get('cliente_colonia', '').strip().upper()
    cliente_ciudad    = request_data.get('cliente_ciudad', '').strip().upper()

    # Datos de la carga (auto-llenados desde maniobra via folio)
    tipo       = request_data.get('tipo', '').strip().upper()
    peso_raw   = request_data.get('peso', '')
    contenedor = request_data.get('contenedor', '').strip().upper()
    pedimento  = request_data.get('pedimento', '').strip().upper()
    referencia = request_data.get('referencia', '').strip().upper()

    # Datos de texto libre
    descripcion = request_data.get('descripcion', '').strip().upper()
    clave_sat   = request_data.get('clave_sat', '').strip().upper()

    # Fecha de expedición (manual, solo FRABA container; dd/MM/yyyy)
    fecha_expedicion = request_data.get('fecha_expedicion', '').strip()

    # Conductor y placas
    operador   = request_data.get('operador', '').strip().upper()
    placas     = request_data.get('placas', '').strip().upper()
    remolque_1 = request_data.get('remolque_1', '').strip().upper()
    remolque_2 = request_data.get('remolque_2', '').strip().upper()

    # Anti-inyección de fórmulas (CWE-1236) en los textos que van a celdas.
    # Se excluyen tipo/peso/fecha_expedicion: se parsean como número o tokens.
    (folio, ccp, origen, destino, cliente_nombre, cliente_domicilio,
     cliente_colonia, cliente_ciudad, contenedor, pedimento, referencia,
     descripcion, clave_sat, operador, placas, remolque_1, remolque_2) = map(
        _sin_formula,
        (folio, ccp, origen, destino, cliente_nombre, cliente_domicilio,
         cliente_colonia, cliente_ciudad, contenedor, pedimento, referencia,
         descripcion, clave_sat, operador, placas, remolque_1, remolque_2))

    # ── Validación mínima ──────────────────────────────────────────────────
    if not folio:
        return Response({'detail': 'El campo folio (Remisión) es requerido.'}, status=400)

    # ── Cálculos derivados ─────────────────────────────────────────────────
    remision_valor = f"{folio} / {ccp}" if ccp else folio

    # El tipo de servicio lo dictamina el botón "Tipo de Servicio" de la maniobra.
    # Los registros anteriores a ese campo llegan sin él: ahí se conserva la
    # heurística vieja (>12 caracteres = full, texto "CARGA SUELTA") para que sus
    # documentos salgan exactamente igual que antes del cambio.
    tipo_servicio = (request_data.get('tipo_servicio') or '').strip().lower()
    if tipo_servicio:
        es_carga_suelta = tipo_servicio == 'carga_suelta'
        es_full         = tipo_servicio == 'full'
    else:
        es_carga_suelta = _es_carga_suelta(contenedor)
        es_full         = len(contenedor) > 12
    numero_1, numero_2, letra_1, letra_2 = _parsear_tipo(tipo)

    # El conteo mira lo que se va a IMPRIMIR, no la etiqueta del servicio: los
    # campos de la carga son editables en el modal y un Full puede salir con un
    # solo contenedor (el otro viaja con otro operador). Si el tipo llega con un
    # solo par, es 1 CONTENEDOR — nunca "1 CONTENEDORES".
    # Acotado a quien manda tipo_servicio explícito: los registros anteriores a
    # ese campo entran en es_full por la heurística del contenedor largo y su
    # `tipo` puede traer un solo par, así que se les conserva el 2 de siempre.
    lleva_dos = es_full and (not tipo_servicio or numero_2 or letra_2)
    cantidad_label  = 2 if lleva_dos else 1
    tipo_label      = 'CONTENEDORES' if cantidad_label > 1 else 'CONTENEDOR'

    clave_sat_celda = f"CLAVE SAT:{clave_sat}" if clave_sat else ''

    peso_valor = _sumar_peso(peso_raw)

    concat_placas = _concat_placas_remolques(placas, remolque_1, remolque_2)

    # ── Abrir template y trabajar en directorio temporal ──────────────────
    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            wb = load_workbook(str(template_path))
            ws = wb['CTA PORT FRABA CONTAINER']

            # Remisión: J2 (celda superior del rango fusionado J2:J3)
            ws['J2'] = remision_valor

            # Fecha de expedición del documento: día numérico / mes en español / año
            _hoy = date.today()
            ws['H5'] = _hoy.day
            ws['I5'] = _MESES_ES[_hoy.month]
            ws['J5'] = _hoy.year

            # Origen y Destino
            ws['B6'] = origen
            ws['G6'] = destino

            # Datos del cliente
            ws['G7']  = cliente_nombre
            ws['G8']  = cliente_domicilio
            ws['G9']  = cliente_colonia
            ws['G10'] = cliente_ciudad

            # Tabla de bultos — full/sencillo vs. carga suelta
            if es_carga_suelta:
                # No se escribe cantidad (A17) ni "CONTENEDOR/CONTENEDORES" (B17):
                # esas celdas se reutilizan para la primera pareja número/letra.
                ws['A17'] = numero_1
                ws['B17'] = letra_1
                if numero_2:
                    ws['A18'] = numero_2
                if letra_2:
                    ws['B18'] = letra_2
            else:
                ws['A17'] = cantidad_label    # 1 (sencillo) o 2 (full)
                ws['B17'] = tipo_label        # 'CONTENEDOR' o 'CONTENEDORES'
                ws['A18'] = numero_1
                ws['B18'] = letra_1
                # Segundo par (full) solo si aporta información distinta a la del
                # primero: "20/DC" + "20/DC" es redundante → A19/B19 quedan vacías.
                if (numero_2 or letra_2) and (numero_2, letra_2) != (numero_1, letra_1):
                    ws['A19'] = numero_2
                    ws['B19'] = letra_2

            ws['C16'] = f'REFERENCIA: {referencia}' if referencia else ''   # Referencia
            ws['C17'] = contenedor        # No. de contenedor (o "CARGA SUELTA")
            ws['C18'] = f'PEDIMENTO: {pedimento}' if len(pedimento) >= 18 else pedimento  # 18+ chars: con etiqueta; incompleto: tal cual; vacío: vacío
            ws['F17'] = peso_valor        # Peso numérico
            if fecha_expedicion:
                # Solo el día en H5; el mes y el año ya van en otras celdas de la plantilla
                ws['H5'] = fecha_expedicion.split('/')[0].lstrip('0')   # día sin cero inicial

            # Descripción y Clave SAT
            ws['C20'] = descripcion
            ws['C21'] = clave_sat_celda

            # Conductor y Placas (valores directos para PDF autónomo)
            ws['C23'] = operador
            ws['F23'] = concat_placas

            # Eliminar las otras hojas para exportar solo CTA PORT
            for nombre_hoja in [n for n in wb.sheetnames if n != 'CTA PORT FRABA CONTAINER']:
                del wb[nombre_hoja]

            basename = os.path.splitext(nombre_archivo_pdf)[0]
            return _responder_documento(wb, tmp_dir, basename, formato)

    except FileNotFoundError:
        return Response(
            {'detail': 'No se encontró el template Excel. Contacte al administrador.'},
            status=500,
        )
    except subprocess.TimeoutExpired:
        return Response(
            {'detail': 'La conversión a PDF tardó demasiado. Intente de nuevo.'},
            status=500,
        )
    except Exception:
        logger.exception("Error inesperado al generar documento CTA PORT")
        return Response(
            {'detail': 'No se pudo generar el documento. Contacte al administrador.'},
            status=500,
        )


class AuditoriaMixin:
    """Rellena created_by/updated_by con el username autenticado en cada alta y
    edición. Los timestamps los pone Django (auto_now_add/auto_now). Los 4 campos
    son read_only en el serializer (editable=False), así que el cliente no puede
    falsearlos; aquí se setean vía serializer.save(), que sí los permite."""

    def perform_create(self, serializer):
        usuario = getattr(self.request.user, 'username', '') or ''
        serializer.save(created_by=usuario, updated_by=usuario)

    def perform_update(self, serializer):
        usuario = getattr(self.request.user, 'username', '') or ''
        serializer.save(updated_by=usuario)


class TractoViewSet(viewsets.ModelViewSet):
    queryset = Tracto.objects.all().order_by('id')
    serializer_class = TractoSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

class RemolqueViewSet(viewsets.ModelViewSet):
    queryset = Remolque.objects.all().order_by('id')
    serializer_class = RemolqueSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

class ChoferViewSet(viewsets.ModelViewSet):
    queryset = Chofer.objects.all().order_by('id')
    serializer_class = ChoferSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

def filtro_status(valor):
    """Maniobras que tienen `valor` entre sus status.

    El campo guarda hasta 2 status separados por coma ("activo,quemada"), así que
    un filtro exacto dejaría fuera a esa maniobra. Se busca el valor como SEGMENTO
    completo del combo: las anclas (^|,) y (,|$) cubren de una sola vez los tres
    casos (va solo, va primero, va segundo) y evitan falsos positivos por
    coincidencia parcial si algún día un id fuera substring de otro.

    Vive suelto porque lo usan el filtro de la lista y el conteo de
    `resumen_status`: con una copia en cada sitio, un cambio en la regla se
    aplicaría solo a la mitad y la tabla y el panel dirían cosas distintas.
    """
    return Q(status__regex=rf"(^|,){re.escape(valor)}(,|$)")


class ManiobraFilter(django_filters.FilterSet):
    """Filtros de la lista de maniobras. La regla del status vive en
    `filtro_status` porque el panel de seguimientos cuenta con la misma."""
    status = django_filters.CharFilter(method="filter_status")
    # Bandera TERCERO (columna `tercero`): el front solo manda ?tercero=1 cuando
    # quiere ver únicamente los registros marcados, así que la presencia del
    # parámetro basta — devolvemos los que tienen la marca puesta (no NULL / no "").
    tercero = django_filters.CharFilter(method="filter_tercero")

    class Meta:
        model = Maniobra
        fields = ["status", "tercero"]

    def filter_status(self, queryset, name, value):
        return queryset.filter(filtro_status(value))

    def filter_tercero(self, queryset, name, value):
        return queryset.exclude(tercero__isnull=True).exclude(tercero="")


def _resolver_cliente(maniobra, clientes_por_nombre):
    """Cliente del catálogo al que apunta una maniobra.

    El FK manda: es lo único que distingue dos clientes homónimos (dos "YAZAKI"
    con distinta dirección). El mapa por nombre es el fallback para los folios
    creados antes del FK, que solo guardaron el texto — ahí la ambigüedad sigue
    (devuelve siempre el mismo) y se corrige al reeditar la maniobra.

    Vive fuera del ViewSet para poder probarlo sin BD: `maniobras` es
    managed=False, así que el runner de tests no crea esa tabla.
    """
    if maniobra.cliente_fk_id:
        return maniobra.cliente_fk
    return clientes_por_nombre.get(maniobra.cliente)


# --- NUEVA VISTA ---
class ManiobraViewSet(AuditoriaMixin, viewsets.ModelViewSet):
    # prefetch_related: la columna Costos Extra necesita los enlaces de cada
    # fila. Sin esto, una página de 60 maniobras hace 60 consultas extra.
    queryset = Maniobra.objects.all().prefetch_related('costos_extra_links').order_by("-id")
    serializer_class = ManiobraSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_class = ManiobraFilter
    ordering_fields = ["id", "fecha_pis", "fecha_entrega_mercancia"]
    ordering = ["-id"]

    def create(self, request, *args, **kwargs):
        es_valido, mensaje = _validar_operador_vigente(request.data.get('asignacion_operador_status', ''))
        if not es_valido:
            return Response({'detail': mensaje}, status=400)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        operador = request.data.get('asignacion_operador_status', None)
        if operador is not None:
            es_valido, mensaje = _validar_operador_vigente(operador)
            if not es_valido:
                return Response({'detail': mensaje}, status=400)
        return super().update(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='resumen-status')
    def resumen_status(self, request):
        """Cuántas maniobras hay en cada status. Alimenta el panel SEGUIMIENTOS
        de la pantalla de inicio.

        Existe en vez de contarlo desde el cliente porque la lista va paginada de
        60 en 60 y `page_size` no es configurable: leer el `count` desde el front
        obligaría a traerse 60 registros completos por cada status para mostrar
        dos números. Aquí son dos COUNT(*) y dos enteros.

        Cuenta por segmento (ver filtro_status): una maniobra "por_salir,activo"
        cuenta como activa, igual que en el filtro de la tabla.
        """
        return Response({
            estado: Maniobra.objects.filter(filtro_status(estado)).count()
            for estado in ('activo', 'pendiente')
        })

    @action(detail=False, methods=['get'], url_path='folios-recientes')
    def folios_recientes(self, request):
        """Devuelve UNA FILA POR FOLIO de las últimas 30 maniobras, incluyendo
        unidad (placas/tipo/modelo del tracto) y remolques para autollenar los
        documentos a partir del folio elegido.

        Un Full repartido entre dos operadores gasta un folio por operador y
        produce DOS filas: cada una con el operador, el tracto, los remolques y
        el contenedor que le tocan. Así elegir el folio en el modal ya elige de
        quién es el documento — no hace falta un selector de operador aparte."""
        con_folio   = Q(folio__isnull=False)   & ~Q(folio='')
        con_folio_2 = Q(folio_2__isnull=False) & ~Q(folio_2='')
        maniobras = (
            Maniobra.objects
            .filter(con_folio | con_folio_2)
            .select_related('cliente_fk')
            .order_by('-id')[:30]
        )
        # Mapa placas → tracto: resuelve Tipo de Unidad y Modelo sin N consultas.
        # Incluye los dos tractos: la Bitácora de Sueño del operador 2 necesita
        # el suyo igual que la del 1.
        placas_unidad = {
            placas
            for m in maniobras
            for placas in (m.unidad, m.unidad_2)
            if placas
        }
        tractos = {
            t.placas: t
            for t in Tracto.objects.filter(placas__in=placas_unidad)
        } if placas_unidad else {}
        # Mapa nombre → cliente, mismo patrón que tractos: SOLO para los folios
        # previos al FK cliente_id, que únicamente guardaron el nombre (ver
        # _resolver_cliente). Un nombre que ya no exista en el catálogo devuelve la
        # ficha vacía y el usuario la completa con el ClienteSelector.
        nombres_cliente = {
            m.cliente for m in maniobras if m.cliente and not m.cliente_fk_id
        }
        clientes = {
            c.nombre_cliente: c
            for c in Cliente.objects.filter(nombre_cliente__in=nombres_cliente)
        } if nombres_cliente else {}

        data = []
        for m in maniobras:
            cliente = _resolver_cliente(m, clientes)
            # Dos operadores = el reparto ya está decidido en la maniobra, y cada
            # folio lleva lo suyo. El front usa esto para NO ofrecer el
            # desplegable 1/2/Los dos: el documento no debe poder contradecir lo
            # guardado.
            dos_operadores = bool(m.operador_2 or m.folio_2)

            comun = {
                'id':          m.id,
                'origen':      m.origen or '',
                'destino':     m.destino or '',
                'pedimento':   m.pedimento or '',
                'referencia':  m.referencia or '',
                'tipo_servicio': m.tipo_servicio or '',
                'dos_operadores': dos_operadores,
                # La carga viaja EN CRUDO, las dos columnas tal cual, y el reparto
                # lo hace cargaDeParte() en el front con `parte`. Es a propósito:
                # los registros anteriores a la 0035 guardan los dos contenedores
                # dentro de la primera columna ("20 - 40 / DC - HC") y partirlos
                # aquí exigiría duplicar en Python el partidor que ya vive —y ya
                # está probado— en utils/dobleValor.mjs. Dos copias de esa regla
                # es justo como se separan con el tiempo.
                'tipo':        m.tipo or '',
                'peso':        str(m.peso) if m.peso is not None else '',
                'contenedor':  m.contenedor or '',
                'tipo_2':       m.tipo_2 or '',
                'peso_2':       str(m.peso_2) if m.peso_2 is not None else '',
                'contenedor_2': m.contenedor_2 or '',
                # Fecha de entrega de la maniobra. OJO: el modelo dice DateField
                # pero la columna REAL es TEXT (la tabla es managed=False, así que
                # cambiar el modelo nunca alteró el esquema — ver schema.sql y la
                # 0001). Llega ya como 'YYYY-MM-DD', que es justo lo que espera el
                # front; str() la deja igual y seguiría valiendo si algún día la
                # columna pasara a ser date de verdad. Nada de .isoformat(): sobre
                # un str revienta y se lleva por delante todo el endpoint.
                # Vacía si la maniobra aún no la tiene: entonces el gasto la deja
                # en blanco y se elige a mano.
                'fecha_entrega_mercancia': str(m.fecha_entrega_mercancia or ''),
                # Cliente del registro (autollenado de la Carta Porte). El nombre
                # sale del catálogo cuando hay FK, así que un cliente renombrado
                # allí se refleja aquí; `m.cliente` es el respaldo de los viejos.
                # cliente_id viaja para que el ClienteSelector del modal sepa CUÁL
                # homónimo está puesto (si no, elegir el otro parece "el mismo").
                'cliente_id':        m.cliente_fk_id,
                'cliente_nombre':    (cliente.nombre_cliente if cliente else m.cliente) or '',
                'cliente_domicilio': (cliente.domicilio if cliente else '') or '',
                'cliente_colonia':   (cliente.colonia   if cliente else '') or '',
                'cliente_ciudad':    (cliente.ciudad    if cliente else '') or '',
            }

            if m.folio:
                tracto = tractos.get(m.unidad)
                data.append({
                    **comun,
                    'folio':       m.folio,
                    # El CCP es de cada operador: la remisión del documento se
                    # compone como "folio / ccp", así que va emparejado al folio.
                    'ccp':         m.ccp or '',
                    # Operador, unidad y remolques del registro (autollenado de documentos)
                    'operador':    m.asignacion_operador_status or '',      # nombre del operador asignado
                    'placas':      m.unidad or '',                          # placas del tracto asignado
                    'tipo_unidad': (tracto.unidad if tracto else '') or '', # Tipo de Unidad
                    'anio':        str(tracto.anio) if tracto and tracto.anio is not None else '',  # Modelo
                    'remolque_1':  m.remolque or '',
                    'remolque_2':  m.remolque_2 or '',
                    # Con dos operadores este folio se queda SOLO con el primer
                    # contenedor; con uno solo se lleva los dos y el desplegable
                    # 1/2/Los dos decide (por defecto, los dos).
                    'parte': '1' if dos_operadores else 'ambos',
                })

            if m.folio_2:
                tracto_2 = tractos.get(m.unidad_2)
                data.append({
                    **comun,
                    'folio':       m.folio_2,
                    'ccp':         m.ccp_2 or '',
                    'operador':    m.operador_2 or '',
                    'placas':      m.unidad_2 or '',
                    'tipo_unidad': (tracto_2.unidad if tracto_2 else '') or '',
                    'anio':        str(tracto_2.anio) if tracto_2 and tracto_2.anio is not None else '',
                    'remolque_1':  m.remolque_3 or '',
                    'remolque_2':  m.remolque_4 or '',
                    # El folio del segundo operador se lleva el segundo contenedor,
                    # esté guardado en su columna o todavía dentro de la primera.
                    'parte': '2',
                })
        return Response(data)

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class CustomTokenObtainPairView(TokenObtainPairView):

    # Devuelve access + refresh con 'role' y 'username' en el payload.
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        # El serializer valida credenciales + MFA + equipo de confianza, y deja
        # dicho en sus atributos qué hacer con la cookie. Aquí, que es donde se
        # puede tocar la respuesta HTTP, se emite o se borra.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)   # 401 si fallan credenciales/MFA
        respuesta = Response(serializer.validated_data, status=status.HTTP_200_OK)

        token = getattr(serializer, 'cookie_confianza_a_emitir', None)
        if token:
            respuesta.set_cookie(
                confianza.COOKIE_CONFIANZA, token,
                max_age=DIAS_CONFIANZA * 24 * 60 * 60,   # ventana absoluta, = a la de BD
                httponly=True,
                secure=not settings.DEBUG,               # en dev sobre http se puede probar
                samesite='Strict',                       # mismo origen (SWA + backend enlazado)
                path='/api/login/',                      # solo viaja al login (decisión 15)
            )

        return respuesta


def _cerrar_todas_las_sesiones(user):
    """Mete en la blacklist todos los refresh vigentes del usuario. No se puede
    apuntar solo a la sesión del equipo perdido —los refresh no están ligados al
    dispositivo— así que se cierran todas (decisión 13). Corre bajo el rol
    estándar: la 0018 le dio SELECT en outstanding + INSERT en blacklisted."""
    from django.utils import timezone
    from rest_framework_simplejwt.token_blacklist.models import (
        OutstandingToken, BlacklistedToken,
    )
    for ot in OutstandingToken.objects.filter(user=user, expires_at__gt=timezone.now()):
        BlacklistedToken.objects.get_or_create(token=ot)


class DispositivoConfianzaViewSet(viewsets.ViewSet):
    """Equipos de confianza del propio usuario: listar y revocar.

    El queryset se ata a request.user, así que nadie ve ni revoca los de otro
    (la restricción es aquí, no en RLS, igual que en toda la app — decisión A1).
    El alta NO está aquí: un equipo se marca de confianza al iniciar sesión con
    la casilla, nunca por este endpoint.
    """
    permission_classes = [IsAuthenticated]

    def _propios_vigentes(self, request):
        from django.utils import timezone
        return DispositivoConfianza.objects.filter(
            usuario=request.user,
            revocado_en__isnull=True,
            expira_en__gt=timezone.now(),
        )

    def list(self, request):
        datos = DispositivoConfianzaSerializer(
            self._propios_vigentes(request), many=True
        ).data
        return Response(datos)

    @action(detail=True, methods=['post'])
    def revocar(self, request, pk=None):
        from django.utils import timezone
        disp = self._propios_vigentes(request).filter(pk=pk).first()
        if disp is None:
            return Response({'detail': 'No encontrado.'},
                            status=status.HTTP_404_NOT_FOUND)
        disp.revocado_en = timezone.now()
        disp.save(update_fields=['revocado_en'])
        _cerrar_todas_las_sesiones(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
class GastoViewSet(viewsets.ModelViewSet):
    # select_related evita el N+1 que dispara GastoSerializer.folio
    # (source='maniobra.folio') al serializar cada fila. order_by hace
    # determinístico el orden entre páginas (antes indefinido).
    queryset = Gasto.objects.select_related('maniobra').all().order_by('-id')
    serializer_class = GastoSerializer

    def perform_create(self, serializer):
        maniobra_id = self.request.data.get('maniobra')
        if not maniobra_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'maniobra': 'Este campo es requerido.'})
        try:
            maniobra = Maniobra.objects.get(id=maniobra_id)
        except Maniobra.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'maniobra': f'No existe una maniobra con id {maniobra_id}.'})
        usuario = getattr(self.request.user, 'username', '') or ''
        serializer.save(maniobra=maniobra, created_by=usuario, updated_by=usuario)

    def perform_update(self, serializer):
        # En update no tocamos la maniobra, solo los campos del gasto
        usuario = getattr(self.request.user, 'username', '') or ''
        serializer.save(updated_by=usuario)

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

class VacioViewSet(AuditoriaMixin, viewsets.ModelViewSet):
    queryset = Vacio.objects.all().order_by("-id")
    serializer_class = VacioSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]
    # ?status=pendiente|entregado filtra en el backend (la página de Vacíos tiene
    # scroll infinito paginado: filtrar en cliente solo cubriría lo ya cargado).
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["status"]
    ordering_fields = ["id"]
    ordering = ["-id"]

    def create(self, request, *args, **kwargs):
        es_valido, mensaje = _validar_operador_vigente(request.data.get('operador', ''))
        if not es_valido:
            return Response({'detail': mensaje}, status=400)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        operador = request.data.get('operador', None)
        if operador is not None:
            es_valido, mensaje = _validar_operador_vigente(operador)
            if not es_valido:
                return Response({'detail': mensaje}, status=400)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

class EmpleadoViewSet(viewsets.ModelViewSet):
    queryset = Empleado.objects.all().order_by("-id")
    serializer_class = EmpleadoSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]
    filter_backends = [OrderingFilter]
    ordering_fields = ["id"]
    ordering = ["id"]

    def get_queryset(self):
        """?cargo= filtra por cargo (lo usa el selector de Coordinador en Vacíos).

        Mismo patrón que UnidadTerceroViewSet con ?transportista. En el servidor y
        no en el cliente porque la lista va paginada: filtrando en el navegador
        solo se mirarían los 60 primeros empleados.

        iexact y no exact: el cargo se guarda como texto en `empleados` (tabla
        managed=False) y una mayúscula de más escrita a mano dejaría al empleado
        fuera del desplegable sin que nadie entienda por qué.
        """
        cargo = self.request.query_params.get('cargo')
        qs = super().get_queryset()
        return qs.filter(cargo__iexact=cargo) if cargo else qs

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

class PatioViewSet(viewsets.ModelViewSet):
    queryset = Patio.objects.all()
    serializer_class = PatioSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]
    filter_backends = [OrderingFilter]
    ordering = ["nombre"]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]
    filter_backends = [OrderingFilter]
    ordering = ['nombre_cliente']

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class OrigenViewSet(viewsets.ModelViewSet):
    queryset = Origen.objects.all()
    serializer_class = OrigenSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]
    filter_backends = [OrderingFilter]
    ordering = ['ciudad']

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class DestinoViewSet(viewsets.ModelViewSet):
    queryset = Destino.objects.all()
    serializer_class = DestinoSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]
    filter_backends = [OrderingFilter]
    ordering = ['ciudad']

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class MovimientoLocalViewSet(AuditoriaMixin, viewsets.ModelViewSet):
    queryset               = MovimientoLocal.objects.all()
    serializer_class       = MovimientoLocalSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]
    filter_backends        = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields       = ['status']
    search_fields          = ['operador', 'movimiento', 'unidad', 'contenedor']
    ordering_fields        = ['fecha', 'id']
    ordering               = ['-id']

    def create(self, request, *args, **kwargs):
        es_valido, mensaje = _validar_operador_vigente(request.data.get('operador', ''))
        if not es_valido:
            return Response({'detail': mensaje}, status=400)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        operador = request.data.get('operador', None)
        if operador is not None:
            es_valido, mensaje = _validar_operador_vigente(operador)
            if not es_valido:
                return Response({'detail': mensaje}, status=400)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class TransportistaViewSet(viewsets.ModelViewSet):
    queryset               = Transportista.objects.all()
    serializer_class       = TransportistaSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({'detail': 'No tienes permisos para eliminar registros.'}, status=403)
        return super().destroy(request, *args, **kwargs)


class CargoViewSet(viewsets.ModelViewSet):
    queryset               = Cargo.objects.all()
    serializer_class       = CargoSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({'detail': 'No tienes permisos para eliminar registros.'}, status=403)
        return super().destroy(request, *args, **kwargs)


class UnidadTerceroViewSet(viewsets.ModelViewSet):
    queryset               = UnidadTercero.objects.all()
    serializer_class       = UnidadTerceroSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def get_queryset(self):
        t = self.request.query_params.get('transportista')
        return super().get_queryset().filter(transportista=t) if t else super().get_queryset()

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({'detail': 'No tienes permisos para eliminar registros.'}, status=403)
        return super().destroy(request, *args, **kwargs)


class OperadorTerceroViewSet(viewsets.ModelViewSet):
    queryset               = OperadorTercero.objects.all()
    serializer_class       = OperadorTerceroSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def get_queryset(self):
        t = self.request.query_params.get('transportista')
        return super().get_queryset().filter(transportista=t) if t else super().get_queryset()

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({'detail': 'No tienes permisos para eliminar registros.'}, status=403)
        return super().destroy(request, *args, **kwargs)


class PendienteViewSet(mixins.ListModelMixin,
                        mixins.CreateModelMixin,
                        mixins.UpdateModelMixin,
                        viewsets.GenericViewSet):
    """Listas de pendientes de los cinco tableros.

    SIN `destroy` a propósito, y por eso no hereda de ModelViewSet: la ruta de
    borrado no existe, así que nadie puede borrar un pendiente — tampoco un
    admin. No es un permiso que se pueda saltar, es una URL que no está.

    Caducan a las 28 horas y se van solos. El barrido es perezoso, en el listado:
    la página se abre varias veces al día, así que no hace falta cron ni Celery
    para una tabla que nunca pasará de unas decenas de filas.
    """
    serializer_class       = PendienteSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]
    # Sin paginar: son cinco tableros de una lista que se vacía cada 28 horas y
    # el front los necesita TODOS de una vez para repartirlos. Con el PAGE_SIZE=60
    # global, los tableros de abajo se quedarían a medias sin avisar.
    pagination_class       = None

    @staticmethod
    def _limite():
        return timezone.now() - PENDIENTE_VIDA

    def get_queryset(self):
        # El filtro va aquí y no solo en el barrido: entre dos listados, un
        # pendiente ya caducado no debe poder leerse ni editarse.
        return Pendiente.objects.filter(creado_en__gte=self._limite())

    def list(self, request, *args, **kwargs):
        Pendiente.objects.filter(creado_en__lt=self._limite()).delete()
        return super().list(request, *args, **kwargs)


class CostoExtraViewSet(viewsets.ModelViewSet):
    """Catálogo de costos extra (Finanzas → Costos extra).

    Borrado solo para admin, igual que el resto de catálogos. Doble candado: el
    403 de aquí y, por debajo, el rol de Postgres — los no-admin corren con el
    alias `standard`, que no tiene DELETE sobre esta tabla (migración 0038).
    """
    queryset               = CostoExtra.objects.all()
    serializer_class       = CostoExtraSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({'detail': 'No tienes permisos para eliminar registros.'}, status=403)
        return super().destroy(request, *args, **kwargs)


class FolioViewSet(viewsets.ModelViewSet):
    queryset               = Folio.objects.all()
    serializer_class       = FolioSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]
    filter_backends        = [DjangoFilterBackend]
    filterset_fields       = ['tabla']
    # Sin paginar a propósito: Folio crece sin límite (14 filas por lote, para
    # siempre) y el frontend necesita SIEMPRE la lista completa de una tabla
    # para reconstruir los lotes en columnas. Con PAGE_SIZE=60 global, el
    # quinto lote (70 filas) perdería las últimas 10 en silencio.
    pagination_class       = None

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({'detail': 'No tienes permisos para eliminar registros.'},
                            status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def perform_update(self, serializer):
        """Renombrar un folio arrastra a la maniobra que lo tenía asignado.

        No hay FK entre Maniobra y Folio (la tabla `maniobras` es managed=False):
        el vínculo es el propio `codigo`, que es unique. Por eso al cambiarlo hay
        que reescribirlo también donde se usó, o la maniobra quedaría apuntando a
        un código que ya no existe. atomic() porque las dos escrituras son una
        sola operación; el alias sale del router (ver generar(), más abajo).
        """
        anterior = serializer.instance.codigo
        with transaction.atomic(using=get_db_alias()):
            folio = serializer.save()
            if folio.codigo != anterior:
                Maniobra.objects.filter(folio=anterior).update(folio=folio.codigo)

    @action(detail=False, methods=['get'], url_path='disponibles')
    def disponibles(self, request):
        """Los 5 siguientes folios de `tabla` que ninguna maniobra está usando.

        Alimenta el desplegable de la columna FOLIO en Maniobras.
        """
        tabla = request.query_params.get('tabla')
        if tabla not in dict(Folio.TABLA_CHOICES):
            return Response({'detail': 'tabla inválida.'}, status=status.HTTP_400_BAD_REQUEST)

        # ponytail: "usado" se deriva de maniobras.folio/folio_2, sin columna de
        # estado — así vaciar o borrar una maniobra libera sus folios sola. Sin
        # índice en ninguna de las dos: es un scan por apertura del desplegable;
        # añadirlo si pesa.
        # Las DOS columnas cuentan: un Full repartido entre dos operadores gasta
        # un folio por operador, y omitir folio_2 aquí volvería a ofrecer como
        # libre uno ya asignado (mismo motivo que la validación del serializer).
        usados = [
            codigo
            for fila in Maniobra.objects.values_list('folio', 'folio_2')
            for codigo in fila
            if codigo
        ]
        # asignacion='' — un folio con algo escrito a mano en ASIGNACIÓN cuenta
        # como ocupado. Es la vía para cargar talonarios viejos (lotes anteriores)
        # y marcar los que ya se usaron fuera del sistema, sin columna de estado.
        # `asignacion` es blank/default='' y validate_asignacion normaliza null a
        # '', así que "vacío" siempre es '' y no hace falta mirar NULL.
        libres = (Folio.objects.filter(tabla=tabla, asignacion='')
                  .exclude(codigo__in=usados)
                  .order_by('numero')[:5])
        return Response(FolioSerializer(libres, many=True).data)

    @action(detail=False, methods=['post'], url_path='generar')
    def generar(self, request):
        """Genera un lote de 14 folios para `tabla`
        (body: {"tabla": "manzanillo"|"lazaro", "direccion": "anterior"?}).

        Sin `direccion` avanza: los 14 siguientes al número más alto. Con
        "anterior" retrocede: los 14 que preceden al más bajo, para cargar los
        talonarios que ya existían antes de que arrancara el sistema (Manzanillo
        empieza en 2279 y Lázaro en 323, sembrados por la migración 0031, así que
        sin esto todo lo anterior es inalcanzable).

        Las letras salen de LETRAS_CICLO por índice DENTRO del lote, así que un
        lote hacia atrás también empieza en F.

        Abierto a cualquier usuario autenticado — confirmado con el usuario,
        igual que el resto de altas/ediciones; solo destroy() se reserva a admin.
        """
        tabla = request.data.get('tabla')
        if tabla not in dict(Folio.TABLA_CHOICES):
            return Response({'detail': 'tabla inválida.'}, status=status.HTTP_400_BAD_REQUEST)
        hacia_atras = request.data.get('direccion') == 'anterior'

        # using=get_db_alias() NO es opcional: el router manda el ORM al alias
        # del hilo ('standard' en una petición normal), así que un atomic sobre
        # 'default' abriría la transacción en OTRA conexión y el
        # select_for_update de abajo correría en autocommit → 500. Es la misma
        # regresión que tumbó /api/login/ el 2026-07-23 (ver Serializers.py).
        with transaction.atomic(using=get_db_alias()):
            if hacia_atras:
                # Bloquea la fila MÁS BAJA, la que define dónde empieza el hueco
                # anterior — igual que la otra rama bloquea la más alta. Dos clics
                # simultáneos se serializan.
                primero = (Folio.objects.select_for_update()
                           .filter(tabla=tabla).order_by('numero').first())
                if primero is None:
                    return Response(
                        {'detail': 'No hay folios en esta tabla todavía: genera el primer lote antes de retroceder.'},
                        status=status.HTTP_400_BAD_REQUEST)
                siguiente = primero.numero - BATCH_SIZE
                if siguiente < 1:
                    return Response(
                        {'detail': 'No se puede retroceder más: el lote anterior caería por debajo de 1.'},
                        status=status.HTTP_400_BAD_REQUEST)
            else:
                # select_for_update sobre la última fila de esta tabla serializa
                # clics concurrentes de AÑADIR FOLIOS.
                ultimo = (Folio.objects.select_for_update()
                          .filter(tabla=tabla).order_by('-numero').first())
                # En producción la migración 0031 siembra el primer lote, así que
                # `ultimo` nunca es None; el fallback evita el 500 si alguien vacía
                # la tabla desde el admin (y es lo que hace arrancable el test, que
                # corre con las migraciones de `api` saltadas).
                siguiente = ultimo.numero + 1 if ultimo else START_NUMERO[tabla]
            formato = FORMATO_CODIGO[tabla]
            nuevos = [
                Folio(tabla=tabla, numero=siguiente + i, letra=letra,
                      codigo=formato.format(letra=letra, numero=siguiente + i))
                for i, letra in enumerate(LETRAS_CICLO)
            ]
            creados = Folio.objects.bulk_create(nuevos)

        return Response(FolioSerializer(creados, many=True).data,
                        status=status.HTTP_201_CREATED)


class FotoRegistroViewSet(viewsets.ViewSet):
    """
    ViewSet para subir, ver y eliminar fotos de maniobras y vacíos.
    Las fotos se almacenan como bytes en PostgreSQL (BinaryField).
    Responde con base64 data URIs para que el frontend las renderice directamente.

    Endpoints:
      GET  /api/fotos/?tipo=maniobra&registro_id=123    → foto_1 y foto_2 en base64
      POST /api/fotos/subir/   multipart                → sube foto al slot 1 o 2
      DELETE /api/fotos/eliminar/?tipo=...&registro_id=...&slot=1  → elimina foto
    """

    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    ALLOWED_MIMES = {'image/jpeg', 'image/png', 'image/webp'}
    MAX_SIZE      = 2 * 1024 * 1024  # 2 MB

    # ── Validadores de parámetros comunes ────────────────────────────────────

    def _validar_params(self, tipo, registro_id_raw, slot_raw=None):
        """
        Valida y convierte los parámetros comunes.
        Retorna (registro_id, slot, error_response) donde error_response es None si OK.
        """
        if tipo not in ('maniobra', 'vacio'):
            return None, None, Response(
                {'detail': 'tipo inválido. Use maniobra o vacio.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            registro_id = int(registro_id_raw)
        except (TypeError, ValueError):
            return None, None, Response(
                {'detail': 'registro_id debe ser un número entero.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        slot = None
        if slot_raw is not None:
            try:
                slot = int(slot_raw)
                if slot not in (1, 2):
                    raise ValueError
            except (TypeError, ValueError):
                return None, None, Response(
                    {'detail': 'slot debe ser 1 o 2.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        return registro_id, slot, None

    # ── GET /api/fotos/?tipo=maniobra&registro_id=123 ────────────────────────

    def list(self, request):
        tipo            = request.query_params.get('tipo', '')
        registro_id_raw = request.query_params.get('registro_id', '')

        registro_id, _, err = self._validar_params(tipo, registro_id_raw)
        if err:
            return err

        try:
            foto = FotoRegistro.objects.get(tipo=tipo, registro_id=registro_id)
        except FotoRegistro.DoesNotExist:
            return Response({'foto_1': None, 'foto_2': None})

        def a_base64(data, mime):
            if not data:
                return None
            b64 = base64.b64encode(bytes(data)).decode('utf-8')
            return f'data:{mime};base64,{b64}'

        return Response({
            'foto_1': a_base64(foto.foto_1, foto.foto_1_mime),
            'foto_2': a_base64(foto.foto_2, foto.foto_2_mime),
        })

    # ── POST /api/fotos/subir/ ───────────────────────────────────────────────

    @action(
        detail=False,
        methods=['post'],
        url_path='subir',
        parser_classes=[MultiPartParser, FormParser],
    )
    def subir(self, request):
        tipo            = request.data.get('tipo', '')
        registro_id_raw = request.data.get('registro_id', '')
        slot_raw        = request.data.get('slot', '')
        foto_file       = request.FILES.get('foto')

        registro_id, slot, err = self._validar_params(tipo, registro_id_raw, slot_raw)
        if err:
            return err

        # Evita fotos huérfanas: el registro (maniobra/vacío) debe existir.
        modelo = Maniobra if tipo == 'maniobra' else Vacio
        if not modelo.objects.filter(pk=registro_id).exists():
            return Response(
                {'detail': 'El registro indicado no existe.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not foto_file:
            return Response(
                {'detail': 'No se envió ningún archivo. Campo requerido: foto.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if foto_file.size > self.MAX_SIZE:
            return Response(
                {'detail': 'La imagen no puede superar 2 MB.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        foto_bytes = foto_file.read()

        # No confiar en content_type (lo fija el cliente): validar los bytes reales.
        try:
            imagen = Image.open(io.BytesIO(foto_bytes))
            formato_real = (imagen.format or '').upper()
            imagen.verify()
        except Exception:
            return Response(
                {'detail': 'El archivo no es una imagen válida.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _FORMATO_A_MIME = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp'}
        if formato_real not in _FORMATO_A_MIME:
            return Response(
                {'detail': 'Formato no permitido. Use JPG, PNG o WEBP.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        mime = _FORMATO_A_MIME[formato_real]

        registro, _ = FotoRegistro.objects.get_or_create(
            tipo=tipo,
            registro_id=registro_id,
        )

        if slot == 1:
            registro.foto_1      = foto_bytes
            registro.foto_1_mime = mime
        else:
            registro.foto_2      = foto_bytes
            registro.foto_2_mime = mime

        registro.save()

        return Response(
            {'detail': f'Foto {slot} guardada correctamente.'},
            status=status.HTTP_200_OK,
        )

    # ── DELETE /api/fotos/eliminar/?tipo=...&registro_id=...&slot=1 ──────────

    @action(
        detail=False,
        methods=['delete'],
        url_path='eliminar',
    )
    def eliminar(self, request):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar fotos.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        tipo            = request.query_params.get('tipo', '')
        registro_id_raw = request.query_params.get('registro_id', '')
        slot_raw        = request.query_params.get('slot', '')

        registro_id, slot, err = self._validar_params(tipo, registro_id_raw, slot_raw)
        if err:
            return err

        try:
            registro = FotoRegistro.objects.get(tipo=tipo, registro_id=registro_id)
        except FotoRegistro.DoesNotExist:
            return Response(
                {'detail': 'No hay fotos para este registro.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if slot == 1:
            registro.foto_1      = None
            registro.foto_1_mime = None
        else:
            registro.foto_2      = None
            registro.foto_2_mime = None

        # Si ambas fotos quedaron vacías, eliminar la fila completa
        if not registro.foto_1 and not registro.foto_2:
            registro.delete()
        else:
            registro.save()

        return Response({'detail': f'Foto {slot} eliminada correctamente.'})


class DocumentoBitacoraSuenoView(APIView):
    """
    POST /api/documentos/bitacora-sueno/
    Recibe datos del formulario, llena la hoja 'BITACORA DE SUEÑO'
    del template Excel y devuelve el PDF generado.
    Requiere autenticación JWT.
    Todos los valores de texto se escriben en MAYÚSCULAS.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def post(self, request):
        # ── Leer datos del body (en MAYÚSCULAS para el Excel) ──────────────────
        operador    = request.data.get('operador', '').strip().upper()
        placas      = request.data.get('placas', '').strip().upper()
        remolque_1  = request.data.get('remolque_1', '').strip().upper()
        remolque_2  = request.data.get('remolque_2', '').strip().upper()
        folio       = request.data.get('folio', '').strip().upper()
        unidad      = request.data.get('unidad', '').strip().upper()    # tracto.unidad (Tipo de Unidad)
        anio        = request.data.get('anio', '').strip().upper()      # tracto.anio   (Modelo)
        origen      = request.data.get('origen', '').strip().upper()
        destino     = request.data.get('destino', '').strip().upper()
        fecha_salida  = request.data.get('fecha_salida', '').strip().upper()   # DD/MM/YYYY
        fecha_llegada = request.data.get('fecha_llegada', '').strip().upper()  # DD/MM/YYYY
        formato       = request.data.get('formato', 'pdf')

        # Anti-inyección de fórmulas (CWE-1236) en los textos que van a celdas.
        (operador, placas, remolque_1, remolque_2, folio, unidad, anio,
         origen, destino, fecha_salida, fecha_llegada) = map(_sin_formula, (
            operador, placas, remolque_1, remolque_2, folio, unidad, anio,
            origen, destino, fecha_salida, fecha_llegada))

        # ── Validación mínima ──────────────────────────────────────────────────
        if not placas:
            return Response({'detail': 'El campo placas es requerido.'}, status=400)

        # ── Construir valor concatenado (D9 y B11) ────────────────────────────
        concat_valor = _concat_placas_remolques(placas, remolque_1, remolque_2)

        # ── Abrir template y trabajar en directorio temporal ──────────────────
        try:
            with tempfile.TemporaryDirectory() as tmp_dir:
                wb = load_workbook(str(_TEMPLATE_PATH))  # data_only=False → preserva fórmulas
                ws = wb['BITACORA DE SUEÑO']

                # Escribir valores en las celdas objetivo
                ws['L7']  = operador       # Nombre del operador
                ws['D9']  = concat_valor   # Vehículo / remolques (concatenado)
                ws['U9']  = folio          # CTA Porte (folio)
                ws['B11'] = concat_valor   # Placas (mismo concatenado — vinculado a CTA PORT via fórmula existente)
                ws['O11'] = unidad         # Tipo de Unidad
                ws['X11'] = anio           # Modelo (año)
                ws['E13'] = origen         # Origen del viaje
                ws['P13'] = destino        # Destino del viaje
                ws['E15'] = fecha_salida   # Fecha de salida (DD/MM/YYYY)
                ws['O15'] = fecha_llegada  # Fecha de llegada (DD/MM/YYYY)
                # NOTA: D33 tiene la fórmula '=L7' — se deja intacta.

                # Eliminar las otras hojas para exportar solo BITÁCORA DE SUEÑO
                for nombre_hoja in [n for n in wb.sheetnames if n != 'BITACORA DE SUEÑO']:
                    del wb[nombre_hoja]

                return _responder_documento(wb, tmp_dir, 'bitacora_sueno', formato)

        except FileNotFoundError:
            return Response(
                {'detail': 'No se encontró el template Excel. Contacte al administrador.'},
                status=500,
            )
        except subprocess.TimeoutExpired:
            return Response(
                {'detail': 'La conversión a PDF tardó demasiado. Intente de nuevo.'},
                status=500,
            )
        except Exception:
            logger.exception("Error inesperado al generar Bitácora de Sueño")
            return Response(
                {'detail': 'No se pudo generar el documento. Contacte al administrador.'},
                status=500,
            )


class DocumentoCtaPortView(APIView):
    """
    POST /api/documentos/cta-port/
    Recibe datos del formulario, llena la hoja 'CTA PORT FRABA CONTAINER'
    del template Excel y devuelve el PDF generado.
    Requiere autenticación JWT.
    Todos los valores de texto se escriben en MAYÚSCULAS.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def post(self, request):
        return _generar_pdf_cta_port(
            request.data, _TEMPLATE_PATH, 'cta_port.pdf',
            request.data.get('formato', 'pdf'),
        )


class DocumentoCtaPortTercerosView(APIView):
    """
    POST /api/documentos/cta-port-terceros/
    Genera el PDF de Carta Porte para transportistas Terceros, usando el
    template CTA_PTE_TERCEROS_FORMATO.xlsx. Comparte exactamente el mismo
    mapeo de celdas y la misma lógica de negocio que DocumentoCtaPortView
    (ver _generar_pdf_cta_port). No genera Bitácora de Gastos.
    Requiere autenticación JWT.
    Todos los valores de texto se escriben en MAYÚSCULAS.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def post(self, request):
        return _generar_pdf_cta_port(
            request.data, _TEMPLATE_PATH_TERCEROS, 'cta_port_terceros.pdf',
            request.data.get('formato', 'pdf'),
        )


class DocumentoBitacoraGastosView(APIView):
    """
    POST /api/documentos/bitacora-gastos/
    Recibe los mismos datos que DocumentoCtaPortView más `total_gastos`.
    Llena la hoja 'BITACORA GASTOS' del template con valores directos
    (anulando las fórmulas cruzadas que apuntan a CTA PORT FRABA CONTAINER).
    Devuelve el PDF de BITACORA GASTOS.
    Requiere autenticación JWT.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def post(self, request):
        # ── Leer datos del body ────────────────────────────────────────────────
        # Datos compartidos con CTA PORT (vienen del mismo formulario)
        operador   = request.data.get('operador',   '').strip()
        placas     = request.data.get('placas',     '').strip()
        remolque_1 = request.data.get('remolque_1', '').strip()
        remolque_2 = request.data.get('remolque_2', '').strip()
        peso_raw   = request.data.get('peso',       '')
        destino    = request.data.get('destino',    '').strip()

        # Campo exclusivo de BITACORA GASTOS
        total_gastos_raw = request.data.get('total_gastos', '')
        formato          = request.data.get('formato', 'pdf')

        # Anti-inyección de fórmulas (CWE-1236). peso/total_gastos se parsean como número.
        operador, placas, remolque_1, remolque_2, destino = map(
            _sin_formula, (operador, placas, remolque_1, remolque_2, destino))

        # ── Validación ────────────────────────────────────────────────────────
        if not total_gastos_raw and total_gastos_raw != 0:
            return Response(
                {'detail': 'El campo Total de Gastos es requerido.'},
                status=400,
            )

        try:
            total_gastos = float(str(total_gastos_raw).replace(',', ''))
        except (ValueError, TypeError):
            return Response(
                {'detail': 'Total de Gastos debe ser un número válido.'},
                status=400,
            )

        # ── Valores derivados ──────────────────────────────────────────────────
        # I2: mismo concatenado de placas/remolques que va en F23 de CTA PORT
        concat_placas = _concat_placas_remolques(placas, remolque_1, remolque_2)

        # I3: peso numérico (suma las cantidades separadas por '-', igual que
        # la celda F17 de CTA PORT). '' cuando no hay valor numérico → se
        # normaliza a 0.0 para la lógica de escritura de abajo.
        peso_valor = _sumar_peso(peso_raw) or 0.0

        # ── Abrir template y trabajar en directorio temporal ──────────────────
        try:
            with tempfile.TemporaryDirectory() as tmp_dir:
                wb = load_workbook(str(_TEMPLATE_PATH))  # preserva fórmulas y formatos
                ws = wb['BITACORA GASTOS']

                # B2 (=TODAY()) — NO SE TOCA. LibreOffice resuelve la fórmula.

                # I2 (merged I2:L2): Unidad / Placas
                # Anula la fórmula ='CTA PORT FRABA CONTAINER'!F23
                ws['I2'] = concat_placas

                # B3 (merged B3:G3): Nombre del conductor
                # Anula la fórmula ='CTA PORT FRABA CONTAINER'!C23
                ws['B3'] = operador

                # I3 (merged I3:L3): Peso
                # Anula la fórmula =SUM('CTA PORT FRABA CONTAINER'!F17:F19)
                ws['I3'] = peso_valor if peso_valor != 0.0 else ''

                # B4 (merged B4:G4): Destino
                # Anula la fórmula ='CTA PORT FRABA CONTAINER'!G6
                ws['B4'] = destino

                # I4 (merged I4:L4): Total de Gastos
                # La celda ya tiene formato de dinero "$"#,##0 en el template.
                # openpyxl preserva el formato al cargar; solo se escribe el número.
                ws['I4'] = total_gastos

                # Eliminar las otras hojas para exportar solo BITACORA GASTOS
                for nombre_hoja in [n for n in wb.sheetnames if n != 'BITACORA GASTOS']:
                    del wb[nombre_hoja]

                return _responder_documento(wb, tmp_dir, 'bitacora_gastos', formato)

        except FileNotFoundError:
            return Response(
                {'detail': 'No se encontró el template Excel. Contacte al administrador.'},
                status=500,
            )
        except subprocess.TimeoutExpired:
            return Response(
                {'detail': 'La conversión a PDF tardó demasiado. Intente de nuevo.'},
                status=500,
            )
        except Exception:
            logger.exception("Error inesperado al generar Bitácora de Gastos")
            return Response(
                {'detail': 'No se pudo generar el documento. Contacte al administrador.'},
                status=500,
            )


class AlertasVencimientoView(APIView):
    """
    GET /api/alertas-vencimiento/
    Devuelve licencias de choferes y pólizas de tractos que vencen en los
    próximos 30 días, ordenadas por fecha ascendente. Visible para todos los
    usuarios autenticados sin distinción de rol.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def get(self, request):
        from datetime import timedelta
        hoy = date.today()
        limite_licencia = hoy + timedelta(days=30)   # licencias: 1 mes
        limite_poliza   = hoy + timedelta(days=14)   # pólizas: 2 semanas

        choferes_por_vencer = Chofer.objects.filter(
            fecha_vencimiento_licencia__isnull=False,
            fecha_vencimiento_licencia__gte=hoy,
            fecha_vencimiento_licencia__lte=limite_licencia,
        ).values('nombre', 'fecha_vencimiento_licencia')

        tractos_por_vencer = Tracto.objects.filter(
            fecha_vencimiento_poliza__isnull=False,
            fecha_vencimiento_poliza__gte=hoy,
            fecha_vencimiento_poliza__lte=limite_poliza,
        ).values('unidad', 'anio', 'placas', 'fecha_vencimiento_poliza')

        alertas = []

        for c in choferes_por_vencer:
            alertas.append({
                'tipo':      'licencia',
                'nombre':    c['nombre'] or '(sin nombre)',
                'fecha':     c['fecha_vencimiento_licencia'].strftime('%d/%m/%Y'),
                'fecha_raw': c['fecha_vencimiento_licencia'].isoformat(),
            })

        for t in tractos_por_vencer:
            nombre_tracto = ' '.join(
                str(v) for v in (t['unidad'], t['anio'], t['placas']) if v
            ).strip()
            alertas.append({
                'tipo':      'poliza',
                'nombre':    nombre_tracto or '(sin datos)',
                'fecha':     t['fecha_vencimiento_poliza'].strftime('%d/%m/%Y'),
                'fecha_raw': t['fecha_vencimiento_poliza'].isoformat(),
            })

        alertas.sort(key=lambda a: a['fecha_raw'])

        return Response(alertas)
