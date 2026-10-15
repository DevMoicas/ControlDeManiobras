"""Facturación: filas por maniobra, carga del XML, ingresos en Gastos, y la
Auditoría del Excel que las compara.

Fase 1 de docs/planes/PLAN_MODULO_FINANZAS.md (rama main). El número entre
paréntesis, p. ej. (P11), remite a la pregunta de PREGUNTAS_MODULO_FINANZAS.md
que lo decidió.

Desde el 2026-10-15 hay dos tablas (usuario):
- `Factura` = FACTURACIÓN. Nace al asignar el folio, la liga el No. Factura y
  la rellena el XML. Es la que manda: Cobrar, Dashboards e Ingresos.
- `FacturaExcel` = AUDITORÍA. El Excel de siempre, solo para comparar.
"""
import csv
import io
import re
import unicodedata
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import TruncWeek
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .db_context import get_db_alias
from .models import Empleado, Factura, FacturaExcel, Gasto, PerfilUsuario

# ── Quién entra ──────────────────────────────────────────────────────────────
# Cerrado por defecto (P45, P64): staff o uno de estos cargos EXACTOS. Sin
# perfil, sin empleado, empleado borrado u otro cargo → fuera. Al revés que el
# plan de roles por cargo, que deja pasar: aquí se trata de dinero.
CARGOS_FINANZAS = {'COMERCIAL', 'DIRECTOR GENERAL', 'DIRECTOR OPERATIVO',
                      'DIRECTORA COMERCIAL'}


# El rendimiento que calcula el sistema en Reportes de Viaje: staff y dirección,
# sin Comercial (usuario, 2026-10-13).
CARGOS_DIRECCION = {'DIRECTOR GENERAL', 'DIRECTOR OPERATIVO', 'DIRECTORA COMERCIAL'}


def cargo_de(usuario):
    """El cargo del empleado ligado al usuario, normalizado; '' sin empleado."""
    try:
        empleado = usuario.perfil.empleado
    except (PerfilUsuario.DoesNotExist, Empleado.DoesNotExist):
        return ''
    # strip/upper: empleados.cargo es texto libre editable a mano en pgAdmin.
    return (empleado.cargo or '').strip().upper() if empleado else ''


def staff_o_cargo(usuario, cargos):
    return usuario.is_staff or cargo_de(usuario) in cargos


def admin_de_sistemas(usuario):
    """Folios: staff Y cargo SISTEMAS, las dos (usuario, 2026-10-14). Al reves
    que el resto, ser admin no basta."""
    return usuario.is_staff and cargo_de(usuario) == 'SISTEMAS'


def puede_finanzas(usuario):
    return staff_o_cargo(usuario, CARGOS_FINANZAS)


def ve_rendimiento(usuario):
    return staff_o_cargo(usuario, CARGOS_DIRECCION)


# ── Serie + folio ────────────────────────────────────────────────────────────
EMPRESA_DE_SERIE = {'SEF': 'soluciones', 'S': 'fraba'}  # P29, P61
# Facturación empieza con las maniobras de julio de 2026 (usuario, 2026-10-15):
# las anteriores no entran, para no tener que subir el XML de cada factura vieja.
INICIO_FACTURACION = date(2026, 7, 1)

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


def _vacia(factura):
    """Sin XML ni cobro capturado: solo el hueco de una factura por emitir. Es
    la única fila que se borra, y la misma condición la exige la política de
    borrado de la base (migración 0081)."""
    return factura.uuid is None and factura.fecha_cobro is None and not factura.clave_rastreo


