"""Conteo de maniobras por status — el panel SEGUIMIENTOS de la pantalla de inicio.

Lo que puede romper en silencio: que un combo ("por_salir,activo") deje de contar.
El campo guarda hasta 2 status separados por coma, así que un filtro exacto daría
un número más bajo que la tabla y nadie lo notaría hasta cuadrar a mano.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Maniobra, Vacio


class ResumenStatusTests(TestCase):
    # `maniobras` es managed=False y settings_test no la crea: se levanta desde el
    # modelo, igual que en test_folios.py. El alias es 'standard' porque es el que
    # devuelve get_db_alias() sin contexto de petición.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Maniobra)
            # `vacios` tambien: desde la 0061 la maniobra lee de ahi sus fechas y su
            # patio al serializarse, asi que sin esta tabla cualquier lectura revienta.
            editor.create_model(Vacio)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Vacio)
            editor.delete_model(Maniobra)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('seguimientos_user', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def resumen(self):
        r = self.cliente.get('/api/maniobras/resumen-status/')
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    def test_cuenta_los_status_simples(self):
        Maniobra.objects.create(solicita='a', status='activo')
        Maniobra.objects.create(solicita='b', status='activo')
        Maniobra.objects.create(solicita='c', status='pendiente')
        self.assertEqual(self.resumen(), {'activo': 2, 'pendiente': 1})

    def test_un_combo_cuenta_en_los_dos_status(self):
        """El corazón: "activo,pendiente" es UNA maniobra que está en los dos."""
        Maniobra.objects.create(solicita='a', status='activo,pendiente')
        self.assertEqual(self.resumen(), {'activo': 1, 'pendiente': 1})

    def test_cuenta_el_status_que_va_en_segundo_lugar(self):
        # "por_salir,activo" es el combo real más común; con un filtro exacto
        # esta maniobra no aparecería en ningún conteo.
        Maniobra.objects.create(solicita='a', status='por_salir,activo')
        self.assertEqual(self.resumen()['activo'], 1)

    def test_los_demas_status_no_suman(self):
        Maniobra.objects.create(solicita='a', status='quemada')
        Maniobra.objects.create(solicita='b', status=None)
        Maniobra.objects.create(solicita='c', status='')
        self.assertEqual(self.resumen(), {'activo': 0, 'pendiente': 0})

    def test_exige_autenticacion(self):
        r = APIClient().get('/api/maniobras/resumen-status/')
        self.assertEqual(r.status_code, 401)
