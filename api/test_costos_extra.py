"""Pruebas de Costos Extra (Finanzas) y de su enlace con Maniobras.

Lo que se cubre es lo que rompe en silencio y cuesta dinero:

  · La tarifa se CONGELA. Subir el precio del catálogo no puede reescribir lo
    que costó una maniobra ya guardada — es la decisión de negocio de esta
    función y no hay nada en el esquema que la haga cumplir sola.
  · Sincronizar la selección de verdad: añadir, quitar y vaciar del todo, sin
    que un PATCH que no menciona los costos los borre por su cuenta.
  · El borrado del catálogo es solo para admin.
  · El cliente no fija el precio: manda ids, no importes.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import CostoExtra, Maniobra, ManiobraCostoExtra


class BaseCostosExtra(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # `maniobras` es managed=False y settings_test no la crea (ver su
        # docstring). Mismo montaje que test_folios.py.
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Maniobra)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Maniobra)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('costos_user', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

        self.grua = CostoExtra.objects.create(movimiento='Grúa', costo=Decimal('500.00'))
        self.pension = CostoExtra.objects.create(movimiento='Pensión', costo=Decimal('250.00'))

    def crear_maniobra(self, ids=None):
        cuerpo = {'solicita': 'PRUEBA'}
        if ids is not None:
            cuerpo['costos_extra_ids'] = ids
        return self.cliente.post('/api/maniobras/', cuerpo, format='json')

    def ids_de(self, maniobra_id):
        return sorted(
            ManiobraCostoExtra.objects
            .filter(maniobra_id=maniobra_id)
            .values_list('costo_extra_id', flat=True)
        )


class CatalogoTests(BaseCostosExtra):

    def test_alta_y_listado(self):
        respuesta = self.cliente.post(
            '/api/costos-extra/', {'movimiento': 'Maniobra especial', 'costo': '1200.50'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(Decimal(respuesta.data['costo']), Decimal('1200.50'))

    def test_costo_negativo_rechazado(self):
        respuesta = self.cliente.post(
            '/api/costos-extra/', {'movimiento': 'Descuento', 'costo': '-1'}, format='json',
        )
        self.assertEqual(respuesta.status_code, 400)

    def test_borrar_solo_admin(self):
        respuesta = self.cliente.delete(f'/api/costos-extra/{self.grua.id}/')
        self.assertEqual(respuesta.status_code, 403)
        self.assertTrue(CostoExtra.objects.filter(id=self.grua.id).exists())

        admin = get_user_model().objects.create_user('costos_admin', password='x', is_staff=True)
        sesion_admin = APIClient()
        sesion_admin.force_authenticate(user=admin)
        self.assertEqual(sesion_admin.delete(f'/api/costos-extra/{self.grua.id}/').status_code, 204)


class SeleccionEnManiobraTests(BaseCostosExtra):

    def test_alta_con_varios_costos(self):
        respuesta = self.crear_maniobra([self.grua.id, self.pension.id])
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(self.ids_de(respuesta.data['id']),
                         sorted([self.grua.id, self.pension.id]))
        # La lectura devuelve el id del CATÁLOGO, que es lo que marca el desplegable.
        self.assertEqual(sorted(c['id'] for c in respuesta.data['costos_extra']),
                         sorted([self.grua.id, self.pension.id]))

    def test_sincronizar_anade_quita_y_vacia(self):
        maniobra_id = self.crear_maniobra([self.grua.id]).data['id']

        # Añadir uno
        self.cliente.patch(f'/api/maniobras/{maniobra_id}/',
                           {'costos_extra_ids': [self.grua.id, self.pension.id]}, format='json')
        self.assertEqual(self.ids_de(maniobra_id), sorted([self.grua.id, self.pension.id]))

        # Quitar uno
        self.cliente.patch(f'/api/maniobras/{maniobra_id}/',
                           {'costos_extra_ids': [self.pension.id]}, format='json')
        self.assertEqual(self.ids_de(maniobra_id), [self.pension.id])

        # Vaciar del todo: lista vacía sí borra
        self.cliente.patch(f'/api/maniobras/{maniobra_id}/',
                           {'costos_extra_ids': []}, format='json')
        self.assertEqual(self.ids_de(maniobra_id), [])

    def test_patch_sin_el_campo_no_toca_la_seleccion(self):
        """Un PATCH que no menciona los costos no puede borrarlos: la tabla de
        Maniobras manda campos sueltos todo el rato."""
        maniobra_id = self.crear_maniobra([self.grua.id]).data['id']
        self.cliente.patch(f'/api/maniobras/{maniobra_id}/', {'agencia': 'X'}, format='json')
        self.assertEqual(self.ids_de(maniobra_id), [self.grua.id])

    def test_id_inexistente_rechazado(self):
        respuesta = self.crear_maniobra([999999])
        self.assertEqual(respuesta.status_code, 400)

    def test_duplicados_en_la_peticion_no_duplican_filas(self):
        maniobra_id = self.crear_maniobra([self.grua.id, self.grua.id]).data['id']
        self.assertEqual(self.ids_de(maniobra_id), [self.grua.id])


class TarifaCongeladaTests(BaseCostosExtra):

    def test_subir_la_tarifa_no_reescribe_lo_ya_guardado(self):
        maniobra_id = self.crear_maniobra([self.grua.id]).data['id']

        self.grua.costo = Decimal('600.00')
        self.grua.save()

        enlace = ManiobraCostoExtra.objects.get(maniobra_id=maniobra_id)
        self.assertEqual(enlace.costo, Decimal('500.00'))

        # Y sigue congelada aunque se reguarde la maniobra con la misma selección.
        self.cliente.patch(f'/api/maniobras/{maniobra_id}/',
                           {'costos_extra_ids': [self.grua.id]}, format='json')
        self.assertEqual(ManiobraCostoExtra.objects.get(maniobra_id=maniobra_id).costo,
                         Decimal('500.00'))

    def test_una_seleccion_nueva_toma_la_tarifa_vigente(self):
        viejo_id = self.crear_maniobra([self.grua.id]).data['id']
        self.grua.costo = Decimal('600.00')
        self.grua.save()
        nuevo_id = self.crear_maniobra([self.grua.id]).data['id']

        self.assertEqual(ManiobraCostoExtra.objects.get(maniobra_id=viejo_id).costo,
                         Decimal('500.00'))
        self.assertEqual(ManiobraCostoExtra.objects.get(maniobra_id=nuevo_id).costo,
                         Decimal('600.00'))

    def test_el_cliente_no_puede_fijar_el_importe(self):
        """El contrato solo acepta ids. Un importe enviado a mano se ignora."""
        respuesta = self.cliente.post(
            '/api/maniobras/',
            {'solicita': 'PRUEBA',
             'costos_extra_ids': [self.grua.id],
             'costos_extra': [{'id': self.grua.id, 'movimiento': 'Grúa', 'costo': '1.00'}]},
            format='json',
        )
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(ManiobraCostoExtra.objects.get(maniobra_id=respuesta.data['id']).costo,
                         Decimal('500.00'))

    def test_borrar_del_catalogo_conserva_el_historico(self):
        maniobra_id = self.crear_maniobra([self.grua.id]).data['id']
        self.grua.delete()

        enlace = ManiobraCostoExtra.objects.get(maniobra_id=maniobra_id)
        self.assertIsNone(enlace.costo_extra_id)
        self.assertEqual(enlace.movimiento, 'Grúa')
        self.assertEqual(enlace.costo, Decimal('500.00'))