def sincronizar_facturas(maniobra, usuario):
    """Deja las filas de Facturación de la maniobra como dice su No. Factura.

    Una fila por factura nombrada; sin ninguna nombrada, una vacía, que es la
    que nace al asignar el folio (usuario, 2026-10-15). Sin folio y sin filas
    aún no hay nada que facturar.

    Cada factura nombrada: si la maniobra ya la tiene, se queda; si su XML llegó
    antes y está sin ligar, se liga; si la tiene otra maniobra no se le quita
    (con un número mal tecleado, robársela a la correcta sería un error
    silencioso, P3); si no, se reaprovecha una fila vacía o se crea.
    Lo que sobra: la fila con XML o con cobro se suelta y queda pendiente de
    ligar; la vacía se borra, salvo que sea la única que le queda.
    """
    if not maniobra.fecha_pis or maniobra.fecha_pis < INICIO_FACTURACION:
        return  # anterior a Facturación, o sin fecha para saberlo: no se toca
    propias = list(Factura.objects.filter(maniobra=maniobra).order_by('id'))
    tiene_folio = (maniobra.folio or '').strip() or (maniobra.folio_2 or '').strip()
    if not propias and not tiene_folio:
        return
    nombradas = list(dict.fromkeys(facturas_de_no_factura(maniobra.no_factura)))
    tiene = {(f.serie, f.folio) for f in propias}
    sobran = [f for f in propias if (f.serie, f.folio) not in nombradas]
    dinero = False  # solo si se liga o suelta una con importe se tocan los Ingresos

    for serie, folio in nombradas:
        if (serie, folio) in tiene:
            continue
        mismas = Factura.objects.filter(serie=serie, folio=folio)
        suelta = mismas.filter(maniobra__isnull=True).first()
        if suelta:
            suelta.maniobra, suelta.updated_by = maniobra, usuario
            suelta.save(update_fields=['maniobra', 'updated_by', 'updated_at'])
            dinero |= suelta.total is not None
            continue
        if mismas.exists():
            continue  # es de otra maniobra
        datos = {'serie': serie, 'folio': folio, 'empresa': EMPRESA_DE_SERIE.get(serie, '')}
        hueco = next((f for f in sobran if _vacia(f)), None)
        if hueco:
            sobran.remove(hueco)
            for campo, valor in datos.items():
                setattr(hueco, campo, valor)
            hueco.updated_by = usuario
            hueco.save(update_fields=[*datos, 'updated_by', 'updated_at'])
        else:
            Factura.objects.create(maniobra=maniobra, created_by=usuario,
                                   updated_by=usuario, **datos)

    for f in sorted(sobran, key=_vacia):  # primero las que se sueltan
        if not _vacia(f):
            f.maniobra, f.updated_by = None, usuario
            f.save(update_fields=['maniobra', 'updated_by', 'updated_at'])
            dinero |= f.total is not None
        elif Factura.objects.filter(maniobra=maniobra).exclude(pk=f.pk).exists():
            f.delete()
        elif f.serie or f.folio:
            f.serie = f.folio = f.empresa = ''
            f.updated_by = usuario
            f.save(update_fields=['serie', 'folio', 'empresa', 'updated_by', 'updated_at'])

    if tiene_folio and not Factura.objects.filter(maniobra=maniobra).exists():
        # Con folio y sin factura nombrada (recién puesto, o se soltaron todas):
        # la fila por emitir.
        Factura.objects.create(maniobra=maniobra, created_by=usuario, updated_by=usuario)
    if dinero:
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

    existentes = set(FacturaExcel.objects.values_list('uuid', flat=True))
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
            nuevas.append(FacturaExcel(
                empresa=EMPRESA_DE_SERIE[serie], serie=serie, folio=folio, uuid=uuid,
                nombre=str(dato['nombre'] or '').strip()[:255],
                rfc=str(dato['rfc'] or '').strip()[:20],
                fecha_emision=fecha, subtotal=subtotal, iva=iva, total=total,
                created_by=usuario, updated_by=usuario,
            ))

    # Solo Auditoría: ya no liga ni toca Ingresos, eso es de Facturación.
    FacturaExcel.objects.bulk_create(nuevas)
    return {'creadas': len(nuevas), 'omitidas': omitidas}


