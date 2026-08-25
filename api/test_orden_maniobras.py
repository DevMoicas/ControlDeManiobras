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

    def crear(self, solicita, fecha_pis=None, fecha_entrega_mercancia='2026-01-01'):
        # Con fecha de entrega por defecto: sin ella todas subirian al primer
        # grupo y las pruebas de orden por FECHA PIS no probarian nada.
        return Maniobra.objects.create(
            solicita=solicita, fecha_pis=fecha_pis,
            fecha_entrega_mercancia=fecha_entrega_mercancia)

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


class SinFechaDeEntregaArribaTests(OrdenPorFechaPisTests):
    """Las que estan pendientes de que les pongan FECHA DE ENTREGA van primero.

    En medio de la lista se pierden de vista, y son justo las que hay que
    atender (77 de 412 hoy).
    """

    def test_una_sin_fecha_de_entrega_sube_aunque_su_fecha_pis_sea_vieja(self):
        self.crear('CON-ENTREGA', '2026-12-31')
        self.crear('SIN-ENTREGA', '2026-01-01', fecha_entrega_mercancia=None)

        self.assertEqual(self.listar(), ['SIN-ENTREGA', 'CON-ENTREGA'])

    def test_dentro_de_cada_grupo_sigue_mandando_la_fecha_pis(self):
        self.crear('SIN-VIEJA',  '2026-01-01', fecha_entrega_mercancia=None)
        self.crear('SIN-NUEVA',  '2026-12-31', fecha_entrega_mercancia=None)
        self.crear('CON-VIEJA',  '2026-02-01')
        self.crear('CON-NUEVA',  '2026-11-30')

        self.assertEqual(
            self.listar(),
            ['SIN-NUEVA', 'SIN-VIEJA', 'CON-NUEVA', 'CON-VIEJA'])

    def test_la_flecha_invierte_la_fecha_pis_pero_no_saca_de_arriba_a_las_sin_entrega(self):
        """sin_entrega no se invierte con el toggle: la flecha es de FECHA PIS."""
        self.crear('CON-ENTREGA', '2026-01-01')
        self.crear('SIN-ENTREGA', '2026-12-31', fecha_entrega_mercancia=None)

        self.assertEqual(self.listar('sin_entrega,fecha_pis,id'),
                         ['SIN-ENTREGA', 'CON-ENTREGA'])

    def test_quien_no_lo_pide_no_lo_sufre(self):
        """El desglose de PENDIENTES pega al mismo endpoint y NO quiere este
        criterio: pide ordering=fecha_pis,id y debe seguir mandando la fecha."""
        self.crear('SIN-ENTREGA', '2026-12-31', fecha_entrega_mercancia=None)
        self.crear('CON-ENTREGA', '2026-01-01')

        self.assertEqual(self.listar('fecha_pis,id'),
                         ['CON-ENTREGA', 'SIN-ENTREGA'])
