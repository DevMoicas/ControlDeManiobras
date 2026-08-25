"""Pruebas de la página PENDIENTES (los cinco tableros).

Lo que se cubre es lo que rompe en silencio:

  · Que un usuario ESTÁNDAR pueda borrar. No basta con que el ViewSet monte la
    ruta: el rol de Postgres con el que corre necesita DELETE sobre la tabla
    (grant de la 0040), y sin él fallaría solo en producción y solo para quien
    no es admin.
  · Que borrar uno no se lleve a los demás por delante.
  · Que ya NO caduquen: un pendiente viejo sigue en la lista y se puede editar.
    Antes se borraban solos a las 28 horas (cambiado el 2026-08-25).
  · El orden de la lista: primero arriba, último abajo.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Pendiente


class BasePendientes(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('pend_user', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def crear(self, texto='pendiente', tablero='ali'):
        return self.cliente.post('/api/pendientes/', {'tablero': tablero, 'texto': texto},
                                 format='json')

    def envejecer(self, pendiente, horas):
        """Retrasa creado_en. auto_now_add ignora lo que se le pase al crear, así
        que la única forma de simular el paso del tiempo es un UPDATE directo."""
        Pendiente.objects.filter(id=pendiente).update(
            creado_en=timezone.now() - timedelta(hours=horas)
        )


class AltaYEdicionTests(BasePendientes):

    def test_alta_y_orden_de_creacion(self):
        for texto in ('primero', 'segundo', 'tercero'):
            self.assertEqual(self.crear(texto).status_code, 201)

        lista = self.cliente.get('/api/pendientes/').data
        self.assertEqual([p['texto'] for p in lista], ['primero', 'segundo', 'tercero'])

    def test_tablero_invalido_rechazado(self):
        self.assertEqual(self.crear('x', tablero='pedro').status_code, 400)

    def test_marcar_hecho(self):
        pid = self.crear().data['id']
        respuesta = self.cliente.patch(f'/api/pendientes/{pid}/', {'hecho': True}, format='json')
        self.assertEqual(respuesta.status_code, 200)
        self.assertTrue(Pendiente.objects.get(id=pid).hecho)

    def test_marcar_con_booleano_en_texto(self):
        """sanitizarPayload() del apiClient convierte TODO a cadena, así que por
        el cable llega hecho="true", no true. Si algún día deja de aceptarse, la
        casilla se rompería solo en el navegador y no en las pruebas."""
        pid = self.crear().data['id']
        self.assertEqual(
            self.cliente.patch(f'/api/pendientes/{pid}/', {'hecho': 'true'},
                               format='json').status_code, 200)
        self.assertTrue(Pendiente.objects.get(id=pid).hecho)

        self.cliente.patch(f'/api/pendientes/{pid}/', {'hecho': 'false'}, format='json')
        self.assertFalse(Pendiente.objects.get(id=pid).hecho)

    def test_editar_texto(self):
        pid = self.crear('viejo').data['id']
        self.cliente.patch(f'/api/pendientes/{pid}/', {'texto': 'nuevo'}, format='json')
        self.assertEqual(Pendiente.objects.get(id=pid).texto, 'nuevo')

    def test_los_tableros_son_compartidos(self):
        """Otro usuario ve y edita lo mismo: no hay dueño."""
        pid = self.crear('de todos').data['id']
        otro = APIClient()
        otro.force_authenticate(user=get_user_model().objects.create_user('otro', password='x'))
        self.assertEqual([p['id'] for p in otro.get('/api/pendientes/').data], [pid])
        self.assertEqual(otro.patch(f'/api/pendientes/{pid}/', {'hecho': True},
                                    format='json').status_code, 200)


class BorradoTests(BasePendientes):
    """Se borran a mano. Antes no se podía borrar en absoluto."""

    def test_un_usuario_estandar_puede_borrar(self):
        """El caso que se romperia solo en produccion: la ruta existe, pero el
        rol de Postgres del usuario estandar tiene que tener DELETE sobre la
        tabla (grant de la 0040). Con un admin no se notaria."""
        pid = self.crear().data['id']

        respuesta = self.cliente.delete('/api/pendientes/%s/' % pid)

        self.assertEqual(respuesta.status_code, 204)
        self.assertFalse(Pendiente.objects.filter(id=pid).exists())

    def test_borrar_uno_no_toca_a_los_demas(self):
        sobrevive = self.crear('sobrevive').data['id']
        condenado = self.crear('condenado').data['id']

        self.cliente.delete('/api/pendientes/%s/' % condenado)

        self.assertEqual([p['id'] for p in self.cliente.get('/api/pendientes/').data],
                         [sobrevive])

    def test_borrar_uno_que_ya_no_existe_responde_404(self):
        """Dos personas mirando el mismo tablero: la segunda no debe ver un 500."""
        pid = self.crear().data['id']
        self.cliente.delete('/api/pendientes/%s/' % pid)

        self.assertEqual(self.cliente.delete('/api/pendientes/%s/' % pid).status_code, 404)


class NoCaducanTests(BasePendientes):
    """Ya no se van solos: se quedan hasta que alguien los borra."""

    def test_un_pendiente_viejo_sigue_en_la_lista(self):
        pid = self.crear('de anteayer').data['id']
        self.envejecer(pid, 100)

        self.assertEqual([p['id'] for p in self.cliente.get('/api/pendientes/').data], [pid])
        self.assertTrue(Pendiente.objects.filter(id=pid).exists())

    def test_un_pendiente_viejo_se_puede_seguir_editando(self):
        """Antes el queryset lo dejaba fuera y devolvia 404."""
        pid = self.crear().data['id']
        self.envejecer(pid, 100)

        respuesta = self.cliente.patch('/api/pendientes/%s/' % pid,
                                       {'texto': 'retocado'}, format='json')

        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(Pendiente.objects.get(id=pid).texto, 'retocado')

    def test_listar_ya_no_barre_nada(self):
        """El listado borraba lo caducado de la tabla. Ahora solo lee."""
        pid = self.crear().data['id']
        self.envejecer(pid, 100)

        self.cliente.get('/api/pendientes/')

        self.assertTrue(Pendiente.objects.filter(id=pid).exists())