# ── Lectura del XML (CFDI) ───────────────────────────────────────────────────
MAX_XML = 2 * 1024 * 1024  # un CFDI con Carta Porte pesa decenas de KB


def _local(etiqueta):
    """'{http://www.sat.gob.mx/cfd/4}Receptor' → 'Receptor'. Por nombre local:
    así lee igual el CFDI 4.0 que el 3.3."""
    return etiqueta.rsplit('}', 1)[-1]


def _hijos(nodo, nombre):
    return [h for h in (nodo if nodo is not None else []) if _local(h.tag) == nombre]


def _primero(nodo, nombre):
    return next(iter(_hijos(nodo, nombre)), None)


def _unir(valores):
    return ' / '.join(dict.fromkeys(v.strip() for v in valores if v and v.strip()))


def leer_cfdi(contenido):
    """Los datos de un CFDI. ValueError con el motivo si no se puede leer.

    El SAT exige UTF-8 y un CFDI nunca trae DOCTYPE: el que lo trae se rechaza
    antes de parsear. Eso cierra las bombas de entidades y las entidades
    externas sin añadir defusedxml.
    """
    if len(contenido) > MAX_XML:
        raise ValueError('El archivo pasa de 2 MB')
    try:
        texto = contenido.decode('utf-8-sig').upper()
    except UnicodeDecodeError:
        raise ValueError('No está en UTF-8') from None
    if '<!DOCTYPE' in texto or '<!ENTITY' in texto:
        raise ValueError('No es un CFDI válido')
    try:
        raiz = ET.fromstring(contenido)
    except ET.ParseError:
        raise ValueError('No es un XML válido') from None
    if _local(raiz.tag) != 'Comprobante':
        raise ValueError('No es un CFDI')

    a = raiz.attrib
    receptor = _primero(raiz, 'Receptor')
    impuestos = _primero(raiz, 'Impuestos')  # el del comprobante, no el de cada concepto
    conceptos = _hijos(_primero(raiz, 'Conceptos'), 'Concepto')
    timbre = next((n for n in raiz.iter() if _local(n.tag) == 'TimbreFiscalDigital'), None)
    de = lambda nodo, clave: (nodo.get(clave) or '') if nodo is not None else ''
    return {
        'tipo': a.get('TipoDeComprobante', '').strip().upper(),
        'moneda': a.get('Moneda', '').strip().upper(),
        'serie': a.get('Serie', '').strip().upper(),
        'folio': _folio(a.get('Folio', '')),
        'fecha': _fecha(a.get('Fecha')),
        'subtotal': _importe(a.get('SubTotal')),
        'iva': _importe(de(impuestos, 'TotalImpuestosTrasladados'), obligatorio=False),
        # El Total del CFDI: con IVA y sin la retención (usuario, 2026-10-15).
        'total': _importe(a.get('Total')),
        'uuid': de(timbre, 'UUID').strip().lower(),
        'nombre': de(receptor, 'Nombre').strip()[:255],
        'rfc': de(receptor, 'Rfc').strip().upper()[:20],
        'no_identificacion': _unir(c.get('NoIdentificacion') for c in conceptos),
        'descripcion': _unir(c.get('Descripcion') for c in conceptos),
    }


# Lo que escribe el XML. Sin `estado` ni la liga: el rol estándar no tiene
# permiso sobre esas columnas (migración 0081).
CAMPOS_XML = ['empresa', 'serie', 'folio', 'uuid', 'nombre', 'rfc', 'fecha_emision',
              'subtotal', 'iva', 'total', 'moneda', 'no_identificacion', 'descripcion']


