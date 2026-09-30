"""Dashboards de Finanzas (Fase 6 de docs/planes/PLAN_MODULO_FINANZAS.md, rama main).

Un escenario pequeño con las cifras hechas a mano. Lo que se cubre es lo que
daría un número creíble pero falso: contar dos veces un servicio con dos
facturas, sumar una cancelada, olvidar la urea o poner la factura sin ligar
dentro de un servicio.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import (CapturaMensual, CargaCombustible, Cliente, ClientePrincipal, CuentaPorPagar,
                        Empleado, Factura, Gasto, GastoFijo, GastoFijoPago, Maniobra, PerfilUsuario,
                        ReporteViaje, Vacio)

URL = '/api/dashboards/'
PERIODO = '?desde=2026-08-01&hasta=2026-09-30'


class DashboardsTests(TestCase):
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

    def setUp(self):
        u = get_user_model().objects.create_user('admin', password='x', is_staff=True)
        self.c = APIClient()
        self.c.force_authenticate(user=u)

        p = ClientePrincipal.objects.create(nombre='REAL', dias_credito=30)
        d = Cliente.objects.create(nombre_cliente='REAL MZO', cliente_principal=p)
        # A: full, local, T-1. Costo 1000 de Gastos + 200 de urea = 1200.
        self.a = Maniobra.objects.create(
            folio='F-A', cliente_fk=d, tipo_servicio='full', origen='Manzanillo', destino='MANZANILLO ',
            unidad='T-1', asignacion_operador_status='JUAN', fecha_pis=date(2026, 8, 5),
            fecha_entrega_mercancia=date(2026, 8, 10))
        Gasto.objects.create(maniobra=self.a, casetas_ida=Decimal('1000'))
        r = ReporteViaje.objects.create(folio='F-A')
        CargaCombustible.objects.create(reporte=r, orden=1, total_urea=Decimal('200'))
        # B: sin tipo y "CARGA SUELTA" en el contenedor, foránea, sin cliente. Costo 500.
        self.b = Maniobra.objects.create(
            folio='F-B', contenedor='CARGA SUELTA 3 PZAS', origen='Manzanillo', destino='Guadalajara',
            unidad='T-2', fecha_pis=date(2026, 8, 7), fecha_entrega_mercancia=date(2026, 9, 3))
        Gasto.objects.create(maniobra=self.b, casetas_ida=Decimal('500'))
        # C: sin factura → servicio del mes de su fecha PIS, con nota (P8).
        Maniobra.objects.create(folio='F-C', tipo_servicio='sencillo', fecha_pis=date(2026, 8, 20))

        def factura(uuid, total, dia, maniobra=None, **extra):
            Factura.objects.create(empresa='soluciones', serie='SEF', folio=uuid, uuid=uuid,
                                   fecha_emision=dia, subtotal=total, total=Decimal(total),
                                   maniobra=maniobra, **extra)
        factura('1', 3000, date(2026, 8, 12), self.a)
        factura('2', 1000, date(2026, 8, 15), self.a)       # 2ª factura de A: mismo servicio
        factura('3', 700, date(2026, 9, 5), self.b)
        factura('4', 500, date(2026, 8, 20))                 # sin ligar
        factura('5', 9999, date(2026, 8, 21), self.a, estado='cancelada')

    def get(self, nombre, extra=''):
        r = self.c.get(f'{URL}{nombre}/{PERIODO}{extra}')
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    def test_ventas_y_servicios_vendidos(self):
        ago, sep = self.get('ventas')['meses']
        self.assertEqual((ago['ventas'], sep['ventas']), ('4500.00', '700.00'))
        self.assertEqual(ago['ventas_por_servicio'], {'full': '4000.00', 'no_asignado': '500.00'})
        self.assertEqual((ago['servicios'], ago['sin_factura']), (2, 1))      # A una vez + C
        self.assertEqual(sep['servicios_por_servicio'], {'carga_suelta': 1})

    def test_con_filtro_de_maniobra_lo_no_ligado_va_aparte(self):
        d = self.get('ventas', '&servicio=full')
        self.assertEqual(d['meses'][0]['ventas'], '4000.00')
        self.assertEqual(d['meses'][1]['ventas'], '0.00')
        self.assertEqual(d['no_asignado'], '500.00')

    def test_gastos_por_mes_de_entrega_con_urea(self):
        ago, sep = self.get('gastos')['meses']
        self.assertEqual((ago['costo'], sep['costo']), ('1200.00', '500.00'))

    def test_cascada_de_utilidad(self):
        g = GastoFijo.objects.create(empresa='fraba', concepto='Luz')
        GastoFijoPago.objects.create(gasto_fijo=g, mes=date(2026, 8, 1), monto=Decimal('300'))
        CapturaMensual.objects.create(mes=date(2026, 8, 1), tipo='financiero', concepto='Crédito', monto=100)
        CapturaMensual.objects.create(mes=date(2026, 8, 1), tipo='impuesto', concepto='IVA', monto=50)
        ago = self.get('utilidad')['meses'][0]
        self.assertEqual(
            [ago[k] for k in ('utilidad_bruta', 'utilidad_operacional', 'utilidad_antes_impuestos', 'utilidad_neta')],
            ['3300.00', '3000.00', '2900.00', '2850.00'])
        self.assertTrue(ago['nomina_pendiente'])
        self.assertIsNone(ago['nomina_administrativa'])

    def test_ventas_por_cliente_con_porcentaje(self):
        d = self.get('ventas-por-cliente')
        filas = {x['cliente']: (x['total'], x['porcentaje']) for x in d['clientes']}
        self.assertEqual(d['total'], '5200.00')
        self.assertEqual(filas['REAL'], ('4000.00', '76.92'))
        self.assertEqual(filas['Sin cliente asignado'], ('700.00', '13.46'))
        self.assertEqual(filas['Pendiente de ligar'], ('500.00', '9.62'))

    def test_ventas_por_servicio_local_y_foraneo(self):
        d = self.get('ventas-por-servicio')
        filas = {x['servicio']: x for x in d['servicios']}
        self.assertEqual((filas['full']['local'], filas['full']['foraneo']), ('4000.00', '0.00'))
        self.assertEqual(filas['carga_suelta']['foraneo'], '700.00')
        self.assertEqual(d['no_asignado'], '500.00')

    def test_rentabilidad_ingreso_entre_costo(self):
        d = self.get('rentabilidad')
        filas = {x['folio']: x['rentabilidad'] for x in d['operaciones']}
        self.assertEqual(filas, {'F-A': '333.33', 'F-B': '140.00'})
        self.assertEqual(d['rentabilidad'], '276.47')

    def test_costos_por_unidad_y_filtro_de_operador(self):
        d = self.get('costos-por-unidad')
        self.assertEqual({x['unidad']: x['costo'] for x in d['unidades']}, {'T-1': '1200.00', 'T-2': '500.00'})
        d = self.get('costos-por-unidad', '&operador=juan')
        self.assertEqual([x['unidad'] for x in d['unidades']], ['T-1'])

    def test_cuentas_por_cobrar_no_depende_del_dia(self):
        d = self.get('cuentas-por-cobrar')
        self.assertEqual(sum(Decimal(v) for v in d['antiguedad'].values()), Decimal('4000'))
        self.assertEqual(d['fuera_de_antiguedad'], '1200.00')   # B sin principal + la sin ligar

    def test_cuentas_por_pagar_por_empresa(self):
        CuentaPorPagar.objects.create(origen='mantenimiento', empresa='fraba', total=1000, fecha=date(2026, 8, 1))
        CuentaPorPagar.objects.create(origen='mantenimiento', empresa='soluciones', total=400,
                                      fecha=date(2026, 8, 2), pagada=True)
        d = self.get('cuentas-por-pagar', '&empresa=fraba')['por_origen']['mantenimiento']
        self.assertEqual((d['por_pagar'], d['pagado'], d['vencido']), ('1000.00', '0.00', '1000.00'))

    def test_acceso_y_nombre(self):
        u = get_user_model().objects.create_user('coord', password='x')
        PerfilUsuario.objects.create(usuario=u, empleado=Empleado.objects.create(
            nombre_trabajador='C', cargo='Coordinador'))
        otro = APIClient()
        otro.force_authenticate(user=u)
        self.assertEqual(otro.get(f'{URL}ventas/{PERIODO}').status_code, 403)
        self.assertEqual(self.c.get(f'{URL}nada/').status_code, 404)
        self.assertEqual(self.c.get(f'{URL}ventas/?desde=2026-09-30&hasta=2026-08-01').status_code, 400)
