"""Cuentas por pagar, gastos fijos y gastos financieros (Fase 4 de
docs/planes/PLAN_MODULO_FINANZAS.md, rama main).

Lo que decidiría mal en silencio: qué maniobra entra como flete o local, con
qué empresa, qué mes "debe" un pago y quién puede cancelar o borrar.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from api.finanzas import falta_pago, maniobras_de_terceros
from api.models import (CuentaPorPagar, Empleado, Factura, GastoFijo, Maniobra, PerfilUsuario,
                        UnidadTercero, Vacio)

AGO = date(2026, 8, 10)


class FaltaPagoTests(SimpleTestCase):

    def test_sin_pagos_toca_todos_los_meses(self):
        self.assertTrue(falta_pago(2, set(), date(2026, 9, 1)))

    def test_bimestral_cuenta_desde_el_ultimo_mes_con_monto(self):
        julio = {date(2026, 7, 1)}
        self.assertFalse(falta_pago(2, julio, date(2026, 8, 1)))
        self.assertTrue(falta_pago(2, julio, date(2026, 9, 1)))
        self.assertFalse(falta_pago(2, julio, date(2026, 10, 1)))

    def test_mes_pagado_no_falta(self):
        self.assertFalse(falta_pago(1, {date(2026, 9, 1)}, date(2026, 9, 1)))

    def test_anual_cruza_el_anio(self):
        self.assertTrue(falta_pago(12, {date(2025, 10, 1)}, date(2026, 10, 1)))
        self.assertFalse(falta_pago(12, {date(2025, 10, 1)}, date(2026, 9, 1)))


class Base(TestCase):
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            for modelo in (Maniobra, Vacio, Empleado):
                editor.create_model(modelo)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            for modelo in (Empleado, Vacio, Maniobra):
                editor.delete_model(modelo)
        super().tearDownClass()

    def usuario(self, nombre, staff=False, cargo=None):
        u = get_user_model().objects.create_user(nombre, password='x', is_staff=staff)
        if cargo:
            PerfilUsuario.objects.create(
                usuario=u, empleado=Empleado.objects.create(nombre_trabajador=nombre, cargo=cargo))
        c = APIClient()
        c.force_authenticate(user=u)
        return c

    def setUp(self):
        self.com = self.usuario('com', cargo='COMERCIAL')
        self.admin = self.usuario('admin', staff=True)


class ManiobrasDeTercerosTests(Base):

    def test_flete_es_transportista_ajeno_desde_agosto(self):
        si = Maniobra.objects.create(transportista=' transportes lopez ', fecha_pis=AGO)
        for t in ('FRABA CONTAINER', ' fraba container ', '', None):
            Maniobra.objects.create(transportista=t, fecha_pis=AGO)
        Maniobra.objects.create(transportista='TRANSPORTES LOPEZ', fecha_pis=date(2026, 7, 31))
        self.assertEqual(list(maniobras_de_terceros('flete').values_list('id', flat=True)), [si.id])

    def test_local_es_placa_pis_del_catalogo_de_terceros(self):
        UnidadTercero.objects.create(placas='ABC123')
        si = Maniobra.objects.create(placas_pis=' abc123 ', fecha_pis=AGO)
        Maniobra.objects.create(placas_pis='XYZ999', fecha_pis=AGO)
        self.assertEqual(list(maniobras_de_terceros('local').values_list('id', flat=True)), [si.id])


class CuentaPorPagarTests(Base):
    URL = '/api/cuentas-por-pagar/'

    def cuenta(self, cliente, **campos):
        datos = {'origen': 'flete', 'total': '1500', 'fecha': '2026-08-20', 'no_factura': 'A-1'}
        datos.update(campos)
        return cliente.post(self.URL, datos, format='json')

    def test_la_empresa_sale_de_la_factura_de_venta_o_se_elige(self):
        m = Maniobra.objects.create(transportista='LOPEZ', fecha_pis=AGO)
        r = self.cuenta(self.com, maniobra=m.id)
        self.assertEqual(r.status_code, 400)
        self.assertIn('empresa', r.data)

        Factura.objects.create(empresa='fraba', serie='S', folio='1', uuid='u', fecha_emision=AGO,
                               subtotal=1, total=1, maniobra=m)
        r = self.cuenta(self.com, maniobra=m.id)
        self.assertEqual((r.status_code, r.data['empresa']), (201, 'fraba'), r.data)
        self.assertEqual(str(r.data['vencimiento']), '2026-08-20')

    def test_una_activa_por_maniobra_y_nada_que_no_sea_de_tercero(self):
        m = Maniobra.objects.create(transportista='LOPEZ', fecha_pis=AGO)
        propia = Maniobra.objects.create(transportista='FRABA CONTAINER', fecha_pis=AGO)
        self.assertEqual(self.cuenta(self.com, maniobra=m.id, empresa='fraba').status_code, 201)
        self.assertEqual(self.cuenta(self.com, maniobra=m.id, empresa='fraba').status_code, 400)
        self.assertEqual(self.cuenta(self.com, maniobra=propia.id, empresa='fraba').status_code, 400)

    def test_mantenimiento_sin_maniobra(self):
        m = Maniobra.objects.create(transportista='LOPEZ', fecha_pis=AGO)
        self.assertEqual(self.cuenta(self.com, origen='mantenimiento', maniobra=m.id,
                                     empresa='fraba').status_code, 400)
        r = self.cuenta(self.com, origen='mantenimiento', empresa='soluciones', dias_credito=None)
        self.assertEqual((r.status_code, r.data['dias_credito']), (201, 0), r.data)

    def test_editar_si_cancelar_y_borrar_no(self):
        r = self.cuenta(self.com, origen='mantenimiento', empresa='fraba', dias_credito=30)
        url = f"{self.URL}{r.data['id']}/"
        r = self.com.patch(url, {'total': '2000', 'estado': 'cancelada'}, format='json')
        self.assertEqual((r.status_code, r.data['total'], r.data['estado']), (200, '2000.00', 'activa'))
        self.assertEqual(str(r.data['vencimiento']), '2026-09-19')

        self.assertEqual(self.com.post(f'{url}cancelar/').status_code, 403)
        self.assertEqual(self.com.delete(url).status_code, 405)  # no se borra nunca (P55)
        self.assertEqual(self.admin.post(f'{url}cancelar/').data['estado'], 'cancelada')

    def test_pagada_con_el_texto_del_frontend(self):
        r = self.cuenta(self.com, origen='mantenimiento', empresa='fraba')
        r = self.com.post(f"{self.URL}{r.data['id']}/pagada/", {'pagada': 'true'}, format='json')
        self.assertTrue(r.data['pagada'])

    def test_lista_de_fletes_con_su_cuenta(self):
        m = Maniobra.objects.create(transportista='LOPEZ', fecha_pis=AGO, folio='F-9')
        Maniobra.objects.create(transportista='OTRO', fecha_pis=AGO)
        self.cuenta(self.com, maniobra=m.id, empresa='fraba')
        filas = {f['folio']: f for f in self.com.get(f'{self.URL}maniobras/?origen=flete').data}
        self.assertEqual(len(filas), 2)
        self.assertEqual(filas['F-9']['cuenta']['total'], '1500.00')
        self.assertIsNone(filas[None]['cuenta'])

    def test_otros_cargos_fuera(self):
        coord = self.usuario('coord', cargo='Coordinador')
        for url in (self.URL, '/api/gastos-fijos/', '/api/capturas-mensuales/'):
            self.assertEqual(coord.get(url).status_code, 403, url)


class GastosFijosTests(Base):
    URL = '/api/gastos-fijos/'

    def test_celdas_y_meses_que_faltan(self):
        g = self.com.post(self.URL, {'empresa': 'fraba', 'concepto': 'Luz', 'dia_pago': 5,
                                     'monto': '800', 'periodicidad': 2}, format='json').data
        GastoFijo.objects.filter(pk=g['id']).update(created_at='2026-01-15T12:00:00Z')
        self.com.post(f"{self.URL}{g['id']}/pago/", {'mes': '2026-07', 'monto': '812.50'}, format='json')

        d = self.com.get(f'{self.URL}rejilla/?desde=2026-07&empresa=fraba').data
        fila = d['gastos'][0]
        self.assertEqual(d['meses'][0], '2026-07')
        self.assertEqual(fila['pagos']['2026-07'], '812.50')
        self.assertIsNone(fila['pagos']['2026-08'])
        self.assertIn('2026-09', fila['faltan'])        # bimestral tras julio
        self.assertNotIn('2026-08', fila['faltan'])

        r = self.com.post(f"{self.URL}{g['id']}/pago/", {'mes': '2026-07', 'monto': ''}, format='json')
        self.assertIsNone(r.data['monto'])               # vaciar = no pagado

    def test_dia_de_pago_valido_y_borrar_solo_staff(self):
        r = self.com.post(self.URL, {'empresa': 'fraba', 'concepto': 'Renta', 'dia_pago': 40}, format='json')
        self.assertEqual(r.status_code, 400)
        g = GastoFijo.objects.create(empresa='fraba', concepto='Renta')
        self.assertEqual(self.com.delete(f'{self.URL}{g.id}/').status_code, 403)
        self.assertEqual(self.admin.delete(f'{self.URL}{g.id}/').status_code, 204)


class CapturasMensualesTests(Base):
    URL = '/api/capturas-mensuales/'

    def test_captura_por_mes_y_borrar_solo_staff(self):
        r = self.com.post(self.URL, {'mes': '2026-08', 'tipo': 'impuesto', 'concepto': 'IVA',
                                     'monto': '12000'}, format='json')
        self.assertEqual((r.status_code, r.data['mes']), (201, '2026-08'), r.data)
        self.com.post(self.URL, {'mes': '2026-09', 'tipo': 'financiero', 'concepto': 'Crédito',
                                 'monto': '5000'}, format='json')
        self.assertEqual([c['concepto'] for c in self.com.get(f'{self.URL}?mes=2026-08').data], ['IVA'])
        self.assertEqual(self.com.delete(f"{self.URL}{r.data['id']}/").status_code, 403)
        self.assertEqual(self.admin.delete(f"{self.URL}{r.data['id']}/").status_code, 204)