def cargar_xml(archivos, usuario):
    """Rellena con cada XML la fila de Facturación de su serie y folio.

    Sin fila que lo espere, crea una sin maniobra (pendiente de ligar) que se
    liga sola cuando alguien capture ese No. Factura (usuario, 2026-10-15).
    Como el Excel, un archivo malo no para la carga: se apunta en `omitidas`.
    """
    omitidas, completadas, sin_maniobra, maniobras = [], 0, 0, set()
    vistos = set(Factura.objects.exclude(uuid=None).values_list('uuid', flat=True))
    with transaction.atomic(using=get_db_alias()):
        for archivo in archivos:
            def omitir(motivo, d=None):
                omitidas.append({'archivo': archivo.name, 'serie': (d or {}).get('serie', ''),
                                 'folio': (d or {}).get('folio') or '', 'motivo': motivo})
            try:
                d = leer_cfdi(archivo.read(MAX_XML + 1))
            except ValueError as e:
                omitir(str(e))
                continue
            if d['tipo'] != 'I':  # P66: solo comprobantes de ingreso
                omitir(f'Tipo de comprobante {d["tipo"] or "vacío"}, no es de ingreso', d)
                continue
            if d['moneda'] != 'MXN':  # P17
                omitir(f'Moneda {d["moneda"] or "vacía"}, solo se admite MXN', d)
                continue
            if d['serie'] not in EMPRESA_DE_SERIE:
                omitir(f'Serie desconocida: {d["serie"] or "vacía"}', d)
                continue
            if not d['uuid']:
                omitir('Sin UUID: no está timbrado', d)
                continue
            if d['uuid'] in vistos:
                omitir('Ese XML ya estaba cargado', d)
                continue
            if not d['folio'] or not d['fecha'] or d['subtotal'] is None or d['total'] is None:
                omitir('Folio, fecha o importes ilegibles', d)
                continue
            mismas = Factura.objects.filter(serie=d['serie'], folio=d['folio'])
            huecos = list(mismas.filter(uuid__isnull=True)[:2])
            if len(huecos) > 1:
                omitir('Varias maniobras tienen ese No. Factura: corrígelo en Control de viajes', d)
                continue
            if not huecos and mismas.exists():
                omitir('Ya hay otro XML con esa serie y folio', d)
                continue

            vistos.add(d['uuid'])
            f = huecos[0] if huecos else Factura(created_by=usuario)
            f.empresa, f.fecha_emision, f.moneda = EMPRESA_DE_SERIE[d['serie']], d['fecha'], 'MXN'
            for campo in CAMPOS_XML:
                if campo in d:
                    setattr(f, campo, d[campo])
            f.updated_by = usuario
            if f.pk:
                f.save(update_fields=CAMPOS_XML + ['updated_by', 'updated_at'])
                completadas += 1
                maniobras.add(f.maniobra_id)
            else:
                f.save()
                sin_maniobra += 1
        recalcular_ingresos(maniobras, usuario)
    return {'completadas': completadas, 'sin_maniobra': sin_maniobra, 'omitidas': omitidas}


# ── Auditoría: Excel contra Facturación ──────────────────────────────────────
def _igual(valor):
    """Para comparar sin que cuenten mayúsculas ni espacios de más."""
    return ' '.join(str(valor if valor is not None else '').split()).upper()


COMPARADOS = (('nombre', 'Cliente'), ('rfc', 'RFC'), ('fecha_emision', 'Fecha de emisión'),
              ('total', 'Total'), ('uuid', 'UUID'), ('estado', 'Estado'))


def _folio_de_maniobra(factura):
    try:
        return factura.maniobra.folio if factura.maniobra_id else None
    except ObjectDoesNotExist:
        return None


