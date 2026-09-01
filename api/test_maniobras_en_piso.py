"""?sin_asignar=1 — las maniobras que siguen esperando en el puerto.

Alimenta el desglose de PENDIENTES del panel de seguimientos. El criterio es
que no tengan a nadie que las mueva: ni transportista NI operador. Con
cualquiera de los dos puesto ya van a salir de viaje (decidido con el usuario,
2026-08-25), y ese caso mixto es justo el que se colaria sin darse cuenta.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Maniobra, Vacio

URL = '/api/maniobras/?status=pendiente&sin_asignar=1&ordering=fecha_pis,id'


class EnPisoTests(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # `maniobras` es managed=False y settings_test no la crea.
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
        self.usuario = get_user_model().objects.create_user('capturista', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def crear(self, solicita, **campos):
        campos.setdefault('status', 'pendiente')
        return Maniobra.objects.create(solicita=solicita, **campos)

    def en_piso(self):
        datos = self.cliente.get(URL).data
        return [m['solicita'] for m in datos.get('results', datos)]

    def test_una_pendiente_sin_nadie_asignado_sale(self):
        self.crear('EN-PISO')
        self.assertEqual(self.en_piso(), ['EN-PISO'])

    def test_con_operador_ya_no_sale(self):
        self.crear('YA-SALE', asignacion_operador_status='ANTONIO FRANCO')
        self.assertEqual(self.en_piso(), [])

    def test_con_transportista_tampoco_sale(self):
        """El caso mixto: tiene transportista tercero pero aun no operador.
        Basta con uno de los dos para que deje de estar esperando."""
        self.crear('TERCERO-YA-ADJUDICADA', transportista='BSH')
        self.assertEqual(self.en_piso(), [])

    def test_una_activa_no_sale_aunque_no_tenga_a_nadie(self):
        """El filtro de status sigue mandando: la lista es de PENDIENTES."""
        self.crear('ACTIVA', status='activo')
        self.assertEqual(self.en_piso(), [])

    def test_la_mas_vieja_va_arriba(self):
        """Al reves que la tabla de Maniobras: arriba lo que lleva mas tiempo
        parado en piso."""
        self.crear('DIA-25', fecha_pis='2026-08-25')
        self.crear('DIA-20', fecha_pis='2026-08-20')
        self.crear('DIA-22', fecha_pis='2026-08-22')

        self.assertEqual(self.en_piso(), ['DIA-20', 'DIA-22', 'DIA-25'])
