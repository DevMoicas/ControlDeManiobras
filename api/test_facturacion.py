"""Facturación (Fase 1 de docs/planes/PLAN_MODULO_FINANZAS.md, rama main).

Se cubre lo que decidiría mal en silencio: quién entra, qué filas del Excel y
qué XML se omiten, qué filas de Facturación nacen de cada maniobra, qué acaba en
Ingresos de Gastos y qué marca la Auditoría como distinto.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
import io
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connections
from django.test import SimpleTestCase, TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from api.facturacion import cliente_parecido, facturas_de_no_factura, leer_movimientos
from api.models import (Abono, ClientePrincipal, Empleado, Factura, FacturaExcel, Gasto, Maniobra,
                        Pago, PerfilUsuario, Vacio)

URL = '/api/facturas/'
EXCEL = '/api/facturas-excel/'
CABECERA = ['Nombre', 'RFC', 'Tipo Comprobante', ' Serie', ' Folio', 'UUID',
            'Fecha Emisión', 'Subtotal', 'IVA Tras', 'Total', 'Moneda']


def fila(serie='SEF', folio=456, uuid='u-1', tipo='I', moneda='MXN', total=117600):
    return ['REAL SHIPPING', 'RST100127FE0', tipo, serie, folio, uuid,
            '2026-08-31T17:30:00', 105000, 16800, total, moneda]


def xlsx(*filas, cabecera=CABECERA):
    wb = Workbook()
    wb.active.append(cabecera)
    for f in filas:
        wb.active.append(f)
    buf = io.BytesIO()
    wb.save(buf)
    return SimpleUploadedFile('ingresos.xlsx', buf.getvalue())


def cfdi(serie='S', folio='1713', uuid='U-1', total='50400.00', tipo='I', moneda='MXN',
         nombre='HELIUS LOGISTICS', conceptos=(('CAJA SECA 53 QRO', 'FLETE A QUERETARO'),)):
    """Un CFDI 4.0 mínimo con la forma del de ejemplo (FACTURA S 1713.xml):
    impuestos por concepto Y del comprobante, y el timbre en el Complemento."""
    c = ''.join(
        f'<cfdi:Concepto NoIdentificacion="{n}" Descripcion="{d}" Importe="45000.00">'
        '<cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Importe="1.00"/></cfdi:Traslados>'
        '</cfdi:Impuestos></cfdi:Concepto>' for n, d in conceptos)
    xml = (f'<?xml version="1.0" encoding="utf-8"?>'
           f'<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" '
           f'Serie="{serie}" Folio="{folio}" Fecha="2026-02-16T15:42:00" SubTotal="45000.00" '
           f'Moneda="{moneda}" Total="{total}" TipoDeComprobante="{tipo}">'
           f'<cfdi:Receptor Rfc="hlo250520168" Nombre="{nombre}"/>'
           f'<cfdi:Conceptos>{c}</cfdi:Conceptos>'
           f'<cfdi:Impuestos TotalImpuestosRetenidos="1800.00" TotalImpuestosTrasladados="7200.00"/>'
           f'<cfdi:Complemento><tfd:TimbreFiscalDigital '
           f'xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="{uuid}"/>'
           f'</cfdi:Complemento></cfdi:Comprobante>')
    return SimpleUploadedFile(f'{serie}{folio}.xml', xml.encode('utf-8'))


class NoFacturaTests(SimpleTestCase):

    def test_una_o_dos_diagonales_y_el_trozo_sin_serie_hereda(self):
        self.assertEqual(facturas_de_no_factura('I 154/ 153'), [('I', '154'), ('I', '153')])
        self.assertEqual(facturas_de_no_factura('I 154 // 153'), [('I', '154'), ('I', '153')])

    def test_ignora_mayusculas_espacios_guiones_y_ceros(self):
        for texto in ('SEF 456', 'sef456', 'SEF-456', 'SEF 0456'):
            self.assertEqual(facturas_de_no_factura(texto), [('SEF', '456')], texto)

    def test_lo_que_no_es_factura_no_nombra_nada(self):
        for texto in ('EFECTIVO', '201', '', None):
            self.assertEqual(facturas_de_no_factura(texto), [], texto)


class Base(TestCase):
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            for modelo in (Maniobra, Gasto, Vacio, Empleado):
                editor.create_model(modelo)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            for modelo in (Empleado, Vacio, Gasto, Maniobra):
                editor.delete_model(modelo)
        super().tearDownClass()

    def usuario(self, nombre='u', staff=False, cargo=None):
        u = get_user_model().objects.create_user(nombre, password='x', is_staff=staff)
        if cargo is not None:
            e = Empleado.objects.create(nombre_trabajador=nombre, cargo=cargo)
            PerfilUsuario.objects.create(usuario=u, empleado=e)
        c = APIClient()
        c.force_authenticate(user=u)
        return c

    def cargar(self, cliente, archivo):
        return cliente.post(f'{EXCEL}cargar/', {'archivo': archivo}, format='multipart')

    def xml(self, cliente, *archivos):
        return cliente.post(f'{URL}xml/', {'archivos': list(archivos)}, format='multipart')


class AccesoTests(Base):

    def test_staff_y_los_cuatro_cargos_entran(self):
        clientes = [self.usuario('admin', staff=True)] + [
            self.usuario(f'c{i}', cargo=cargo) for i, cargo in enumerate(
                ['Comercial', ' director general ', 'DIRECTOR OPERATIVO', 'Directora Comercial'])]
        for c in clientes:
            self.assertEqual(c.get(f'{URL}cuentas-por-cobrar/').status_code, 200)
            self.assertEqual(c.get(URL).status_code, 200)   # Facturación
            self.assertTrue(c.get(f'{URL}acceso/').data['ver'])

    def test_auditoria_solo_admin(self):
        """Auditoría (el Excel y su comparación) es solo de admin desde el
        2026-10-14; Facturación es de todos los de Finanzas."""
        com = self.usuario('com', cargo='Director General')
        self.assertEqual(com.get(f'{EXCEL}comparacion/').status_code, 403)
        self.assertEqual(self.cargar(com, xlsx(fila())).status_code, 403)
        self.assertFalse(com.get(f'{URL}acceso/').data['auditoria'])
        admin = self.usuario('admin', staff=True)
        self.assertEqual(admin.get(f'{EXCEL}comparacion/').status_code, 200)
        self.assertTrue(admin.get(f'{URL}acceso/').data['auditoria'])

    def test_cerrado_por_defecto(self):
        sin_perfil = self.usuario('a')
        otro_cargo = self.usuario('b', cargo='Coordinador')
        u = get_user_model().objects.create_user('c', password='x')
        PerfilUsuario.objects.create(usuario=u, empleado=None)
        sin_empleado = APIClient()
        sin_empleado.force_authenticate(user=u)
        for c in (sin_perfil, otro_cargo, sin_empleado):
            self.assertEqual(c.get(URL).status_code, 403)
            self.assertEqual(self.xml(c, cfdi()).status_code, 403)
            self.assertEqual(self.cargar(c, xlsx(fila())).status_code, 403)
            self.assertEqual(c.get(f'{URL}acceso/').data,
                             {'ver': False, 'auditoria': False, 'cancelar': False})

    def test_el_uuid_no_sale_nunca(self):
        c = self.usuario('admin', staff=True)
        self.xml(c, cfdi())
        self.cargar(c, xlsx(fila()))
        self.assertNotIn('uuid', c.get(URL).data['results'][0])
        self.assertNotIn('uuid', c.get(f'{EXCEL}comparacion/').data['results'][0])


class CargaExcelTests(Base):
    """El Excel va solo a Auditoría: ni liga ni toca Ingresos."""

    def setUp(self):
        self.c = self.usuario('admin', staff=True)

    def test_omite_y_explica_lo_que_no_entra(self):
        r = self.cargar(self.c, xlsx(
            fila(uuid='a'),
            fila(uuid='A'),                    # repetido (mayúsculas no cuentan)
            fila(uuid='b', moneda='USD'),
            fila(uuid='c', tipo='E'),
            fila(uuid='d', serie='X'),
            fila(uuid='e', serie='S', folio='0155'),
        ))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['creadas'], 2)
        motivos = [o['motivo'] for o in r.data['omitidas']]
        self.assertEqual(len(motivos), 4)
        self.assertIn('UUID repetido', motivos)
        f = FacturaExcel.objects.get(uuid='e')
        self.assertEqual((f.empresa, f.serie, f.folio), ('fraba', 'S', '155'))
        self.assertEqual(FacturaExcel.objects.get(uuid='a').empresa, 'soluciones')

    def test_recargar_el_mismo_archivo_no_duplica(self):
        self.cargar(self.c, xlsx(fila()))
        r = self.cargar(self.c, xlsx(fila()))
        self.assertEqual(r.data['creadas'], 0)
        self.assertEqual(FacturaExcel.objects.count(), 1)

    def test_csv(self):
        texto = ','.join(CABECERA) + '\n' + ','.join(str(v) for v in fila()) + '\n'
        r = self.cargar(self.c, SimpleUploadedFile('i.csv', texto.encode('utf-8')))
        self.assertEqual(r.data['creadas'], 1, r.data)

    def test_falta_una_columna(self):
        r = self.cargar(self.c, xlsx(fila()[:-1], cabecera=CABECERA[:-1]))
        self.assertEqual(r.status_code, 400)
        self.assertIn('moneda', r.data['detail'])

    def test_no_crea_facturas_ni_toca_ingresos(self):
        m = Maniobra.objects.create(folio='F-1', no_factura='SEF 456')
        Gasto.objects.create(maniobra=m, facturado='7')
        self.cargar(self.c, xlsx(fila()))
        self.assertEqual(Factura.objects.count(), 0)
        self.assertEqual(Gasto.objects.get(maniobra=m).facturado, '7')


JULIO = date(2026, 7, 1)  # una fecha cualquiera dentro de Facturación


class FilasDeLaManiobraTests(Base):
    """Las filas de Facturación nacen al asignar el folio y las ordena el
    No. Factura (usuario, 2026-10-15)."""

    def setUp(self):
        self.c = self.usuario('cap')   # cualquiera que capture Control de viajes
        self.m = Maniobra.objects.create(solicita='X', fecha_pis=JULIO)

    def guardar(self, **campos):
        return self.c.patch(f'/api/maniobras/{self.m.id}/', campos, format='json')

    def filas(self):
        return sorted((f.serie, f.folio) for f in Factura.objects.filter(maniobra=self.m))

    def test_nace_vacia_al_poner_el_folio_y_no_antes(self):
        self.guardar(no_factura='S 1')
        self.assertEqual(Factura.objects.count(), 0)   # sin folio aún no hay nada
        self.guardar(folio='F-1')
        self.assertEqual(self.filas(), [('S', '1')])

    def test_una_fila_por_factura_y_la_vacia_se_reaprovecha(self):
        self.guardar(folio='F-1')
        self.assertEqual(self.filas(), [('', '')])
        vacia = Factura.objects.get()
        self.guardar(no_factura='S 1 / 2')
        self.assertEqual(self.filas(), [('S', '1'), ('S', '2')])
        self.assertTrue(Factura.objects.filter(pk=vacia.pk, serie='S').exists())
        self.assertEqual(Factura.objects.get(folio='1').empresa, 'fraba')

    def test_quitar_una_factura_borra_su_fila_vacia_pero_deja_una(self):
        self.guardar(folio='F-1', no_factura='S 1 / 2')
        self.guardar(no_factura='S 1')
        self.assertEqual(self.filas(), [('S', '1')])
        self.guardar(no_factura='EFECTIVO')
        self.assertEqual(self.filas(), [('', '')])

    def test_la_que_tiene_xml_o_cobro_se_suelta_no_se_borra(self):
        self.guardar(folio='F-1', no_factura='S 1713 / 2')   # el folio crea también el gasto
        self.xml(self.usuario('admin', staff=True), cfdi(total='100'))
        self.assertEqual(Decimal(Gasto.objects.get(maniobra=self.m).facturado), Decimal('100'))
        Factura.objects.filter(folio='2').update(clave_rastreo='ABC')
        self.guardar(no_factura='')
        self.assertEqual(Factura.objects.filter(maniobra=None).count(), 2)
        self.assertEqual(self.filas(), [('', '')])
        self.assertIsNone(Gasto.objects.get(maniobra=self.m).facturado)

    def test_solo_desde_2026(self):
        self.m.fecha_pis = date(2025, 12, 31)
        self.m.save()
        self.guardar(folio='F-1', no_factura='S 1')
        self.assertEqual(Factura.objects.count(), 0)
        self.guardar(fecha_pis=None)                   # sin fecha tampoco
        self.assertEqual(Factura.objects.count(), 0)

    def test_enero_2026_ya_entra(self):
        # Desde el 2026-10-16; antes empezaba en julio.
        self.m.fecha_pis = date(2026, 1, 1)
        self.m.save()
        self.guardar(folio='F-1', no_factura='S 1')
        self.assertEqual(self.filas(), [('S', '1')])
        self.guardar(fecha_pis='2026-07-01')           # al entrar en julio nace
        self.assertEqual(self.filas(), [('S', '1')])

    def test_terceros_tambien(self):
        self.guardar(folio='F-1', transportista='OTRO', no_factura='S 1')
        self.assertEqual(self.filas(), [('S', '1')])

    def test_no_se_roba_la_factura_de_otra_maniobra(self):
        duena = Maniobra.objects.create(folio='F-0', no_factura='S 1')
        Factura.objects.create(maniobra=duena, serie='S', folio='1')
        self.guardar(folio='F-1', no_factura='S 1')
        self.assertEqual(Factura.objects.filter(serie='S', folio='1').count(), 1)
        self.assertEqual(self.filas(), [('', '')])

    def test_un_ingreso_a_mano_no_se_toca_si_no_cambia_dinero(self):
        Gasto.objects.create(maniobra=self.m, facturado='50000')
        self.guardar(folio='F-1', no_factura='S 1')
        self.guardar(no_factura='S 2')
        self.assertEqual(Gasto.objects.get(maniobra=self.m).facturado, '50000')


class CargaXmlTests(Base):

    def setUp(self):
        self.c = self.usuario('com', cargo='COMERCIAL')   # el que captura
        self.m = Maniobra.objects.create(folio='F-1', no_factura='S 1713', fecha_pis=JULIO)
        Gasto.objects.create(maniobra=self.m)
        Factura.objects.create(maniobra=self.m, serie='S', folio='1713', empresa='fraba')

    def test_rellena_la_fila_de_su_serie_y_folio(self):
        r = self.xml(self.c, cfdi(conceptos=(('CAJA 1', 'FLETE'), ('CAJA 2', 'FLETE'))))
        self.assertEqual((r.status_code, r.data['completadas']), (201, 1), r.data)
        f = Factura.objects.get()
        self.assertEqual((f.nombre, f.rfc, f.total, str(f.fecha_emision)),
                         ('HELIUS LOGISTICS', 'HLO250520168', Decimal('50400.00'), '2026-02-16'))
        self.assertEqual(f.iva, Decimal('7200.00'))   # el del comprobante, no el del concepto
        self.assertEqual((f.no_identificacion, f.descripcion), ('CAJA 1 / CAJA 2', 'FLETE'))
        self.assertEqual(f.uuid, 'u-1')
        self.assertEqual(Decimal(Gasto.objects.get(maniobra=self.m).facturado), Decimal('50400'))

    def test_sin_fila_crea_una_sin_maniobra_que_se_liga_despues(self):
        r = self.xml(self.c, cfdi(folio='9', uuid='u-9', total='10'))
        self.assertEqual(r.data['sin_maniobra'], 1)
        suelta = Factura.objects.get(folio='9')
        self.assertIsNone(suelta.maniobra_id)
        self.c.patch(f'/api/maniobras/{self.m.id}/', {'no_factura': 'S 1713 / 9'}, format='json')
        suelta.refresh_from_db()
        self.assertEqual(suelta.maniobra_id, self.m.id)
        self.assertEqual(Factura.objects.filter(maniobra=self.m).count(), 2)

    def test_omite_y_explica(self):
        malos = SimpleUploadedFile('x.xml', b'<?xml version="1.0"?><!DOCTYPE a [<!ENTITY b "c">]><a>&b;</a>')
        r = self.xml(self.c, cfdi(), cfdi(), cfdi(tipo='E', uuid='e'), cfdi(moneda='USD', uuid='d'),
                     cfdi(serie='X', uuid='x'), malos, SimpleUploadedFile('n.xml', b'no es xml'))
        self.assertEqual(r.data['completadas'], 1)
        motivos = [o['motivo'] for o in r.data['omitidas']]
        self.assertEqual(len(motivos), 6, motivos)
        self.assertIn('Ese XML ya estaba cargado', motivos)
        self.assertIn('No es un CFDI válido', motivos)

    def test_la_del_excel_ya_cargada_completa_identificacion_y_descripcion(self):
        Factura.objects.filter(serie='S', folio='1713').update(uuid='u-1', total=Decimal('1'))
        r = self.xml(self.c, cfdi(conceptos=(('CAJA 1', 'FLETE'),)))
        self.assertEqual((r.data['completadas'], r.data['omitidas']), (1, []))
        f = Factura.objects.get()
        self.assertEqual((f.no_identificacion, f.descripcion, f.total), ('CAJA 1', 'FLETE', Decimal('1')))
        r = self.xml(self.c, cfdi(conceptos=(('CAJA 1', 'FLETE'),)))   # la segunda vez, sí omitida
        self.assertEqual(r.data['omitidas'][0]['motivo'], 'Ese XML ya estaba cargado')

    def test_dos_filas_esperan_la_misma_factura(self):
        otra = Maniobra.objects.create(folio='F-2')
        Factura.objects.create(maniobra=otra, serie='S', folio='1713')
        r = self.xml(self.c, cfdi())
        self.assertEqual(r.data['completadas'], 0)
        self.assertIn('Varias maniobras', r.data['omitidas'][0]['motivo'])

    def test_otro_xml_con_la_misma_serie_y_folio(self):
        self.xml(self.c, cfdi())
        r = self.xml(self.c, cfdi(uuid='u-otro'))
        self.assertEqual(r.data['omitidas'][0]['motivo'], 'Ya hay otro XML con esa serie y folio')

    def test_el_de_ejemplo_del_plan(self):
        """El CFDI real con Carta Porte que trajo el usuario, si está a mano."""
        from pathlib import Path
        from api.facturacion import leer_cfdi
        ruta = Path(__file__).resolve().parents[2] / 'ControlDeManiobras-docs/docs/planes/FACTURA S 1713.xml'
        if not ruta.exists():
            self.skipTest('el XML de ejemplo vive en la rama main')
        d = leer_cfdi(ruta.read_bytes())
        self.assertEqual((d['serie'], d['folio'], d['total'], d['rfc'], d['nombre'], d['no_identificacion']),
                         ('S', '1713', Decimal('50400.00'), 'HLO250520168', 'HELIUS LOGISTICS',
                          'CAJA SECA 53 QRO'))
        self.assertTrue(d['descripcion'].startswith('FLETE DE MANZANILLO'))


# Tres filas reales de docs/planes/20261022_MovimientosCheque.csv (rama main):
# intereses (no es pago) y dos SPEI, una con la clave sin el ' de Excel.
CSV_BANCO = (
    "Cuenta,Fecha,Hora,Sucursal,Descripcion,Cargo/Abono,Importe,Saldo,Referencia,Concepto,"
    "Banco Participante,Clabe Beneficiario,Nombre Beneficiario,Cta Ordenante,Nombre Ordenante,"
    "Codigo Devolucion,Causa Devolucion,RFC Beneficiario,RFC Ordenante,Clave de Rastreo,Descripcion Larga\n"
    "'65507098980,'01102026',00:44,'0560',ABO POR INTERESES DEL PERIODO           ,+,0.02,3888571.05,"
    "0000000        ,'01-09-2026 AL 30-09-2026,                                        ,'                    ',"
    "                                        ,'                    ',                                        ,  ,"
    "                              ,               ,               ,                              ,ABO POR INTERESES\n"
    "'65507098980,'02102026',16:44,'7465',ABONO TRANSFERENCIA SPEI                ,+,1048460.00,4937031.05,"
    "003891078      ,Pago de 13 facturas LP                   002580055874724755                               ,"
    "BANAMEX                                 ,'014090655070989803  ',FRABA CONTAINER S DE RL DE CV           ,"
    "'002580055874724755  ',LOGISTICS PLUS S DE RL DE CV            ,  ,                              ,"
    "FCO180912E15   ,LPL0607245C2   ,'085907818484327567,ABONO TRANSFERENCIA SPEI\n"
    "'65507098980,'06102026',20:30,'7465',ABONO TRANSFERENCIA SPEI                ,+,49280.00,4986311.05,"
    "000338908      ,Fact S2013                               012456001218146135                               ,"
    "BBVA MEXICO                             ,'014090655070989803  ',FRABA CONTAINER S DE RL DE CV           ,"
    "'012456001218146135  ',TRADENAO SA DE CV                       ,  ,                              ,"
    "FCO180912E15   ,TRA2207296K1   ,BNET01002610070049908658      ,ABONO TRANSFERENCIA SPEI\n"
)


class CsvBancoTests(SimpleTestCase):

    def test_solo_los_spei_con_la_fecha_ddmmaaaa_y_sin_las_comillas_de_excel(self):
        pagos, omitidos, errores = leer_movimientos(CSV_BANCO.encode('latin-1'))
        self.assertEqual((omitidos, errores), (1, []))
        self.assertEqual([(str(p['fecha']), p['monto'], p['clave_rastreo'], p['banco'], p['rfc'], p['nombre'])
                          for p in pagos],
                         [('2026-10-02', Decimal('1048460.00'), '085907818484327567', 'BANAMEX',
                           'LPL0607245C2', 'LOGISTICS PLUS S DE RL DE CV'),
                          ('2026-10-06', Decimal('49280.00'), 'BNET01002610070049908658', 'BBVA MEXICO',
                           'TRA2207296K1', 'TRADENAO SA DE CV')])

    def test_falta_una_columna(self):
        with self.assertRaises(ValueError):
            leer_movimientos(b'Fecha,Importe\n01102026,5\n')

    def test_nombre_parecido_sin_el_tipo_de_sociedad(self):
        principales = ['LOGISTIC PLUS S DE RL DE CV', 'REAL SHIPPING AND TRADE SA DE CV']
        self.assertEqual(cliente_parecido('LOGISTICS PLUS S DE RL DE CV', principales),
                         'LOGISTIC PLUS S DE RL DE CV')
        # Solo comparten "S DE RL DE CV": no se parecen.
        self.assertIsNone(cliente_parecido('LOGOS PLATA S DE RL DE CV', principales))


class CompensacionTests(Base):
    """Pagos del banco (CSV o a mano) repartidos en abonos a varias facturas
    (usuario, 2026-10-22). Es la única vía al cobro."""

    def setUp(self):
        self.f = Factura.objects.create(serie='S', folio='1', rfc='RFC1', nombre='CLIENTE',
                                        subtotal=100, total=100)

    def pagar(self, cliente, monto='500', **extra):
        """Guarda un pago y devuelve su id."""
        datos = {'fecha': '2026-10-21', 'monto': monto, 'banco': 'BANAMEX',
                 'clave_rastreo': f'abc{Pago.objects.count()}', **extra}
        r = cliente.post('/api/pagos/guardar/', {'pagos': [datos]}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return Pago.objects.latest('id').id

    def abonar(self, cliente, pago, monto, factura=None, parcialidad=1):
        return cliente.post('/api/abonos/', {'pago': pago, 'factura': (factura or self.f).id,
                                             'monto': monto, 'parcialidad': parcialidad}, format='json')

    def test_leer_csv_no_guarda_y_marca_repetidos_cliente_y_rfc(self):
        com = self.usuario('com', cargo='COMERCIAL')
        ClientePrincipal.objects.create(nombre='LOGISTIC PLUS S DE RL DE CV')
        Factura.objects.create(serie='S', folio='9', rfc='LPL0607245C2', total=10)
        self.pagar(com, clave_rastreo='BNET01002610070049908658')
        archivo = SimpleUploadedFile('mov.csv', CSV_BANCO.encode('latin-1'))
        r = com.post('/api/pagos/leer-csv/', {'archivo': archivo}, format='multipart')
        self.assertEqual(r.status_code, 200)
        lp, tradenao = r.data['pagos']
        self.assertEqual((lp['repetido'], lp['cliente_principal'], lp['rfc_con_facturas']),
                         (False, 'LOGISTIC PLUS S DE RL DE CV', True))
        self.assertEqual((tradenao['repetido'], tradenao['cliente_principal'], tradenao['rfc_con_facturas']),
                         (True, None, False))
        self.assertEqual(Pago.objects.count(), 1)

    def test_guardar_salta_las_claves_repetidas(self):
        com = self.usuario('com', cargo='COMERCIAL')
        self.pagar(com, clave_rastreo='CLAVE1')
        base = {'fecha': '2026-10-21', 'monto': '5', 'banco': 'BANAMEX'}
        r = com.post('/api/pagos/guardar/', {'pagos': [
            {**base, 'clave_rastreo': 'clave1'}, {**base, 'clave_rastreo': 'CLAVE2'},
            {**base, 'clave_rastreo': 'CLAVE2'}, {**base, 'clave_rastreo': ''}]}, format='json')
        self.assertEqual((r.data['guardados'], r.data['repetidos']), (2, ['CLAVE1', 'CLAVE2']))
        # Una lista vacía (o aplanada por el cliente) no es "0 guardados".
        self.assertEqual(com.post('/api/pagos/guardar/', {'pagos': []}, format='json').status_code, 400)

    def test_un_pago_varias_facturas_cobra_al_cubrir_y_cancelar_lo_deshace(self):
        com = self.usuario('com', cargo='COMERCIAL')
        otra = Factura.objects.create(serie='S', folio='2', rfc='RFC1', subtotal=300, total=300)
        pago = self.pagar(com, clave_rastreo='abc9')
        r = self.abonar(com, pago, '40')
        self.assertEqual(r.status_code, 201)
        self.assertEqual((r.data['factura']['abonado'], r.data['factura']['saldo_pendiente'],
                          r.data['factura']['siguiente_parcialidad']), ('40.00', '60.00', 2))
        self.f.refresh_from_db()
        self.assertIsNone(self.f.fecha_cobro)
        # El que pasa del saldo se acepta y cobra la factura con la fecha y clave del pago.
        self.abonar(com, pago, '70', parcialidad=2)
        r = self.abonar(com, pago, '300', otra)
        self.assertEqual(r.data['pago']['aplicado'], '410.00')
        self.f.refresh_from_db()
        self.assertEqual((self.f.abonado, str(self.f.fecha_cobro), self.f.clave_rastreo),
                         (Decimal('110'), '2026-10-21', 'ABC9'))
        segundo = Abono.objects.get(factura=self.f, parcialidad=2).id
        self.assertEqual(com.post(f'/api/abonos/{segundo}/cancelar/').status_code, 403)
        admin = self.usuario('admin', staff=True)
        self.assertEqual(admin.post(f'/api/abonos/{segundo}/cancelar/').status_code, 200)
        self.f.refresh_from_db()
        self.assertEqual((self.f.abonado, self.f.fecha_cobro, self.f.clave_rastreo),
                         (Decimal('40'), None, ''))
        self.assertEqual(admin.post(f'/api/abonos/{segundo}/cancelar/').status_code, 400)
        # Cancelar el pago cancela lo que queda de él y descobra la otra factura.
        self.assertEqual(com.post(f'/api/pagos/{pago}/cancelar/').status_code, 403)
        self.assertEqual(admin.post(f'/api/pagos/{pago}/cancelar/').status_code, 200)
        self.f.refresh_from_db()
        otra.refresh_from_db()
        self.assertEqual((self.f.abonado, otra.abonado, otra.fecha_cobro), (0, 0, None))
        self.assertEqual(self.abonar(com, pago, '10').status_code, 400)

    def test_por_aplicar_del_mas_viejo_y_sin_los_ya_aplicados(self):
        com = self.usuario('com', cargo='COMERCIAL')
        nuevo = self.pagar(com, '50', fecha='2026-10-20')
        viejo = self.pagar(com, '50', fecha='2026-10-01')
        aplicado = self.pagar(com, '100', fecha='2026-09-01')
        self.abonar(com, aplicado, '100')
        self.abonar(com, nuevo, '20')
        d = com.get('/api/pagos/por-aplicar/').data
        self.assertEqual([(p['id'], p['aplicado']) for p in d], [(viejo, '0.00'), (nuevo, '20.00')])

    def test_historial_todos_los_pagos_con_sus_abonos(self):
        com = self.usuario('com', cargo='COMERCIAL')
        viejo = self.pagar(com, '50', fecha='2026-10-01')
        nuevo = self.pagar(com, '80', fecha='2026-10-20')
        self.abonar(com, viejo, '30')
        self.usuario('admin', staff=True).post(f'/api/pagos/{nuevo}/cancelar/')
        d = com.get('/api/pagos/').data
        self.assertEqual([(p['id'], p['estado'], p['aplicado']) for p in d],
                         [(nuevo, 'cancelada', '0.00'), (viejo, 'activa', '30.00')])
        self.assertEqual([(a['factura'], a['monto']) for a in d[1]['abonos']], [('S 1', '30.00')])

    def test_cancelada_y_sin_xml_salen_pero_no_se_abonan(self):
        com = self.usuario('com', cargo='COMERCIAL')
        pago = self.pagar(com)
        cancelada = Factura.objects.create(serie='S', folio='2', rfc='RFC1', total=50,
                                           estado='cancelada')
        sin_xml = Factura.objects.create(serie='S', folio='3', rfc='RFC1')
        self.assertEqual(self.abonar(com, pago, '10', cancelada).status_code, 400)
        self.assertEqual(self.abonar(com, pago, '10', sin_xml).status_code, 400)
        self.assertEqual(self.abonar(com, pago, '0').status_code, 400)
        r = com.post('/api/pagos/guardar/', {'pagos': [
            {'fecha': '2026-10-21', 'monto': '0', 'banco': 'X'}]}, format='json')
        self.assertEqual(r.status_code, 400)
        r = com.get(f'{URL}buscar-compensacion/', {'rfc': 'RFC1'})
        self.assertEqual(sorted((x['folio'], x['abonable']) for x in r.data),
                         [('1', True), ('2', False), ('3', False)])

    def test_estados_de_cuenta_y_facturacion_ven_el_saldo(self):
        com = self.usuario('com', cargo='COMERCIAL')
        self.abonar(com, self.pagar(com), '30')
        fila = com.get(f'{URL}cuentas-por-cobrar/').data['facturas'][0]
        self.assertEqual(fila['saldo'], '70.00')
        self.assertEqual(com.get(URL).data['results'][0]['saldo_pendiente'], '70.00')

    def test_cobranza_es_lo_recibido_por_semana_del_pago(self):
        com = self.usuario('com', cargo='COMERCIAL')
        self.pagar(com, '500', fecha='2026-09-07')
        self.pagar(com, '200', fecha='2026-09-13')
        self.pagar(com, '50', fecha='2026-09-14')
        cancelado = self.pagar(com, '999', fecha='2026-09-08')
        self.usuario('admin', staff=True).post(f'/api/pagos/{cancelado}/cancelar/')
        d = com.get(f'{URL}cobranza-semanal/').data
        self.assertEqual([(str(s['semana'])[:10], s['total']) for s in d],
                         [('2026-09-07', '700.00'), ('2026-09-14', '50.00')])

    def test_el_cobro_ya_no_se_captura_a_mano(self):
        com = self.usuario('com', cargo='COMERCIAL')
        r = com.post(f'{URL}{self.f.id}/cobro/', {'fecha_cobro': '2026-10-01'}, format='json')
        self.assertEqual(r.status_code, 404)

    def test_solo_finanzas(self):
        coord = self.usuario('coord', cargo='Coordinador')
        self.assertEqual(coord.post('/api/pagos/guardar/', {'pagos': []}, format='json').status_code, 403)
        self.assertEqual(coord.get('/api/pagos/bancos/').status_code, 403)
        self.assertEqual(coord.post('/api/abonos/', {}, format='json').status_code, 403)


class CancelarTests(Base):

    def test_solo_staff_y_la_cancelada_deja_de_sumar(self):
        m = Maniobra.objects.create(folio='F', no_factura='S 1713')
        Gasto.objects.create(maniobra=m)
        Factura.objects.create(maniobra=m, serie='S', folio='1713')
        admin = self.usuario('admin', staff=True)
        self.xml(admin, cfdi(total='100'))
        f = Factura.objects.get()

        comercial = self.usuario('com', cargo='COMERCIAL')
        self.assertEqual(comercial.post(f'{URL}{f.id}/cancelar/').status_code, 403)

        self.assertEqual(admin.post(f'{URL}{f.id}/cancelar/').status_code, 200)
        self.assertIsNone(Gasto.objects.get(maniobra=m).facturado)
        self.assertEqual(admin.get(f'{URL}?estado=activa').data['count'], 0)

        admin.post(f'{URL}{f.id}/reactivar/')
        self.assertEqual(Decimal(Gasto.objects.get(maniobra=m).facturado), Decimal('100'))


class ComparacionTests(Base):

    def test_marca_lo_que_no_coincide(self):
        admin = self.usuario('admin', staff=True)
        Factura.objects.create(serie='S', folio='1713')
        Factura.objects.create(serie='S', folio='2')            # sin XML
        self.xml(admin, cfdi(nombre='helius  logistics'),     # igual salvo espacios
                 cfdi(folio='3', uuid='u-3', total='1.00'),   # total distinto
                 cfdi(folio='4', uuid='u-4'))                 # el Excel no lo trae
        excel = [['HELIUS LOGISTICS', 'HLO250520168', 'I', 'S', f, u, '2026-02-16', 45000, 7200, 50400, 'MXN']
                 for f, u in (('1713', 'u-1'), ('2', 'u-2'), ('3', 'u-3'), ('5', 'u-5'))]
        self.cargar(admin, xlsx(*excel))
        d = admin.get(f'{EXCEL}comparacion/').data
        por_folio = {f['folio']: f['diferencias'] for f in d['results']}
        self.assertEqual(por_folio, {'1713': [], '2': ['Falta el XML en Facturación'],
                                     '3': ['Total'], '5': ['Falta en Facturación']})
        self.assertEqual([f['folio'] for f in d['solo_en_facturacion']], ['4'])


class TramoTests(SimpleTestCase):

    def test_limites_de_cada_tramo(self):
        from api.facturacion import tramo
        casos = {-1: 'por_vencer', 0: '0_30', 30: '0_30', 31: '31_60',
                 60: '31_60', 61: '61_90', 90: '61_90', 91: 'mas_90'}
        for dias, esperado in casos.items():
            self.assertEqual(tramo(dias), esperado, dias)


class CuentasPorCobrarTests(Base):

    def factura(self, uuid, dias_atras, maniobra=None, **campos):
        from datetime import datetime, timedelta
        from api.facturacion import ZONA_OPERACION
        campos.setdefault('total', Decimal('100'))
        hoy = datetime.now(ZONA_OPERACION).date()  # el mismo "hoy" que la vista
        return Factura.objects.create(
            empresa='soluciones', serie='SEF', folio=uuid, uuid=uuid,
            fecha_emision=hoy - timedelta(days=dias_atras),
            subtotal=campos['total'], maniobra=maniobra, **campos)

    def test_antiguedad_y_lo_que_queda_fuera(self):
        from api.models import Cliente, ClientePrincipal
        p = ClientePrincipal.objects.create(nombre='REAL', dias_credito=30)
        con_principal = Maniobra.objects.create(
            cliente_fk=Cliente.objects.create(nombre_cliente='REAL MZO', cliente_principal=p))
        sin_principal = Maniobra.objects.create(
            cliente_fk=Cliente.objects.create(nombre_cliente='SUELTA'))
        self.factura('vencida', 45, con_principal)                     # vence hace 15 días
        self.factura('al-dia', 10, con_principal)                      # vence en 20 días
        self.factura('huerfana', 5)                                    # sin maniobra
        self.factura('sin-p', 5, sin_principal)
        self.factura('cobrada', 45, con_principal, fecha_cobro='2026-10-01')
        self.factura('cancelada', 45, con_principal, estado='cancelada')
        Factura.objects.create(maniobra=con_principal, serie='S', folio='sin-xml')

        d = self.usuario('com', cargo='COMERCIAL').get(f'{URL}cuentas-por-cobrar/').data
        por_uuid = {f['folio']: f for f in d['facturas']}
        self.assertEqual(set(por_uuid), {'vencida', 'al-dia', 'huerfana', 'sin-p'})
        self.assertEqual((por_uuid['vencida']['tramo'], por_uuid['vencida']['dias_vencida']), ('0_30', 15))
        self.assertEqual(por_uuid['al-dia']['tramo'], 'por_vencer')
        self.assertEqual(por_uuid['huerfana']['situacion'], 'pendiente_de_ligar')
        self.assertIsNone(por_uuid['huerfana']['tramo'])
        self.assertEqual(d['antiguedad']['0_30'], '100.00')
        self.assertEqual(d['fuera_de_antiguedad'],
                         {'pendiente_de_ligar': '100.00', 'sin_cliente_principal': '100.00'})

    def test_estado_de_cuenta_solo_lo_sin_cobrar_del_cliente_y_la_empresa(self):
        from openpyxl import load_workbook
        from api.models import Cliente, ClientePrincipal
        p = ClientePrincipal.objects.create(nombre='REAL', dias_credito=30)
        otro = ClientePrincipal.objects.create(nombre='OTRO', dias_credito=30)
        m = Maniobra.objects.create(
            cliente_fk=Cliente.objects.create(nombre_cliente='REAL MZO', cliente_principal=p))
        m_otro = Maniobra.objects.create(
            cliente_fk=Cliente.objects.create(nombre_cliente='OTRO MZO', cliente_principal=otro))
        self.factura('vencida', 45, m)       # vence hace 15 días
        self.factura('hoy', 30, m)           # vence HOY: ya cuenta como vencida
        self.factura('al-dia', 10, m)        # vence en 20 días
        self.factura('cobrada', 45, m, fecha_cobro='2026-10-01')
        self.factura('cancelada', 45, m, estado='cancelada')
        self.factura('de-otro', 45, m_otro)
        hoy = Factura.objects.get(folio='vencida').fecha_emision
        Factura.objects.create(empresa='fraba', serie='S', folio='fraba', uuid='fraba',
                               fecha_emision=hoy, subtotal=100, total=100, maniobra=m)

        c = self.usuario('com', cargo='COMERCIAL')
        r = c.post('/api/documentos/estado-cuenta/',
                   {'cliente': p.id, 'empresa': 'soluciones', 'formato': 'excel'}, format='json')
        self.assertEqual(r.status_code, 200)
        ws = load_workbook(io.BytesIO(r.content)).active
        filas = {ws.cell(row=f, column=1).value: ws.cell(row=f, column=7).value
                 for f in range(12, ws.max_row + 1) if str(ws.cell(row=f, column=1).value).startswith('SEF')}
        self.assertEqual(filas, {'SEF vencida': 'Vencida', 'SEF hoy': 'Vencida', 'SEF al-dia': 'En tiempo'})
        self.assertEqual(ws['D9'].value, 300)   # saldo total
        self.assertEqual(ws['C9'].value, 200)   # saldo vencido
        self.assertEqual(ws._images, [])        # el logo de Fraba, solo en los de Fraba

        sin = c.post('/api/documentos/estado-cuenta/', {'cliente': otro.id, 'empresa': 'fraba'}, format='json')
        self.assertEqual(sin.status_code, 400)
        fuera = self.usuario('nadie').post('/api/documentos/estado-cuenta/',
                                           {'cliente': p.id, 'empresa': 'soluciones'}, format='json')
        self.assertEqual(fuera.status_code, 403)


class PaginaDeCienTests(Base):
    """Las dos tablas de 100 en 100, con la búsqueda y las fechas aplicadas en
    el servidor sobre TODAS las filas (usuario, 2026-10-16)."""

    def setUp(self):
        self.c = self.usuario('admin', staff=True)

    def folios(self, url, **p):
        return [f['folio'] for f in self.c.get(url, p).data['results']]

    def test_facturacion_de_100_en_100(self):
        Factura.objects.bulk_create(Factura(serie='S', folio=str(i)) for i in range(150))
        d = self.c.get(URL).data
        self.assertEqual((d['count'], len(d['results'])), (150, 100))
        self.assertEqual(len(self.c.get(URL, {'page': 2}).data['results']), 50)

    def test_busqueda_sin_acentos_con_exclusion_y_fechas(self):
        Factura.objects.create(serie='S', folio='1', nombre='Logística Peña',
                               fecha_emision=date(2026, 7, 9))
        Factura.objects.create(serie='S', folio='2', nombre='Logistica Norte',
                               fecha_emision=date(2026, 8, 1))
        Factura.objects.create(serie='S', folio='3', nombre='Otra')     # sin XML ni fecha
        self.assertEqual(self.folios(URL, search='LOGISTICA pena'), ['1'])
        self.assertEqual(sorted(self.folios(URL, search='logistica -"norte"')), ['1'])
        self.assertEqual(self.folios(URL, mes='2026-07'), ['1'])
        self.assertEqual(self.folios(URL, desde='2026-08-31', hasta='2026-07-10'), ['2'])
        self.assertEqual(len(self.folios(URL, desde='2026-07-10')), 3)  # una sola punta no filtra

    def test_auditoria_pagina_pero_la_alerta_cuenta_todas(self):
        excel = [['A', 'RFC', 'I', 'S', str(i), f'u-{i}', '2026-02-16', 1, 0, 1, 'MXN']
                 for i in range(120)]
        self.cargar(self.c, xlsx(*excel))
        d = self.c.get(f'{EXCEL}comparacion/', {'estado': 'activa'}).data
        self.assertEqual((d['count'], len(d['results'])), (120, 100))
        self.assertEqual(len(d['distintas']), 120)   # ninguna está en Facturación
        self.assertEqual(self.folios(f'{EXCEL}comparacion/', search='"falta en facturacion" -s'), [])
        self.assertEqual(self.c.get(f'{EXCEL}comparacion/', {'estado': 'cancelada'}).data['count'], 0)