def comparar():
    """Cada factura del Excel contra su pareja de Facturación (misma serie y
    folio), y las de Facturación con XML que el Excel no trae.

    La maniobra y el vencimiento de una fila de Auditoría son los de su pareja:
    el Excel no se liga por su cuenta. El UUID se compara pero no sale.
    """
    pareja = {}
    for f in (Factura.objects.exclude(serie='')
              .select_related('maniobra__cliente_fk__cliente_principal').order_by('id')):
        clave = (f.serie, f.folio)
        if clave not in pareja or (pareja[clave].uuid is None and f.uuid):
            pareja[clave] = f  # si hay dos, la que ya tiene XML

    filas, en_excel = [], set()
    for e in FacturaExcel.objects.all():
        clave = (e.serie, e.folio)
        en_excel.add(clave)
        f = pareja.get(clave)
        if f is None:
            diferencias = ['Falta en Facturación']
        elif f.uuid is None:
            diferencias = ['Falta el XML en Facturación']
        else:
            diferencias = [etiqueta for campo, etiqueta in COMPARADOS
                           if _igual(getattr(e, campo)) != _igual(getattr(f, campo))]
        principal = principal_de(f) if f else None
        filas.append({
            'id': e.id, 'empresa': e.empresa, 'serie': e.serie, 'folio': e.folio,
            'nombre': e.nombre, 'rfc': e.rfc, 'fecha_emision': e.fecha_emision,
            'total': _dinero(e.total), 'estado': e.estado,
            'vencimiento': (e.fecha_emision + timedelta(days=principal.dias_credito)
                            if principal else None),
            'maniobra': f.maniobra_id if f else None,
            'maniobra_folio': _folio_de_maniobra(f) if f else None,
            'diferencias': diferencias,
        })
    solo = [{'id': f.id, 'serie': f.serie, 'folio': f.folio, 'nombre': f.nombre,
             'total': _dinero(f.total)}
            for clave, f in pareja.items() if f.uuid and clave not in en_excel]
    return {'facturas': filas, 'solo_en_facturacion': solo}


# ── Cuentas por cobrar (Fase 3) ──────────────────────────────────────────────
# Tramos de antigüedad por días VENCIDOS (P28). `por_vencer` son las que aún no
# llegan a su vencimiento.
# El "hoy" de la antigüedad es el de México, no el del servidor (TIME_ZONE =
# 'UTC'): con UTC, desde las 18:00 locales todas las facturas envejecerían un
# día antes de tiempo. Misma zona que _ZONA_OPERACION en views.py.
ZONA_OPERACION = ZoneInfo('America/Mexico_City')

TRAMOS = [('por_vencer', None), ('0_30', 30), ('31_60', 60), ('61_90', 90), ('mas_90', None)]


def _dinero(valor):
    """Como el resto de la API (DecimalField del serializer): texto con dos
    decimales. Un Decimal suelto en un Response saldría como float en el JSON."""
    return str(Decimal(valor or 0).quantize(Decimal('0.01')))


def principal_de(factura):
    """El cliente principal de la factura, vía maniobra → dirección. None si
    falta cualquier eslabón."""
    try:
        direccion = factura.maniobra.cliente_fk if factura.maniobra_id else None
        return direccion.cliente_principal if direccion else None
    except (AttributeError, ObjectDoesNotExist):
        # Maniobra o dirección borradas a mano (sin FK en la base): sin cliente.
        return None


def vencimiento(factura):
    """Emisión + días de crédito del principal, en días naturales (P28, P36).
    Calculado y no guardado: cambiar los días de un cliente mueve sus facturas.
    None sin maniobra ligada o sin cliente principal: no hay días que aplicar."""
    principal = principal_de(factura) if factura.fecha_emision else None
    return factura.fecha_emision + timedelta(days=principal.dias_credito) if principal else None


def tramo(dias_vencida):
    if dias_vencida < 0:
        return 'por_vencer'
    for clave, tope in TRAMOS[1:-1]:
        if dias_vencida <= tope:
            return clave
    return 'mas_90'


