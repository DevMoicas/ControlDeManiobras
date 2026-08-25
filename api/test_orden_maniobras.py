"""La tabla de Maniobras se ordena por FECHA PIS, de la mas proxima hacia atras.

Antes ordenaba por id (orden de creacion) aunque la flecha colgara de la columna
FECHA PIS. Lo que se cubre aqui es lo que se veria mal sin darse cuenta: el orden
por defecto, las maniobras sin fecha encabezando la tabla (Postgres pone los NULL
primero en DESC) y el desempate que hace que la paginacion no repita filas.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Maniobra

URL = '/api/maniobras/'


class OrdenPorFechaPisTests(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # `maniobras` es managed=False y settings_test no la crea.
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Maniobra)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Maniobra)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('capturista', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def crear(self, solicita, fecha_pis=None):
        return Maniobra.objects.create(solicita=solicita, fecha_pis=fecha_pis)

    def listar(self, orden=None):
        url = URL if orden is None else '%s?ordering=%s' % (URL, orden)
        datos = self.cliente.get(url).data
        return [m['solicita'] for m in datos.get('results', datos)]

    def test_por_defecto_la_fecha_mas_proxima_va_arriba(self):
        """25, 26 y 27 se ven como 27, 26, 25."""
        self.crear('DIA-25', '2026-08-25')
        self.crear('DIA-27', '2026-08-27')
        self.crear('DIA-26', '2026-08-26')

        self.assertEqual(self.listar(), ['DIA-27', 'DIA-26', 'DIA-25'])

    def test_el_orden_no_es_el_de_creacion(self):
        """La red de seguridad del cambio: creadas al reves de su fecha."""
        self.crear('VIEJA', '2026-01-01')
        self.crear('NUEVA', '2026-12-31')

        self.assertEqual(self.listar()[0], 'NUEVA')

    def test_las_maniobras_sin_fecha_van_al_final(self):
        """Postgres pone los NULL PRIMERO en DESC: sin nulls_last estas
        encabezarian la tabla."""
        self.crear('SIN-FECHA')
        self.crear('CON-FECHA', '2026-08-25')

        self.assertEqual(self.listar(), ['CON-FECHA', 'SIN-FECHA'])

    def test_invertir_el_orden_deja_las_sin_fecha_igualmente_al_final(self):
        self.crear('SIN-FECHA')
        self.crear('VIEJA', '2026-01-01')
        self.crear('NUEVA', '2026-12-31')

        self.assertEqual(self.listar('fecha_pis,id'), ['VIEJA', 'NUEVA', 'SIN-FECHA'])

    def test_dos_del_mismo_dia_desempatan_por_id(self):
        """Sin desempate el orden es arbitrario y la paginacion de 60 en 60
        puede repetir o saltarse filas entre paginas."""
        self.crear('PRIMERA', '2026-08-25')
        self.crear('SEGUNDA', '2026-08-25')

        self.assertEqual(self.listar(), ['SEGUNDA', 'PRIMERA'])
