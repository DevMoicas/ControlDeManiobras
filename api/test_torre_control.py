"""Pruebas de la torre de control (el tablero de unidades ocupadas).

Lo que se cubre es lo que rompe en silencio:

  · "Una bolita por unidad" tiene que sostenerlo la base, no la interfaz. Si el
    UniqueConstraint deja de llegar al serializer, el segundo POST se convierte
    en un 500 con IntegrityError en vez de un 400 legible.
  · `indice` no puede salirse de lo que hoy ofrece BOLITAS_POR_UNIDAD: un cliente
    que mande un 2 antes de tiempo crearía una bolita que la interfaz no pinta y
    que deja la unidad ocupada sin que nadie la vea.
  · Mover una bolita es reescribir su fecha, NUNCA crear una segunda fila. Si un
    día el PATCH se convierte en POST, la unidad aparecería ocupada dos veces.
  · Liberar es borrar la fila, y entonces la unidad vuelve a estar libre.
  · El listado trae el `no_eco`, que es lo único que la bolita pinta.

⚠️ Lo que estas pruebas NO cubren: los GRANT y las políticas RLS de la migración
0046. `settings_test` se salta las migraciones de `api`, así que en la BD de test
no hay separación de roles (ver su docstring). Que el rol estándar pueda mover y
liberar bolitas se comprueba contra la base real con
`information_schema.role_table_grants`.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Tracto, TorreControl, BOLITAS_POR_UNIDAD

URL = '/api/torre-control/'


class BaseTorre(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # `tractos` es managed=False y settings_test no la crea (ver su
        # docstring). Mismo montaje que test_costos_extra.py.
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Tracto)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Tracto)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('torre_user', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)
        self.tracto = Tracto.objects.create(
            no_eco='NO. 01', unidad='Kenworth', anio=2020,
            placas='ABC1234', tipo='Tracto',
        )

    def ocupar(self, fecha='2026-08-21', indice=1, tracto=None):
        return self.cliente.post(
            URL,
            {'tracto': (tracto or self.tracto).id, 'indice': indice, 'fecha': fecha},
            format='json',
        )


class UnaBolitaPorUnidadTests(BaseTorre):

    def test_la_segunda_bolita_de_la_misma_unidad_se_rechaza_con_400(self):
        """El UniqueConstraint tiene que llegar al serializer como validación.

        Si no llega, esto sale 500 (IntegrityError) en vez de 400, y el frontend
        no puede distinguir "ya estaba ocupada" de "el servidor se cayó".
        """
        self.assertEqual(self.ocupar().status_code, 201)

        respuesta = self.ocupar(fecha='2026-08-22')
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(TorreControl.objects.count(), 1)

    def test_otra_unidad_si_puede_ocupar_el_mismo_dia(self):
        """La restricción es por unidad, no por día: en una casilla caben varias."""
        otro = Tracto.objects.create(
            no_eco='NO. 02', unidad='Freightliner', anio=2021,
            placas='XYZ9876', tipo='Tracto',
        )
        self.assertEqual(self.ocupar().status_code, 201)
        self.assertEqual(self.ocupar(tracto=otro).status_code, 201)
        self.assertEqual(TorreControl.objects.count(), 2)


class IndiceTests(BaseTorre):

    def test_un_indice_por_encima_del_permitido_se_rechaza(self):
        respuesta = self.ocupar(indice=BOLITAS_POR_UNIDAD + 1)
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(TorreControl.objects.count(), 0)

    def test_el_indice_cero_o_negativo_se_rechaza(self):
        # PositiveSmallIntegerField ya frena el negativo; el 0 lo frena la
        # validación, y el CHECK de la base está detrás de los dos.
        self.assertEqual(self.ocupar(indice=0).status_code, 400)
        self.assertEqual(TorreControl.objects.count(), 0)


class MoverYLiberarTests(BaseTorre):

    def test_mover_reescribe_la_fecha_y_no_crea_una_segunda_bolita(self):
        bolita = self.ocupar(fecha='2026-08-21').data['id']

        respuesta = self.cliente.patch(f'{URL}{bolita}/', {'fecha': '2026-09-03'},
                                       format='json')

        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(TorreControl.objects.count(), 1)
        self.assertEqual(str(TorreControl.objects.get(id=bolita).fecha), '2026-09-03')

    def test_liberar_borra_la_fila_y_la_unidad_vuelve_a_estar_libre(self):
        """Soltar en UNIDADES LIBRES es borrar: sin fila, la unidad está libre.

        Y tiene que poder volver a ocuparse — si el borrado dejara rastro, el
        UniqueConstraint impediría reutilizar la unidad para siempre.
        """
        bolita = self.ocupar().data['id']

        self.assertEqual(self.cliente.delete(f'{URL}{bolita}/').status_code, 204)
        self.assertEqual(TorreControl.objects.count(), 0)
        self.assertEqual(self.ocupar(fecha='2026-08-25').status_code, 201)


class ListadoTests(BaseTorre):

    def test_el_listado_trae_el_no_eco_de_cada_bolita(self):
        """Es lo único que la bolita pinta. Sin esto el frontend tendría que
        cruzar esta lista con la de tractos en cada render."""
        self.ocupar()

        lista = self.cliente.get(URL).data

        self.assertEqual(len(lista), 1)
        self.assertEqual(lista[0]['no_eco'], 'NO. 01')
        self.assertEqual(lista[0]['fecha'], '2026-08-21')

    def test_el_listado_no_pagina(self):
        """Con paginación, el tablero deduciría unidades libres que no lo están.
        Un dict con 'results' en vez de una lista delataría el cambio."""
        self.ocupar()
        self.assertIsInstance(self.cliente.get(URL).data, list)


class SinSesionTests(BaseTorre):

    def test_un_anonimo_no_ve_ni_toca_el_tablero(self):
        anonimo = APIClient()
        self.assertEqual(anonimo.get(URL).status_code, 401)
        self.assertEqual(
            anonimo.post(URL, {'tracto': self.tracto.id, 'indice': 1,
                               'fecha': '2026-08-21'}, format='json').status_code,
            401,
        )
