"""Facturación (Fase 1 de docs/planes/PLAN_MODULO_FINANZAS.md, rama main).

Se cubre lo que decidiría mal en silencio: quién entra, qué filas del Excel se
omiten, a qué maniobra se liga cada factura y qué acaba en Ingresos de Gastos.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
import io
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connections
from django.test import SimpleTestCase, TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from api.facturacion import facturas_de_no_factura
from api.models import Empleado, Factura, Gasto, Maniobra, PerfilUsuario, Vacio

URL = '/api/facturas/'
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
        return cliente.post(f'{URL}cargar/', {'archivo': archivo}, format='multipart')


class AccesoTests(Base):

    def test_staff_y_los_cuatro_cargos_entran(self):
        clientes = [self.usuario('admin', staff=True)] + [
            self.usuario(f'c{i}', cargo=cargo) for i, cargo in enumerate(
                ['Comercial', ' director general ', 'DIRECTOR OPERATIVO', 'Directora Comercial'])]
        for c in clientes:
            self.assertEqual(c.get(URL).status_code, 200)

    def test_cerrado_por_defecto(self):
        sin_perfil = self.usuario('a')
        otro_cargo = self.usuario('b', cargo='Coordinador')
        u = get_user_model().objects.create_user('c', password='x')
        PerfilUsuario.objects.create(usuario=u, empleado=None)
        sin_empleado = APIClient()
        sin_empleado.force_authenticate(user=u)
        for c in (sin_perfil, otro_cargo, sin_empleado):
            self.assertEqual(c.get(URL).status_code, 403)
            self.assertEqual(self.cargar(c, xlsx(fila())).status_code, 403)
            self.assertEqual(c.get(f'{URL}acceso/').data, {'ver': False, 'cancelar': False})

    def test_el_uuid_no_sale_nunca(self):
        c = self.usuario('admin', staff=True)
        self.cargar(c, xlsx(fila()))
        self.assertNotIn('uuid', c.get(URL).data['results'][0])


class CargaTests(Base):

    def setUp(self):
        self.c = self.usuario('com', cargo='COMERCIAL')

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
        f = Factura.objects.get(uuid='e')
        self.assertEqual((f.empresa, f.serie, f.folio), ('fraba', 'S', '155'))
        self.assertEqual(Factura.objects.get(uuid='a').empresa, 'soluciones')

    def test_recargar_el_mismo_archivo_no_duplica(self):
        self.cargar(self.c, xlsx(fila()))
        r = self.cargar(self.c, xlsx(fila()))
        self.assertEqual(r.data['creadas'], 0)
        self.assertEqual(Factura.objects.count(), 1)

    def test_csv(self):
        texto = ','.join(CABECERA) + '\n' + ','.join(str(v) for v in fila()) + '\n'
        r = self.cargar(self.c, SimpleUploadedFile('i.csv', texto.encode('utf-8')))
        self.assertEqual(r.data['creadas'], 1, r.data)

    def test_falta_una_columna(self):
        r = self.cargar(self.c, xlsx(fila()[:-1], cabecera=CABECERA[:-1]))
        self.assertEqual(r.status_code, 400)
        self.assertIn('moneda', r.data['detail'])

    def test_liga_y_rellena_ingresos_con_la_suma(self):
        m = Maniobra.objects.create(folio='F-1', no_factura='SEF 456 / 457')
        Gasto.objects.create(maniobra=m)
        r = self.cargar(self.c, xlsx(fila(folio=456, uuid='a', total=100),
                                     fila(folio=457, uuid='b', total=50)))
        self.assertEqual(r.data['ligadas'], 2)
        self.assertEqual(Decimal(Gasto.objects.get(maniobra=m).facturado), Decimal('150'))

    def test_dos_maniobras_la_nombran_y_queda_pendiente(self):
        Maniobra.objects.create(no_factura='SEF 456')
        Maniobra.objects.create(no_factura='SEF456')
        r = self.cargar(self.c, xlsx(fila()))
        self.assertEqual(r.data['ligadas'], 0)
        self.assertEqual(len(r.data['ambiguas']), 1)
        self.assertIsNone(Factura.objects.get().maniobra_id)


class LigaAlGuardarManiobraTests(Base):

    def test_escribir_y_quitar_el_no_factura(self):
        admin = self.usuario('admin', staff=True)
        self.cargar(admin, xlsx(fila(total=100)))
        m = Maniobra.objects.create(solicita='X')
        Gasto.objects.create(maniobra=m)
        capturista = self.usuario('cap')

        capturista.patch(f'/api/maniobras/{m.id}/', {'no_factura': 'sef-456'}, format='json')
        self.assertEqual(Factura.objects.get().maniobra_id, m.id)
        self.assertEqual(Decimal(Gasto.objects.get(maniobra=m).facturado), Decimal('100'))

        capturista.patch(f'/api/maniobras/{m.id}/', {'no_factura': 'EFECTIVO'}, format='json')
        self.assertIsNone(Factura.objects.get().maniobra_id)
        self.assertIsNone(Gasto.objects.get(maniobra=m).facturado)

    def test_no_se_roba_la_factura_de_otra_maniobra(self):
        admin = self.usuario('admin', staff=True)
        duena = Maniobra.objects.create(no_factura='SEF 456')
        self.cargar(admin, xlsx(fila()))
        otra = Maniobra.objects.create(solicita='X')
        admin.patch(f'/api/maniobras/{otra.id}/', {'no_factura': 'SEF 456'}, format='json')
        self.assertEqual(Factura.objects.get().maniobra_id, duena.id)

    def test_un_ingreso_a_mano_no_se_toca_si_la_liga_no_cambia(self):
        admin = self.usuario('admin', staff=True)
        m = Maniobra.objects.create(no_factura='S 1')
        Gasto.objects.create(maniobra=m, facturado='50000')
        admin.patch(f'/api/maniobras/{m.id}/', {'no_factura': 'S 2'}, format='json')
        self.assertEqual(Gasto.objects.get(maniobra=m).facturado, '50000')


class CancelarTests(Base):

    def test_solo_staff_y_la_cancelada_deja_de_sumar(self):
        m = Maniobra.objects.create(no_factura='SEF 456')
        Gasto.objects.create(maniobra=m)
        admin = self.usuario('admin', staff=True)
        self.cargar(admin, xlsx(fila(total=100)))
        f = Factura.objects.get()

        comercial = self.usuario('com', cargo='COMERCIAL')
        self.assertEqual(comercial.post(f'{URL}{f.id}/cancelar/').status_code, 403)

        self.assertEqual(admin.post(f'{URL}{f.id}/cancelar/').status_code, 200)
        self.assertIsNone(Gasto.objects.get(maniobra=m).facturado)
        self.assertEqual(admin.get(f'{URL}?estado=activa').data['count'], 0)

        admin.post(f'{URL}{f.id}/reactivar/')
        self.assertEqual(Decimal(Gasto.objects.get(maniobra=m).facturado), Decimal('100'))


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
        self.factura('cobrada', 45, con_principal, cobrada=True)
        self.factura('cancelada', 45, con_principal, estado='cancelada')

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

    def test_marcar_cobrada_con_el_texto_que_manda_el_frontend(self):
        f = self.factura('a', 1)
        com = self.usuario('com', cargo='COMERCIAL')
        self.assertEqual(com.post(f'{URL}{f.id}/cobrada/', {'cobrada': 'true'}, format='json').status_code, 200)
        self.assertTrue(Factura.objects.get(pk=f.pk).cobrada)
        self.assertEqual(com.post(f'{URL}{f.id}/cobrada/', {'cobrada': 'quiza'}, format='json').status_code, 400)
        self.assertEqual(self.usuario('coord', cargo='Coordinador')
                         .post(f'{URL}{f.id}/cobrada/', {'cobrada': 'false'}, format='json').status_code, 403)

    def test_cobranza_por_semana_de_emision(self):
        from datetime import date
        for uuid, dia, estado, cobrada in (('lun', date(2026, 9, 7), 'activa', False),
                                          ('dom', date(2026, 9, 13), 'activa', True),
                                          ('sig', date(2026, 9, 14), 'activa', False),
                                          ('can', date(2026, 9, 8), 'cancelada', False)):
            Factura.objects.create(empresa='fraba', serie='S', folio=uuid, uuid=uuid, fecha_emision=dia,
                                   subtotal=100, total=100, estado=estado, cobrada=cobrada)
        d = self.usuario('admin', staff=True).get(f'{URL}cobranza-semanal/').data
        self.assertEqual([(str(s['semana'])[:10], s['total']) for s in d],
                         [('2026-09-07', '200.00'), ('2026-09-14', '100.00')])