def cuentas_por_cobrar(hoy):
    """Facturas activas sin cobrar, con su antigüedad.

    Una factura sin maniobra ligada o cuya dirección no tiene cliente principal
    no tiene días de crédito: se lista aparte y queda FUERA de la antigüedad
    hasta que se ligue (decidido con el usuario el 2026-09-30).
    """
    antiguedad = {clave: Decimal('0') for clave, _ in TRAMOS}
    fuera = {'pendiente_de_ligar': Decimal('0'), 'sin_cliente_principal': Decimal('0')}
    filas = []
    qs = (Factura.objects.filter(estado='activa', fecha_cobro__isnull=True, total__isnull=False)
          .select_related('maniobra__cliente_fk__cliente_principal')
          .order_by('fecha_emision', 'id'))
    for f in qs:
        principal, venc = principal_de(f), vencimiento(f)
        if venc is None:
            situacion = 'pendiente_de_ligar' if not f.maniobra_id else 'sin_cliente_principal'
            fuera[situacion] += f.total
            dias, clave = None, None
        else:
            situacion = 'con_credito'
            dias = (hoy - venc).days
            clave = tramo(dias)
            antiguedad[clave] += f.total
        filas.append({
            'id': f.id, 'empresa': f.empresa, 'serie': f.serie, 'folio': f.folio,
            'nombre': f.nombre, 'fecha_emision': f.fecha_emision, 'total': _dinero(f.total),
            'cliente_principal': principal.nombre if principal else None,
            'vencimiento': venc, 'dias_vencida': dias, 'tramo': clave,
            'situacion': situacion,
        })
    return {'facturas': filas,
            'antiguedad': {k: _dinero(v) for k, v in antiguedad.items()},
            'fuera_de_antiguedad': {k: _dinero(v) for k, v in fuera.items()},
            'total': _dinero(sum(antiguedad.values()) + sum(fuera.values()))}


def cobranza_semanal(desde=None, hasta=None):
    """Total de las facturas activas por semana (lunes) de su EMISIÓN (P67,
    P70). No depende de si están cobradas. Sin XML no hay emisión: no cuenta."""
    qs = Factura.objects.filter(estado='activa', fecha_emision__isnull=False)
    if desde:
        qs = qs.filter(fecha_emision__gte=desde)
    if hasta:
        qs = qs.filter(fecha_emision__lte=hasta)
    return [{'semana': fila['semana'], 'total': _dinero(fila['total'])}
            for fila in (qs.annotate(semana=TruncWeek('fecha_emision'))
                         .values('semana').annotate(total=Sum('total')).order_by('semana'))]


# ── API ──────────────────────────────────────────────────────────────────────
class FacturaSerializer(serializers.ModelSerializer):
    # El folio de la maniobra ligada (P15). El UUID no sale nunca (P16).
    maniobra_folio = serializers.CharField(source='maniobra.folio', default=None,
                                           read_only=True)
    vencimiento = serializers.SerializerMethodField()

    def get_vencimiento(self, factura):
        return vencimiento(factura)

    class Meta:
        model = Factura
        fields = ['id', 'empresa', 'serie', 'folio', 'nombre', 'rfc',
                  'fecha_emision', 'subtotal', 'iva', 'total', 'estado',
                  'no_identificacion', 'descripcion', 'fecha_cobro', 'clave_rastreo',
                  'maniobra', 'maniobra_folio', 'vencimiento']
        read_only_fields = fields


class CobroSerializer(serializers.Serializer):
    """Lo único que se escribe a mano en Facturación (usuario, 2026-10-15)."""
    fecha_cobro = serializers.DateField(required=False, allow_null=True)
    clave_rastreo = serializers.RegexField(
        r'^[A-Za-z0-9]*$', max_length=50, required=False, allow_null=True, allow_blank=True,
        error_messages={'invalid': 'La clave de rastreo solo admite letras y números.'})


