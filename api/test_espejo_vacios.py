"""Las tres celdas que la tabla de Maniobras lee de Vacios.

Fecha Maniobra V, Fecha entrega V y Vacio Patio NO se guardan en `maniobras`:
se leen de los vacios enlazados por maniobra_id (migracion 0061) cada vez que se
sirve la maniobra. Lo que se cubre aqui es lo unico que puede fallar en silencio:

  · que se enseñe el vacio EQUIVOCADO — de ahi el enlace por maniobra_id y no
    por contenedor, que es lo que se hacia antes y no distingue el viaje de hoy
    del de hace meses;
  · que un Full repartido pierda uno de sus dos vacios por el camino;
  · que alguien pueda ESCRIBIRLAS desde Maniobras, que es exactamente el desfase
    por captura manual que estas columnas vienen a quitar.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Gasto, Maniobra, Vacio

URL = '/api/maniobras/'


class BaseEspejo(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # Gasto entra porque el mismo PATCH que da de alta los vacios dispara su
        # automatismo.
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

    def maniobra(self, **campos):
        campos.setdefault('solicita', 'PRUEBA')
        campos.setdefault('tipo_servicio', 'sencillo')
        campos.setdefault('contenedor', 'WHLU5591210')
        campos.setdefault('asignacion_operador_status', 'JUAN PEREZ LOPEZ')
        return Maniobra.objects.create(**campos)

    def leer(self, maniobra):
        r = self.cliente.get(f'{URL}{maniobra.id}/')
        self.assertEqual(r.status_code, 200, r.data)
        return r.data


class EspejoTests(BaseEspejo):

    def test_las_fechas_y_el_patio_salen_del_vacio_enlazado(self):
        m = self.maniobra()
        Vacio.objects.create(
            maniobra=m, contenedor='WHLU5591210', status='pendiente',
            fecha_maniobra=date(2026, 9, 12), fecha_entrega=date(2026, 9, 15),
            patio='APM TERMINAL LZC',
        )
        datos = self.leer(m)
        self.assertEqual(datos['fecha_maniobra_v'], '12/09/2026')
        self.assertEqual(datos['fecha_entrega_v'], '15/09/2026')
        self.assertEqual(datos['patio_v'], 'APM TERMINAL LZC')

    def test_el_vacio_de_otra_maniobra_no_se_cuela_aunque_repita_contenedor(self):
        # El caso que rompia el enlace por contenedor: el mismo numero vuelve a
        # pasar meses despues y su vacio no tiene nada que ver con este viaje.
        vieja = self.maniobra()
        Vacio.objects.create(maniobra=vieja, contenedor='WHLU5591210',
                             fecha_maniobra=date(2026, 3, 1), patio='VIEJO')
        nueva = self.maniobra()
        datos = self.leer(nueva)
        self.assertEqual(datos['fecha_maniobra_v'], '')
        self.assertEqual(datos['patio_v'], '')

    def test_un_full_repartido_enseña_los_dos_vacios_en_orden(self):
        m = self.maniobra(tipo_servicio='full', contenedor_2='WHSU6575360')
        Vacio.objects.create(maniobra=m, contenedor='WHLU5591210',
                             fecha_entrega=date(2026, 9, 15), patio='PATIO 1')
        Vacio.objects.create(maniobra=m, contenedor='WHSU6575360',
                             fecha_entrega=date(2026, 9, 16), patio='PATIO 2')
        datos = self.leer(m)
        self.assertEqual(datos['fecha_entrega_v'], '15/09/2026 - 16/09/2026')
        self.assertEqual(datos['patio_v'], 'PATIO 1 - PATIO 2')

    def test_el_hueco_del_vacio_sin_fecha_se_conserva(self):
        # En un Full la POSICION dice de que operador es cada valor: saltarse el
        # primero moveria el segundo a su sitio y se leeria del operador que no es.
        m = self.maniobra(tipo_servicio='full', contenedor_2='WHSU6575360')
        Vacio.objects.create(maniobra=m, contenedor='WHLU5591210')
        Vacio.objects.create(maniobra=m, contenedor='WHSU6575360',
                             fecha_entrega=date(2026, 9, 16))
        self.assertEqual(self.leer(m)['fecha_entrega_v'], ' - 16/09/2026')

    def test_sin_ningun_dato_la_celda_sale_vacia_y_no_con_un_guion(self):
        m = self.maniobra(tipo_servicio='full', contenedor_2='WHSU6575360')
        Vacio.objects.create(maniobra=m, contenedor='WHLU5591210')
        Vacio.objects.create(maniobra=m, contenedor='WHSU6575360')
        self.assertEqual(self.leer(m)['fecha_entrega_v'], '')

    def test_sin_vacio_el_patio_cae_al_que_se_tecleo_en_su_dia(self):
        # Las maniobras anteriores a la 0061 no tienen vacio al que mirar: si no
        # se respetara su `vacio_patio`, perderian en pantalla un dato que hoy
        # se ve.
        m = self.maniobra(vacio_patio='PATIO A MANO')
        self.assertEqual(self.leer(m)['patio_v'], 'PATIO A MANO')

    def test_en_cuanto_hay_vacio_manda_el_vacio(self):
        m = self.maniobra(vacio_patio='PATIO A MANO')
        Vacio.objects.create(maniobra=m, contenedor='WHLU5591210', patio='PATIO DEL VACIO')
        self.assertEqual(self.leer(m)['patio_v'], 'PATIO DEL VACIO')


class SoloLecturaTests(BaseEspejo):

    def test_no_se_pueden_escribir_desde_maniobras(self):
        m = self.maniobra()
        Vacio.objects.create(maniobra=m, contenedor='WHLU5591210',
                             fecha_entrega=date(2026, 9, 15), patio='EL DEL VACIO')
        r = self.cliente.patch(f'{URL}{m.id}/', {
            'fecha_entrega_v': '01/01/2000',
            'patio_v': 'INVENTADO',
        }, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        # El PATCH no las toca: siguen diciendo lo que dice el vacio.
        self.assertEqual(r.data['fecha_entrega_v'], '15/09/2026')
        self.assertEqual(r.data['patio_v'], 'EL DEL VACIO')


class EnlaceAutomaticoTests(BaseEspejo):

    def test_al_asignar_el_folio_el_vacio_nace_ya_enlazado(self):
        # Sin esto no habria espejo que valga: el enlace es lo que permite saber
        # de que maniobra es cada vacio sin adivinarlo por el contenedor.
        m = self.maniobra()
        r = self.cliente.patch(f'{URL}{m.id}/', {'folio': 'F-2279'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        vacio = Vacio.objects.get(contenedor='WHLU5591210')
        self.assertEqual(vacio.maniobra_id, m.id)

    def test_un_full_repartido_enlaza_sus_dos_vacios_a_la_misma_maniobra(self):
        m = self.maniobra(tipo_servicio='full', contenedor_2='WHSU6575360',
                          operador_2='PEDRO GOMEZ RUIZ')
        r = self.cliente.patch(f'{URL}{m.id}/', {'folio': 'F-2279'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(Vacio.objects.filter(maniobra=m).count(), 2)
