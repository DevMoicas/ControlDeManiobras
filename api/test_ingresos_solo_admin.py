"""INGRESOS del gasto (`facturado`): solo para staff.

La utilidad del viaje es el margen del negocio. Quitar las columnas de la tabla
no basta —cualquiera con la consola abierta lee la respuesta del endpoint—, asi
que el campo no sale del serializer para un usuario estandar.

Lo que se cubre es lo que fallaria en silencio:

  · Que el admin lo siga viendo (ocultarselo a todos seria igual de malo).
  · Que un PUT de un usuario estandar, que manda la fila ENTERA, no BORRE el
    importe por no traerlo: se perderia dinero capturado sin que nadie lo note.
  · Que `gastos_totales` siga saliendo para todos: ese si se ve.

Solo corre con:  Manage.py test api.test_ingresos_solo_admin --settings=config.settings_test
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Gasto, Maniobra

URL = '/api/gastos/'


class IngresosSoloAdminTests(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # `maniobras` y `gastos` son managed=False y settings_test no las crea.
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Maniobra)
            editor.create_model(Gasto)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Gasto)
            editor.delete_model(Maniobra)
        super().tearDownClass()

    def setUp(self):
        Usuario = get_user_model()
        self.admin = Usuario.objects.create_user('jefa', password='x', is_staff=True)
        self.estandar = Usuario.objects.create_user('capturista', password='x')
        maniobra = Maniobra.objects.create(solicita='P', folio='F-2279')
        self.gasto = Gasto.objects.create(
            maniobra=maniobra, facturado='50000', casetas_ida=Decimal('200.00'),
        )

    def como(self, usuario):
        cliente = APIClient()
        cliente.force_authenticate(user=usuario)
        return cliente

    def fila(self, usuario):
        respuesta = self.como(usuario).get(f'{URL}{self.gasto.id}/')
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        return respuesta.data

    def test_el_admin_ve_los_ingresos(self):
        self.assertEqual(self.fila(self.admin)['facturado'], '50000')

    def test_el_usuario_estandar_no_los_ve(self):
        self.assertNotIn('facturado', self.fila(self.estandar))

    def test_los_gastos_totales_los_ve_todo_el_mundo(self):
        # Es la columna que si se comparte: solo se ocultan Ingresos y la
        # Utilidad Bruta que se calcula a partir de ellos.
        for usuario in (self.admin, self.estandar):
            self.assertIn('gastos_totales', self.fila(usuario))

    def test_en_la_lista_tampoco_salen(self):
        respuesta = self.como(self.estandar).get(URL)
        filas = respuesta.data['results'] if isinstance(respuesta.data, dict) else respuesta.data
        self.assertNotIn('facturado', filas[0])

    def test_un_put_del_estandar_no_borra_el_importe(self):
        # La pagina guarda con PUT y manda la fila entera. Sin el campo, DRF lo
        # ignora y el importe se queda como estaba — nunca en blanco.
        fila = dict(self.fila(self.estandar), casetas_ida='300.00')
        respuesta = self.como(self.estandar).put(f'{URL}{self.gasto.id}/', fila, format='json')

        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.gasto.refresh_from_db()
        self.assertEqual(self.gasto.facturado, '50000')
        self.assertEqual(self.gasto.casetas_ida, Decimal('300.00'))

    def test_el_estandar_tampoco_puede_escribirlos_a_mano(self):
        # Aunque lo mande a proposito: el campo no existe para el.
        self.como(self.estandar).patch(
            f'{URL}{self.gasto.id}/', {'facturado': '999999'}, format='json')

        self.gasto.refresh_from_db()
        self.assertEqual(self.gasto.facturado, '50000')

    def test_el_admin_si_puede_cambiarlos(self):
        respuesta = self.como(self.admin).patch(
            f'{URL}{self.gasto.id}/', {'facturado': '60000'}, format='json')

        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.gasto.refresh_from_db()
        self.assertEqual(self.gasto.facturado, '60000')