class CancelableMixin:
    """Cancelar y reactivar: solo staff (P65), que escribe como superusuario."""

    def _cambiar_estado(self, request, estado):
        if not request.user.is_staff:
            raise PermissionDenied('Solo un administrador puede cancelar o reactivar facturas.')
        factura = self.get_object()
        with transaction.atomic(using=get_db_alias()):
            factura.estado = estado
            factura.updated_by = request.user.username
            factura.save(update_fields=['estado', 'updated_by', 'updated_at'])
            if isinstance(factura, Factura):
                recalcular_ingresos([factura.maniobra_id], request.user.username)
        return Response(self.get_serializer(factura).data)

    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        return self._cambiar_estado(request, 'cancelada')

    # ponytail: reactivar no se pidió; existe para deshacer una cancelación por error.
    @action(detail=True, methods=['post'])
    def reactivar(self, request, pk=None):
        return self._cambiar_estado(request, 'activa')


class FacturaViewSet(CancelableMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """FACTURACIÓN. Solo lectura salvo el XML y el cobro: las filas las crea la
    maniobra y las rellena el XML; nadie teclea importes (P14, P65)."""
    serializer_class = FacturaSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # `acceso` responde a cualquiera: es como el frontend sabe si pintar
        # la tarjeta. Todo lo demás, solo quien puede.
        if self.action != 'acceso' and not puede_finanzas(request.user):
            raise PermissionDenied('Facturación es solo para dirección, comercial y administradores.')

    def get_queryset(self):
        qs = Factura.objects.select_related('maniobra__cliente_fk__cliente_principal')
        estado = self.request.query_params.get('estado')
        return qs.filter(estado=estado) if estado in ('activa', 'cancelada') else qs

    @action(detail=False, methods=['get'])
    def acceso(self, request):
        return Response({'ver': puede_finanzas(request.user),
                         'auditoria': request.user.is_staff,
                         'cancelar': request.user.is_staff})

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def xml(self, request):
        archivos = request.FILES.getlist('archivos')
        if not archivos:
            return Response({'detail': 'Falta el XML.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(cargar_xml(archivos, request.user.username), status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='cuentas-por-cobrar')
    def cuentas_por_cobrar(self, request):
        return Response(cuentas_por_cobrar(datetime.now(ZONA_OPERACION).date()))

    @action(detail=False, methods=['get'], url_path='cobranza-semanal')
    def cobranza_semanal(self, request):
        desde = _fecha(request.query_params.get('desde')) if request.query_params.get('desde') else None
        hasta = _fecha(request.query_params.get('hasta')) if request.query_params.get('hasta') else None
        return Response(cobranza_semanal(desde, hasta))

    @action(detail=True, methods=['post'])
    def cobro(self, request, pk=None):
        """Fecha de cobro y clave de rastreo, a mano (P27). Solo los campos que
        vengan; null o vacío los limpia."""
        datos = CobroSerializer(data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        factura = self.get_object()
        campos = []
        if 'fecha_cobro' in datos.validated_data:
            factura.fecha_cobro = datos.validated_data['fecha_cobro']
            campos.append('fecha_cobro')
        if 'clave_rastreo' in datos.validated_data:
            factura.clave_rastreo = (datos.validated_data['clave_rastreo'] or '').upper()
            campos.append('clave_rastreo')
        factura.updated_by = request.user.username
        factura.save(update_fields=campos + ['updated_by', 'updated_at'])
        return Response(self.get_serializer(factura).data)


class FacturaExcelSerializer(serializers.ModelSerializer):
    class Meta:
        model = FacturaExcel
        fields = ['id', 'empresa', 'serie', 'folio', 'nombre', 'rfc',
                  'fecha_emision', 'total', 'estado']
        read_only_fields = fields


class FacturaExcelViewSet(CancelableMixin, viewsets.GenericViewSet):
    """AUDITORÍA: el Excel y su comparación con Facturación. Solo admin
    (usuario, 2026-10-14)."""
    serializer_class = FacturaExcelSerializer
    queryset = FacturaExcel.objects.all()

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not request.user.is_staff:
            raise PermissionDenied('Auditoría es solo para administradores.')

    @action(detail=False, methods=['get'])
    def comparacion(self, request):
        return Response(comparar())

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
