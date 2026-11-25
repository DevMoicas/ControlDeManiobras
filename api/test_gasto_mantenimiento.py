"""Mantenimiento, Gastos mantenimiento y No. Eco del remolque (usuario, 2026-11-25).

Lo que rompe en silencio:
  · Solo unidades PROPIAS (catalogo `tractos`) o remolques del catalogo, y
    exactamente uno de los dos: el selector lo limita, el POST/PATCH lo exige.
  · El apiClient del frontend manda null en vez de '' para el que no se eligio.
  · Editar: todos. Borrar: solo admin (is_staff).
  · No. Eco es opcional y UNICO: dos remolques sin numero no pueden chocar.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Tracto, Remolque

MANT = '/api/mantenimientos/'
GASTO = '/api/gastos-mantenimiento/'


class Base(TestCase):
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # `tractos` y `remolques` son managed=False: settings_test no las crea.
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Tracto)
            editor.create_model(Remolque)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Remolque)
            editor.delete_model(Tracto)
        super().tearDownClass()

    def setUp(self):
        Usuario = get_user_model()
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=Usuario.objects.create_user('mant_user', password='x'))
        self.admin = APIClient()
        self.admin.force_authenticate(user=Usuario.objects.create_user('mant_admin', password='x', is_staff=True))
        Tracto.objects.create(no_eco='01', unidad='Kenworth', anio=2020, placas='ABC1234', tipo='Tracto')
        Remolque.objects.create(no_eco='R-01', color='Rojo', tipo='Caja', placas='REM123')


class MantenimientoTests(Base):
    def datos(self, **cambios):
        return {'unidad': 'ABC1234', 'remolque': None, 'que_cambio': 'Balatas',
                'fecha': '2026-11-25', 'kilometraje': '123456.1234567891',
                'descripcion_pieza': 'Original', **cambios}

    def test_registra_y_conserva_decimales(self):
        r = self.cliente.post(MANT, self.datos(), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['kilometraje'], '123456.1234567891')
        self.assertEqual(r.data['remolque'], '')

    def test_rechaza_unidad_ajena_y_remolque_fuera_del_catalogo(self):
        self.assertEqual(self.cliente.post(MANT, self.datos(unidad='TER9999'), format='json').status_code, 400)
        r = self.cliente.post(MANT, self.datos(unidad=None, remolque='NOEXISTE'), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('remolque', r.data)

    def test_uno_u_otro_nunca_ambos_ni_ninguno(self):
        self.assertEqual(self.cliente.post(MANT, self.datos(unidad=None, remolque='REM123'), format='json').status_code, 201)
        for unidad, remolque in (('ABC1234', 'REM123'), (None, None)):
            r = self.cliente.post(MANT, self.datos(unidad=unidad, remolque=remolque), format='json')
            self.assertEqual(r.status_code, 400, (unidad, remolque))

    def test_editar_todos_borrar_solo_admin(self):
        id_ = self.cliente.post(MANT, self.datos(), format='json').data['id']
        r = self.cliente.patch(f'{MANT}{id_}/', {'que_cambio': 'Llantas'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        # Cambiar a remolque: el vehiculo se vacia en el mismo PATCH.
        r = self.cliente.patch(f'{MANT}{id_}/', {'unidad': None, 'remolque': 'REM123'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        # Un PATCH que dejaria los dos puestos se rechaza.
        self.assertEqual(self.cliente.patch(f'{MANT}{id_}/', {'unidad': 'ABC1234'}, format='json').status_code, 400)
        self.assertEqual(self.cliente.delete(f'{MANT}{id_}/').status_code, 403)
        self.assertEqual(self.admin.delete(f'{MANT}{id_}/').status_code, 204)


class GastoMantenimientoTests(Base):
    def datos(self, **cambios):
        return {'unidad': None, 'remolque': 'REM123', 'descripcion': 'Cambio de balatas',
                'monto': '1500.50', 'metodo_pago': 'tdc', 'fecha': '2026-11-25', **cambios}

    def test_registra_editar_y_borrar(self):
        r = self.cliente.post(GASTO, self.datos(), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        id_ = r.data['id']
        r = self.cliente.patch(f'{GASTO}{id_}/', {'metodo_pago': 'efectivo'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.cliente.delete(f'{GASTO}{id_}/').status_code, 403)
        self.assertEqual(self.admin.delete(f'{GASTO}{id_}/').status_code, 204)

    def test_valida_metodo_y_uno_u_otro(self):
        self.assertEqual(self.cliente.post(GASTO, self.datos(metodo_pago='cheque'), format='json').status_code, 400)
        self.assertEqual(self.cliente.post(GASTO, self.datos(unidad='ABC1234'), format='json').status_code, 400)
        self.assertEqual(self.cliente.post(GASTO, self.datos(monto='-1'), format='json').status_code, 400)
        self.assertEqual(self.cliente.post(GASTO, self.datos(fecha=None), format='json').status_code, 400)

    def test_proveedor_opcional(self):
        r = self.cliente.post(GASTO, self.datos(proveedor=None), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['proveedor'], '')
        r = self.cliente.post(GASTO, self.datos(proveedor=' Refaccionaria X '), format='json')
        self.assertEqual(r.data['proveedor'], 'Refaccionaria X')


class NoEcoRemolqueTests(Base):
    def test_no_eco_vacio_no_choca_y_repetido_si(self):
        for placas in ('REM200', 'REM201'):
            r = self.cliente.post('/api/remolques/', {'no_eco': '', 'color': 'Azul', 'tipo': 'Caja', 'placas': placas}, format='json')
            self.assertEqual(r.status_code, 201, r.data)
            self.assertIsNone(r.data['no_eco'])
        r = self.cliente.post('/api/remolques/', {'no_eco': 'R-01', 'color': 'Azul', 'tipo': 'Caja', 'placas': 'REM202'}, format='json')
        self.assertEqual(r.status_code, 400)
