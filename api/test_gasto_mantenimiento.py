"""Gastos de mantenimiento y No. Eco del remolque (usuario, 2026-11-25).

Lo que rompe en silencio:
  · Solo unidades PROPIAS (catalogo `tractos`) y remolques del catalogo: el
    selector del frontend lo limita, pero el POST tiene que rechazarlo igual.
  · La pantalla no edita ni borra: PUT/DELETE deben dar 405.
  · No. Eco es opcional y UNICO: dos remolques sin numero no pueden chocar.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Tracto, Remolque

URL = '/api/gastos-mantenimiento/'


class GastoMantenimientoTests(TestCase):
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
        usuario = get_user_model().objects.create_user('mant_user', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=usuario)
        Tracto.objects.create(no_eco='01', unidad='Kenworth', anio=2020, placas='ABC1234', tipo='Tracto')
        Remolque.objects.create(no_eco='R-01', color='Rojo', tipo='Caja', placas='REM123')

    def datos(self, **cambios):
        return {'unidad': 'ABC1234', 'remolque': 'REM123', 'que_cambio': 'Balatas',
                'fecha': '2026-11-25', 'kilometraje': '123456.1234567891',
                'descripcion_pieza': 'Original', **cambios}

    def test_registra_con_unidad_propia_y_conserva_decimales(self):
        r = self.cliente.post(URL, self.datos(), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['kilometraje'], '123456.1234567891')

    def test_rechaza_unidad_que_no_es_propia(self):
        r = self.cliente.post(URL, self.datos(unidad='TER9999'), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('unidad', r.data)

    def test_rechaza_remolque_fuera_del_catalogo(self):
        r = self.cliente.post(URL, self.datos(remolque='NOEXISTE'), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('remolque', r.data)

    def test_no_se_edita_ni_se_borra(self):
        id_ = self.cliente.post(URL, self.datos(), format='json').data['id']
        self.assertEqual(self.cliente.put(f'{URL}{id_}/', self.datos(), format='json').status_code, 405)
        self.assertEqual(self.cliente.delete(f'{URL}{id_}/').status_code, 405)

    def test_no_eco_vacio_no_choca_y_repetido_si(self):
        for placas in ('REM200', 'REM201'):
            r = self.cliente.post('/api/remolques/', {'no_eco': '', 'color': 'Azul', 'tipo': 'Caja', 'placas': placas}, format='json')
            self.assertEqual(r.status_code, 201, r.data)
            self.assertIsNone(r.data['no_eco'])
        r = self.cliente.post('/api/remolques/', {'no_eco': 'R-01', 'color': 'Azul', 'tipo': 'Caja', 'placas': 'REM202'}, format='json')
        self.assertEqual(r.status_code, 400)
