"""Pruebas de la página PENDIENTES (los cinco tableros).

Lo que se cubre es lo que rompe en silencio:

  · Que nadie pueda borrar un pendiente, tampoco un admin. Es el requisito
    explícito de la función y aquí no lo sostiene un permiso, sino la ausencia
    de la ruta: si alguien convierte el ViewSet en ModelViewSet, esta prueba cae.
  · La caducidad a las 28 horas: que lo caducado desaparezca del listado, se
    borre de verdad y no se pueda editar por la puerta de atrás.
  · Que editar NO reinicie el reloj.
  · El orden de la lista: primero arriba, último abajo.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Pendiente, PENDIENTE_VIDA


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


class SinBorradoTests(BasePendientes):

    def test_nadie_puede_borrar_ni_el_admin(self):
        pid = self.crear().data['id']

        # 405: la ruta de borrado NO existe en el router, no es un permiso.
        self.assertEqual(self.cliente.delete(f'/api/pendientes/{pid}/').status_code, 405)

        admin = get_user_model().objects.create_user('pend_admin', password='x', is_staff=True)
        sesion_admin = APIClient()
        sesion_admin.force_authenticate(user=admin)
        self.assertEqual(sesion_admin.delete(f'/api/pendientes/{pid}/').status_code, 405)

        self.assertTrue(Pendiente.objects.filter(id=pid).exists())


class CaducidadTests(BasePendientes):

    def test_a_las_28_horas_desaparece_y_se_borra(self):
        vivo = self.crear('vivo').data['id']
        muerto = self.crear('muerto').data['id']
        self.envejecer(muerto, 29)

        lista = self.cliente.get('/api/pendientes/').data
        self.assertEqual([p['id'] for p in lista], [vivo])
        # El listado no solo lo oculta: lo barre de la tabla.
        self.assertFalse(Pendiente.objects.filter(id=muerto).exists())

    def test_justo_por_debajo_del_limite_sigue_vivo(self):
        pid = self.crear().data['id']
        self.envejecer(pid, 27)
        self.assertEqual([p['id'] for p in self.cliente.get('/api/pendientes/').data], [pid])
        self.assertTrue(Pendiente.objects.filter(id=pid).exists())

    def test_caducado_no_se_puede_editar_aunque_no_se_haya_barrido(self):
        pid = self.crear().data['id']
        self.envejecer(pid, 29)
        # Sin pasar por el listado (que es quien barre): el filtro del queryset
        # tiene que dejarlo fuera igualmente.
        self.assertEqual(
            self.cliente.patch(f'/api/pendientes/{pid}/', {'texto': 'zombi'},
                               format='json').status_code, 404)

    def test_editar_no_reinicia_el_reloj(self):
        pid = self.crear().data['id']
        self.envejecer(pid, 27)
        self.cliente.patch(f'/api/pendientes/{pid}/', {'texto': 'retocado'}, format='json')
        self.envejecer(pid, 29)   # dos horas más de las 27 anteriores
        self.assertEqual(self.cliente.get('/api/pendientes/').data, [])

    def test_expira_en_va_28_horas_despues_de_creado(self):
        """El front oculta lo caducado comparando con esta fecha: si el servidor
        la calcula mal, una pestaña abierta enseña pendientes muertos."""
        datos = self.crear().data
        creado = timezone.datetime.fromisoformat(datos['creado_en'].replace('Z', '+00:00'))
        expira = timezone.datetime.fromisoformat(datos['expira_en'].replace('Z', '+00:00'))
        self.assertEqual(expira - creado, PENDIENTE_VIDA)
        self.assertEqual(PENDIENTE_VIDA, timedelta(hours=28))
