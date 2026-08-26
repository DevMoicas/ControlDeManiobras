"""La casilla PENDIENTE DE PROGRAMAR del desglose de la pantalla de inicio.

Columna propia de `maniobras` y no un valor mas de `status`: marcarla no saca el
servicio de pendiente, solo anota que ya se reviso. Lo que se cubre aqui es
justamente eso —que marcar no toque el status ni nada mas— y que el valor viaje
por la API en los dos sentidos, que es lo que hace que el repaso sea compartido.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Gasto, Maniobra, Vacio

URL = '/api/maniobras/'


class PendienteProgramarTests(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Maniobra)
            editor.create_model(Gasto)
            editor.create_model(Vacio)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Vacio)
            editor.delete_model(Gasto)
            editor.delete_model(Maniobra)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('capturista', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def test_nace_sin_marcar(self):
        """Sin marcar y "no se sabe" son lo mismo aqui: por eso NOT NULL."""
        m = Maniobra.objects.create(solicita='PRUEBA')
        self.assertFalse(m.pendiente_programar)

    def test_se_marca_por_la_api(self):
        m = Maniobra.objects.create(solicita='PRUEBA')

        r = self.cliente.patch(f'{URL}{m.id}/', {'pendiente_programar': True}, format='json')

        self.assertEqual(r.status_code, 200, r.data)
        m.refresh_from_db()
        self.assertTrue(m.pendiente_programar)

    def test_se_desmarca(self):
        """Quitar el check despinta la fila: tiene que poder volver atras."""
        m = Maniobra.objects.create(solicita='PRUEBA', pendiente_programar=True)

        self.cliente.patch(f'{URL}{m.id}/', {'pendiente_programar': False}, format='json')

        m.refresh_from_db()
        self.assertFalse(m.pendiente_programar)

    def test_viaja_en_la_lista_para_que_lo_vean_todos(self):
        """Es lo que hace compartido el repaso: si no saliera en el GET, cada
        quien veria solo lo que marco en su sesion."""
        Maniobra.objects.create(solicita='PRUEBA', pendiente_programar=True)

        fila = self.cliente.get(URL).data['results'][0]

        self.assertTrue(fila['pendiente_programar'])

    def test_marcar_NO_cambia_el_status(self):
        """El servicio sigue pendiente en piso despues de marcarlo; la casilla
        solo anota que ya se reviso. Si tocara el status, el servicio saldria de
        la propia lista al marcarlo."""
        m = Maniobra.objects.create(solicita='PRUEBA', status='pendiente')

        self.cliente.patch(f'{URL}{m.id}/', {'pendiente_programar': True}, format='json')

        m.refresh_from_db()
        self.assertEqual(m.status, 'pendiente')

    def test_marcar_no_crea_gastos_ni_vacios(self):
        """La maniobra ya tiene folio, asi que los automatismos NO deben
        dispararse por una edicion que no lo toca."""
        m = Maniobra.objects.create(solicita='PRUEBA', folio='F-2279',
                                    contenedor='WHLU5591210')

        self.cliente.patch(f'{URL}{m.id}/', {'pendiente_programar': True}, format='json')

        self.assertEqual(Gasto.objects.count(), 0)
        self.assertEqual(Vacio.objects.count(), 0)

    def test_marcar_mueve_el_reloj_del_refresco(self):
        """Para que la casilla que marca una persona aparezca sola en la pantalla
        de las demas, sin recargar."""
        m = Maniobra.objects.create(solicita='PRUEBA')
        antes = self.cliente.get(f'{URL}cambios/').data

        self.cliente.patch(f'{URL}{m.id}/', {'pendiente_programar': True}, format='json')

        self.assertNotEqual(self.cliente.get(f'{URL}cambios/').data['t'], antes['t'])
