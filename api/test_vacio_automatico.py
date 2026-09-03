"""Al asignar un folio a una maniobra, sus contenedores nacen en Vacios.

Lo que se cubre es lo que decidiria mal en silencio: cuando NO se crea (carga
suelta, duplicados), y el reparto de un Full — que empieza en una sola fila con
los dos contenedores y se parte en dos el dia que aparece el segundo operador.
Ese paso es el unico que reescribe una fila ya guardada, asi que es el que mas
importa que no se salga de su carril.

Mismo disparo que el gasto automatico (test_gasto_automatico.py), pero SIN el
filtro de FRABA: el contenedor se devuelve lo mueva quien lo mueva.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Chofer, Gasto, Maniobra, Vacio

URL = '/api/maniobras/'


class BaseVacioAutomatico(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # `maniobras`, `gastos` y `vacios` son managed=False: settings_test no
        # las crea. Gasto entra porque el mismo POST dispara su automatismo.
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Maniobra)
            editor.create_model(Gasto)
            editor.create_model(Vacio)
            # Chofer: al asignar el folio, el reporte de viaje automatico
            # busca el coordinador del operador (_coordinador_del_operador).
            editor.create_model(Chofer)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Chofer)
            editor.delete_model(Vacio)
            editor.delete_model(Gasto)
            editor.delete_model(Maniobra)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('capturista', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def poner_folio(self, maniobra_id, folio='F-2279'):
        return self.cliente.patch(f'{URL}{maniobra_id}/', {'folio': folio}, format='json')

    def sencillo(self, **campos):
        campos.setdefault('solicita', 'PRUEBA')
        campos.setdefault('tipo_servicio', 'sencillo')
        campos.setdefault('contenedor', 'WHLU5591210')
        campos.setdefault('tipo', '40 / HC')
        campos.setdefault('asignacion_operador_status', 'JUAN PEREZ LOPEZ')
        return Maniobra.objects.create(**campos)

    def full(self, **campos):
        campos.setdefault('tipo_servicio', 'full')
        campos.setdefault('contenedor', 'WHLU5591210')
        campos.setdefault('contenedor_2', 'WHSU6575360')
        campos.setdefault('tipo', '20 / DC')
        campos.setdefault('tipo_2', '40 / HC')
        return self.sencillo(**campos)


class SeCreaElVacioTests(BaseVacioAutomatico):

    def test_al_asignar_folio_a_un_sencillo_nace_su_vacio(self):
        m = self.sencillo()
        self.assertEqual(Vacio.objects.count(), 0)

        r = self.poner_folio(m.id)

        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(Vacio.objects.get().contenedor, 'WHLU5591210')

    def test_nace_pendiente(self):
        """Es el filtro por defecto de la pagina: en otro status no se veria."""
        self.poner_folio(self.sencillo().id)
        self.assertEqual(Vacio.objects.get().status, 'pendiente')

    def test_el_status_eir_nace_pendiente(self):
        """En blanco obligaba a marcar 'Pendiente' a mano en cada vacio."""
        self.poner_folio(self.sencillo().id)
        self.assertEqual(Vacio.objects.get().status_eir, 'pendiente')

    def test_se_recupera_el_operador_del_viaje(self):
        self.poner_folio(self.sencillo().id)
        self.assertEqual(Vacio.objects.get().operador, 'JUAN PEREZ LOPEZ')

    def test_el_tipo_son_solo_los_numeros(self):
        """En Vacios interesa el tamano, no "40 / HC"."""
        self.poner_folio(self.sencillo().id)
        self.assertEqual(Vacio.objects.get().tipo_contenedor, '40')

    def test_un_viaje_de_tercero_tambien_deja_su_vacio(self):
        """A diferencia del gasto: el contenedor se devuelve igual."""
        m = self.sencillo(transportista='BSH')

        self.poner_folio(m.id)

        self.assertEqual(Vacio.objects.count(), 1)
        self.assertEqual(Gasto.objects.count(), 0)

    def test_crear_la_maniobra_ya_con_folio_tambien_lo_crea(self):
        r = self.cliente.post(URL, {'solicita': 'PRUEBA', 'folio': 'F-2279',
                                    'tipo_servicio': 'sencillo',
                                    'contenedor': 'WHLU5591210'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Vacio.objects.count(), 1)

    def test_queda_registrado_quien_asigno_el_folio(self):
        self.poner_folio(self.sencillo().id)
        self.assertEqual(Vacio.objects.get().created_by, 'capturista')

    def test_un_contenedor_ya_entregado_no_bloquea_el_viaje_siguiente(self):
        """El mismo contenedor vuelve a pasar meses despues."""
        Vacio.objects.create(contenedor='WHLU5591210', status='entregado')

        self.poner_folio(self.sencillo().id)

        self.assertEqual(Vacio.objects.filter(status='pendiente').count(), 1)


class FullTests(BaseVacioAutomatico):
    """Un Full con un solo operador es UNA fila; repartido, dos."""

    def test_con_un_solo_operador_los_dos_contenedores_van_en_la_misma_fila(self):
        self.poner_folio(self.full().id)

        vacio = Vacio.objects.get()
        self.assertEqual(vacio.contenedor, 'WHLU5591210 - WHSU6575360')
        self.assertEqual(vacio.operador, 'JUAN PEREZ LOPEZ')

    def test_un_full_mixto_anota_los_dos_numeros(self):
        self.poner_folio(self.full().id)
        self.assertEqual(Vacio.objects.get().tipo_contenedor, '20 - 40')

    def test_un_full_del_mismo_tipo_anota_el_numero_una_sola_vez(self):
        """Dos 40HC son "40", no "40 - 40"."""
        m = self.full(tipo='40 / HC', tipo_2='40 / HC')

        self.poner_folio(m.id)

        self.assertEqual(Vacio.objects.get().tipo_contenedor, '40')

    def test_repartido_desde_el_principio_son_dos_filas(self):
        m = self.full(operador_2='PEDRO GOMEZ')

        self.poner_folio(m.id)

        self.assertEqual(
            sorted(Vacio.objects.values_list('contenedor', 'operador', 'tipo_contenedor')),
            [('WHLU5591210', 'JUAN PEREZ LOPEZ', '20'),
             ('WHSU6575360', 'PEDRO GOMEZ', '40')])

    def test_el_segundo_operador_que_llega_despues_parte_la_fila_en_dos(self):
        """Lo pedido: primero se asigna un operador y la fila lleva los dos
        contenedores; al aparecer el segundo, cada uno se queda con el suyo."""
        m = self.full()
        self.poner_folio(m.id)
        self.assertEqual(Vacio.objects.count(), 1)

        self.cliente.patch(f'{URL}{m.id}/', {'operador_2': 'PEDRO GOMEZ'}, format='json')

        self.assertEqual(
            sorted(Vacio.objects.values_list('contenedor', 'operador')),
            [('WHLU5591210', 'JUAN PEREZ LOPEZ'), ('WHSU6575360', 'PEDRO GOMEZ')])

    def test_un_registro_viejo_trae_los_dos_contenedores_en_una_columna(self):
        """Anteriores a la 0035: "A/B" dentro de `contenedor`, sin backfill."""
        m = self.full(contenedor='WHLU5591210/WHSU6575360', contenedor_2='',
                      tipo='20 - 40 / DC - HC', tipo_2='', operador_2='PEDRO GOMEZ')

        self.poner_folio(m.id)

        self.assertEqual(sorted(Vacio.objects.values_list('contenedor', flat=True)),
                         ['WHLU5591210', 'WHSU6575360'])


class NoSeCreaElVacioTests(BaseVacioAutomatico):
    """La mitad que importa: cuando NO debe crearse."""

    def test_la_carga_suelta_no_lleva_contenedor(self):
        m = self.sencillo(tipo_servicio='carga_suelta', contenedor='',
                          tipo='9 - 14 / PALLETS - CARTONES')

        self.poner_folio(m.id)

        self.assertEqual(Vacio.objects.count(), 0)

    def test_la_carga_suelta_de_los_registros_viejos_tampoco(self):
        """Sin tipo_servicio se reconocia por el texto del contenedor."""
        m = self.sencillo(tipo_servicio='', contenedor='CARGA SUELTA')

        self.poner_folio(m.id)

        self.assertEqual(Vacio.objects.count(), 0)

    def test_una_maniobra_sin_contenedor_no_crea_una_fila_en_blanco(self):
        m = self.sencillo(contenedor='')

        self.poner_folio(m.id)

        self.assertEqual(Vacio.objects.count(), 0)

    def test_si_ese_contenedor_ya_esta_pendiente_no_se_duplica(self):
        Vacio.objects.create(contenedor='WHLU5591210', status='pendiente')

        self.poner_folio(self.sencillo().id)

        self.assertEqual(Vacio.objects.count(), 1)

    def test_cambiar_un_folio_por_otro_no_crea_un_segundo_vacio(self):
        m = self.sencillo()
        self.poner_folio(m.id, 'F-2279')

        self.poner_folio(m.id, 'R-2280')

        self.assertEqual(Vacio.objects.count(), 1)

    def test_editar_cualquier_otra_cosa_no_crea_vacios(self):
        """Una maniobra vieja que ya traia folio no resucita vacios entregados."""
        m = self.sencillo(folio='F-2279')

        self.cliente.patch(f'{URL}{m.id}/', {'cliente': 'YAZAKI'}, format='json')

        self.assertEqual(Vacio.objects.count(), 0)

    def test_crear_una_maniobra_sin_folio_no_crea_vacios(self):
        r = self.cliente.post(URL, {'solicita': 'PRUEBA', 'contenedor': 'WHLU5591210'},
                              format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Vacio.objects.count(), 0)

    def test_no_pisa_una_fila_que_alguien_edito_a_mano(self):
        """Separar solo actua sobre la fila que lleva los DOS contenedores."""
        m = self.full()
        self.poner_folio(m.id)
        fila = Vacio.objects.get()
        fila.contenedor = 'WHLU5591210'      # ya la separo una persona
        fila.operador = 'OTRO OPERADOR'
        fila.save()

        self.cliente.patch(f'{URL}{m.id}/', {'operador_2': 'PEDRO GOMEZ'}, format='json')

        fila.refresh_from_db()
        self.assertEqual(fila.operador, 'OTRO OPERADOR')
        self.assertEqual(Vacio.objects.count(), 2)
