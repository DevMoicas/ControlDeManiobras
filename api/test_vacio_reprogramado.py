"""Pruebas de la reprogramación de vacíos.

Lo que se cubre es exactamente el requisito que motivó el diseño: `reprogramado`
es un estado INDEPENDIENTE de Pendiente/Entregado y no puede pisarlos. Si algún
día alguien lo convierte en un valor más de `status`, estas pruebas caen.

También el formato del cable: sanitizarPayload() del apiClient convierte todo a
cadena, así que por HTTP llega reprogramado="true", no true. Un cambio ahí se
rompería solo en el navegador y no en las pruebas.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Vacio


class BaseReprogramado(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # `vacios` es managed=False y settings_test no la crea (ver su docstring).
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Vacio)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Vacio)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('vacio_user', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def crear(self, **campos):
        cuerpo = {'contenedor': 'TEST0000000'}
        cuerpo.update(campos)
        return self.cliente.post('/api/vacios/', cuerpo, format='json')


class IndependenciaDelStatusTests(BaseReprogramado):

    def test_reprogramar_no_toca_el_status(self):
        """El requisito, literal: marcar Sí no puede pisar Entregado."""
        vid = self.crear(status='entregado').data['id']

        self.cliente.patch(f'/api/vacios/{vid}/', {'reprogramado': True}, format='json')
        v = Vacio.objects.get(id=vid)
        self.assertTrue(v.reprogramado)
        self.assertEqual(v.status, 'entregado')

    def test_desmarcar_deja_el_status_intacto(self):
        vid = self.crear(status='entregado').data['id']
        self.cliente.patch(f'/api/vacios/{vid}/', {'reprogramado': True}, format='json')
        self.cliente.patch(f'/api/vacios/{vid}/', {'reprogramado': False}, format='json')

        v = Vacio.objects.get(id=vid)
        self.assertFalse(v.reprogramado)
        self.assertEqual(v.status, 'entregado')

    def test_cambiar_el_status_no_desreprograma(self):
        """La independencia va en los dos sentidos."""
        vid = self.crear(status='pendiente', reprogramado=True).data['id']
        self.cliente.patch(f'/api/vacios/{vid}/', {'status': 'entregado'}, format='json')

        v = Vacio.objects.get(id=vid)
        self.assertEqual(v.status, 'entregado')
        self.assertTrue(v.reprogramado)

    def test_por_defecto_no_esta_reprogramado(self):
        vid = self.crear().data['id']
        self.assertFalse(Vacio.objects.get(id=vid).reprogramado)


class FiltroTests(BaseReprogramado):

    def test_filtro_reprogramados_cruza_los_dos_estados(self):
        """La vista REPROGRAMADOS trae los reprogramados sean pendientes o
        entregados: es justo lo que un filtro por ?status no podría hacer."""
        pend_repro = self.crear(contenedor='A', status='pendiente', reprogramado=True).data['id']
        entr_repro = self.crear(contenedor='B', status='entregado', reprogramado=True).data['id']
        self.crear(contenedor='C', status='pendiente')
        self.crear(contenedor='D', status='entregado')

        datos = self.cliente.get('/api/vacios/?reprogramado=true').data
        ids = sorted(v['id'] for v in datos['results'])
        self.assertEqual(ids, sorted([pend_repro, entr_repro]))

    def test_los_filtros_de_siempre_siguen_igual(self):
        """Reprogramar no puede sacar un vacío de la vista Pendientes."""
        vid = self.crear(status='pendiente', reprogramado=True).data['id']
        datos = self.cliente.get('/api/vacios/?status=pendiente').data
        self.assertIn(vid, [v['id'] for v in datos['results']])


class FormatoDelCableTests(BaseReprogramado):

    def test_booleano_como_cadena(self):
        """sanitizarPayload() manda reprogramado="true", no true."""
        vid = self.crear().data['id']

        self.assertEqual(
            self.cliente.patch(f'/api/vacios/{vid}/', {'reprogramado': 'true'},
                               format='json').status_code, 200)
        self.assertTrue(Vacio.objects.get(id=vid).reprogramado)

        self.cliente.patch(f'/api/vacios/{vid}/', {'reprogramado': 'false'}, format='json')
        self.assertFalse(Vacio.objects.get(id=vid).reprogramado)

    def test_fecha_vacia_llega_como_null(self):
        """El apiClient convierte "" en null antes de mandarlo."""
        vid = self.crear().data['id']
        respuesta = self.cliente.patch(f'/api/vacios/{vid}/',
                                       {'fecha_reprogramacion': None}, format='json')
        self.assertEqual(respuesta.status_code, 200)
        self.assertIsNone(Vacio.objects.get(id=vid).fecha_reprogramacion)

    def test_la_fecha_sobrevive_a_desmarcar(self):
        """Desmarcar oculta el campo en la UI pero no borra lo que escribió una
        persona; si vuelve a marcarse, la fecha sigue ahí."""
        vid = self.crear(reprogramado=True, fecha_reprogramacion='2026-09-15').data['id']
        self.cliente.patch(f'/api/vacios/{vid}/', {'reprogramado': False}, format='json')
        self.assertEqual(str(Vacio.objects.get(id=vid).fecha_reprogramacion), '2026-09-15')
