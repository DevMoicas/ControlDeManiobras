"""Buscar un folio viejo en el selector de folios.

El selector ofrece las ultimas 50 maniobras con folio, que es lo que se elige el
99% de las veces. Lo que se cubre aqui es el 1% restante y lo que se haria mal en
silencio:

  · La busqueda tiene que filtrar ANTES del corte de 50. Filtrando despues
    —que es lo natural si se hace en el navegador— un folio de hace un ano no
    aparece jamas por muy exacto que sea el termino, y el buscador parece roto
    justo cuando hace falta.
  · Un Full gasta un folio por operador y la maniobra entra en la consulta si
    casa CUALQUIERA de los dos. Sin volver a mirar folio a folio, buscar "894"
    devuelve tambien el 895 de su companero.

Solo corre con:  Manage.py test api.test_buscar_folios --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Maniobra

URL = '/api/maniobras/folios-recientes/'


class BuscarFoliosTests(TestCase):
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
        self.usuario = get_user_model().objects.create_user('buscador', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def folios(self, **parametros):
        respuesta = self.cliente.get(URL, parametros)
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        return [f['folio'] for f in respuesta.data]

    def test_por_defecto_llegan_las_50_maniobras_mas_recientes(self):
        for numero in range(1, 56):
            Maniobra.objects.create(solicita='P', folio=f'F-{numero:04d}')

        listados = self.folios()
        self.assertEqual(len(listados), 50)
        self.assertIn('F-0055', listados)      # la ultima
        self.assertNotIn('F-0005', listados)   # fuera del corte

    def test_buscar_alcanza_un_folio_que_quedo_fuera_del_corte(self):
        # El motivo de todo esto: el folio viejo NO esta en la lista de siempre
        # y aparece en cuanto se busca.
        for numero in range(1, 56):
            Maniobra.objects.create(solicita='P', folio=f'F-{numero:04d}')

        self.assertNotIn('F-0001', self.folios())
        self.assertEqual(self.folios(buscar='F-0001'), ['F-0001'])

    def test_la_busqueda_parcial_devuelve_todas_las_coincidencias(self):
        for folio in ('894', '8940', 'A-894', '777'):
            Maniobra.objects.create(solicita='P', folio=folio)

        encontrados = self.folios(buscar='894')
        self.assertEqual(sorted(encontrados), ['894', '8940', 'A-894'])

    def test_no_se_cuela_el_folio_companero_de_un_full(self):
        # La maniobra entra por folio_2, pero la fila que sobra no debe salir.
        Maniobra.objects.create(solicita='P', folio='894', folio_2='895')

        self.assertEqual(self.folios(buscar='894'), ['894'])
        self.assertEqual(self.folios(buscar='895'), ['895'])
        # Sin buscar salen los dos: es un Full con sus dos folios.
        self.assertEqual(sorted(self.folios()), ['894', '895'])

    def test_sin_coincidencias_no_devuelve_nada(self):
        Maniobra.objects.create(solicita='P', folio='894')

        self.assertEqual(self.folios(buscar='ZZZZ'), [])

    def test_buscar_ignora_mayusculas(self):
        Maniobra.objects.create(solicita='P', folio='A-2261')

        self.assertEqual(self.folios(buscar='a-2261'), ['A-2261'])
