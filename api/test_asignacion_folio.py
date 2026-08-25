"""La columna ASIGNACION del folio la escribe la maniobra que lo tiene puesto.

FRABA (o sin transportista) -> las dos primeras palabras del operador.
Tercero                     -> "TERCERO <transportista>".

Lo que se cubre es lo que decidiria mal en silencio: escribir el nombre
equivocado, y sobre todo NO limpiar el folio que se suelta — disponibles() da
por ocupado todo folio con algo escrito, asi que un nombre olvidado retira ese
folio del talonario para siempre.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Chofer, Folio, Gasto, Maniobra

URL = '/api/maniobras/'


class BaseAsignacion(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    # Las tres son managed=False y settings_test no las crea. `gastos` y
    # `choferes` hacen falta aunque esto no las pruebe: guardar una maniobra con
    # folio dispara el gasto automatico, y poner un operador consulta su licencia.
    TABLAS = (Maniobra, Gasto, Chofer)

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            for modelo in cls.TABLAS:
                editor.create_model(modelo)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            for modelo in reversed(cls.TABLAS):
                editor.delete_model(modelo)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('capturista', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)
        self.cliente.post('/api/folios/generar/', {'tabla': 'manzanillo'}, format='json')

    def patch(self, maniobra_id, **campos):
        return self.cliente.patch('%s%s/' % (URL, maniobra_id), campos, format='json')

    def asignacion(self, codigo='F-2279'):
        return Folio.objects.get(codigo=codigo).asignacion

    def disponibles(self):
        r = self.cliente.get('/api/folios/disponibles/?tabla=manzanillo')
        return [f['codigo'] for f in r.data]


class SeEscribeTests(BaseAsignacion):

    def test_fraba_pone_las_dos_primeras_palabras_del_operador(self):
        m = Maniobra.objects.create(solicita='PRUEBA', transportista='FRABA CONTAINER',
                                    asignacion_operador_status='JUAN CARLOS PEREZ LOPEZ')
        self.patch(m.id, folio='F-2279')
        self.assertEqual(self.asignacion(), 'JUAN CARLOS')

    def test_un_operador_de_dos_palabras_va_entero(self):
        m = Maniobra.objects.create(solicita='PRUEBA',
                                    asignacion_operador_status='ANTONIO FRANCO')
        self.patch(m.id, folio='F-2279')
        self.assertEqual(self.asignacion(), 'ANTONIO FRANCO')

    def test_sin_transportista_cuenta_como_fraba(self):
        """367 de 409 maniobras lo tienen vacio: si contara como tercero, casi
        todos los folios dirian "TERCERO"."""
        m = Maniobra.objects.create(solicita='PRUEBA', transportista='',
                                    asignacion_operador_status='ANTONIO FRANCO')
        self.patch(m.id, folio='F-2279')
        self.assertEqual(self.asignacion(), 'ANTONIO FRANCO')

    def test_un_tercero_pone_tercero_y_su_nombre(self):
        m = Maniobra.objects.create(solicita='PRUEBA', transportista='BSH',
                                    asignacion_operador_status='PEDRO RAMIREZ')
        self.patch(m.id, folio='F-2279')
        self.assertEqual(self.asignacion(), 'TERCERO BSH')

    def test_al_crear_la_maniobra_ya_con_folio_tambien_se_escribe(self):
        """El folio se puede elegir en la fila nueva, antes de guardar."""
        self.cliente.post(URL, {'solicita': 'PRUEBA', 'folio': 'F-2279',
                                'asignacion_operador_status': 'ANTONIO FRANCO'},
                          format='json')
        self.assertEqual(self.asignacion(), 'ANTONIO FRANCO')

    def test_el_folio_del_segundo_operador_lleva_al_segundo_operador(self):
        """Un Full repartido gasta un folio por operador y cada uno lleva el
        suyo."""
        m = Maniobra.objects.create(solicita='PRUEBA',
                                    asignacion_operador_status='ANTONIO FRANCO',
                                    operador_2='FIDEL CASTILLO')
        self.patch(m.id, folio='F-2279', folio_2='R-2280')
        self.assertEqual(self.asignacion('F-2279'), 'ANTONIO FRANCO')
        self.assertEqual(self.asignacion('R-2280'), 'FIDEL CASTILLO')

    def test_se_recorta_a_los_40_de_la_columna(self):
        """Un nombre largo se corta; nunca revienta el guardado de la maniobra."""
        m = Maniobra.objects.create(solicita='PRUEBA', transportista='T' * 60)
        self.patch(m.id, folio='F-2279')
        self.assertEqual(self.asignacion(), ('TERCERO ' + 'T' * 60)[:40])
        self.assertEqual(len(self.asignacion()), 40)

    def test_el_servicio_pisa_lo_escrito_a_mano(self):
        lote = self.cliente.get('/api/folios/?tabla=manzanillo').data
        fid = next(f['id'] for f in lote if f['codigo'] == 'F-2279')
        self.cliente.patch('/api/folios/%s/' % fid, {'asignacion': 'apunte viejo'},
                           format='json')

        m = Maniobra.objects.create(solicita='PRUEBA',
                                    asignacion_operador_status='ANTONIO FRANCO')
        self.patch(m.id, folio='F-2279')

        self.assertEqual(self.asignacion(), 'ANTONIO FRANCO')


class SeRellenaDespuesTests(BaseAsignacion):
    """El caso normal: el folio se pone antes de saber quien lo llevara."""

    def test_un_folio_sin_operador_ni_transportista_no_escribe_nada(self):
        m = Maniobra.objects.create(solicita='PRUEBA')
        self.patch(m.id, folio='F-2279')
        self.assertEqual(self.asignacion(), '')

    def test_capturar_el_operador_despues_rellena_el_folio(self):
        m = Maniobra.objects.create(solicita='PRUEBA')
        self.patch(m.id, folio='F-2279')

        self.patch(m.id, asignacion_operador_status='ANTONIO FRANCO')

        self.assertEqual(self.asignacion(), 'ANTONIO FRANCO')

    def test_capturar_el_transportista_despues_lo_convierte_en_tercero(self):
        m = Maniobra.objects.create(solicita='PRUEBA',
                                    asignacion_operador_status='PEDRO RAMIREZ')
        self.patch(m.id, folio='F-2279')
        self.assertEqual(self.asignacion(), 'PEDRO RAMIREZ')

        self.patch(m.id, transportista='BSH')

        self.assertEqual(self.asignacion(), 'TERCERO BSH')


class SeLimpiaTests(BaseAsignacion):
    """La mitad que importa: el folio que se suelta vuelve al talonario."""

    def test_quitar_el_folio_borra_su_asignacion(self):
        m = Maniobra.objects.create(solicita='PRUEBA',
                                    asignacion_operador_status='ANTONIO FRANCO')
        self.patch(m.id, folio='F-2279')

        self.patch(m.id, folio='')

        self.assertEqual(self.asignacion(), '')

    def test_el_folio_soltado_vuelve_a_ofrecerse_como_libre(self):
        """Sin esto el talonario se agota en falso: disponibles() excluye todo
        folio con algo escrito en ASIGNACION."""
        m = Maniobra.objects.create(solicita='PRUEBA',
                                    asignacion_operador_status='ANTONIO FRANCO')
        self.patch(m.id, folio='F-2279')
        self.patch(m.id, folio='')

        self.assertEqual(self.disponibles()[0], 'F-2279')

    def test_cambiar_de_folio_limpia_el_viejo_y_escribe_el_nuevo(self):
        m = Maniobra.objects.create(solicita='PRUEBA',
                                    asignacion_operador_status='ANTONIO FRANCO')
        self.patch(m.id, folio='F-2279')

        self.patch(m.id, folio='R-2280')

        self.assertEqual(self.asignacion('F-2279'), '')
        self.assertEqual(self.asignacion('R-2280'), 'ANTONIO FRANCO')

    def test_quitar_el_operador_vacia_la_asignacion(self):
        m = Maniobra.objects.create(solicita='PRUEBA',
                                    asignacion_operador_status='ANTONIO FRANCO')
        self.patch(m.id, folio='F-2279')

        self.patch(m.id, asignacion_operador_status='')

        self.assertEqual(self.asignacion(), '')

    def test_un_folio_que_no_esta_en_el_catalogo_no_revienta(self):
        """Texto libre de la epoca anterior al desplegable."""
        m = Maniobra.objects.create(solicita='PRUEBA',
                                    asignacion_operador_status='ANTONIO FRANCO')
        r = self.patch(m.id, folio='ESCRITO A MANO')
        self.assertEqual(r.status_code, 200, r.data)
