"""El orden de la tabla de Gastos: de la fecha de entrega mas nueva a la mas vieja.

Lo que se cubre es lo que decidiria mal en silencio: `fecha_entrega_mercancia`
NO es una fecha en la base —es varchar— y hoy convive en dos formatos, el ISO
que escribe el DatePicker y el 'DD/MM/YYYY' que quedo de cuando se tecleaba a
mano. Ordenar la columna tal cual es ordenar TEXTO: manda el dia, no el ano, y
los dos formatos se intercalan. El fallo no se ve: la tabla sale ordenada, solo
que mal.

Datos reales de la base de desarrollo (18 gastos, los dos formatos y basura
como '200' conviviendo).

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Gasto, Maniobra

URL = '/api/gastos/'


class OrdenDeGastosTests(TestCase):
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
        self.usuario = get_user_model().objects.create_user('orden_gastos', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def gasto(self, fecha, folio):
        maniobra = Maniobra.objects.create(solicita='PRUEBA', folio=folio)
        return Gasto.objects.create(maniobra=maniobra, fecha_entrega_mercancia=fecha)

    def fechas_en_pantalla(self):
        respuesta = self.cliente.get(URL, {'page_size': 60})
        self.assertEqual(respuesta.status_code, 200)
        datos = respuesta.data
        filas = datos['results'] if isinstance(datos, dict) else datos
        return [f['fecha_entrega_mercancia'] for f in filas]

    def test_de_la_mas_nueva_a_la_mas_vieja_con_los_dos_formatos_mezclados(self):
        # A proposito desordenadas al crearlas, y alternando formato.
        for fecha, folio in [('2026-06-28', 'F-1'), ('10/11/2026', 'F-2'),
                             ('2026-08-29', 'F-3'), ('21/06/2026', 'F-4'),
                             ('20/10/2026', 'F-5')]:
            self.gasto(fecha, folio)

        self.assertEqual(self.fechas_en_pantalla(), [
            '10/11/2026',   # noviembre
            '20/10/2026',   # octubre
            '2026-08-29',   # agosto
            '2026-06-28',   # junio 28
            '21/06/2026',   # junio 21 — despues del 28, aunque el texto diga "21"
        ])

    def test_lo_que_no_es_una_fecha_cae_al_final(self):
        # '' , NULL y basura tecleada: sin fecha no hay donde colocarlos, y
        # arriba estorbarian justo lo que se viene a mirar.
        self.gasto('', 'F-1')
        self.gasto(None, 'F-2')
        self.gasto('200', 'F-3')
        self.gasto('2026-05-13', 'F-4')

        self.assertEqual(self.fechas_en_pantalla()[0], '2026-05-13')
        self.assertEqual(sorted(x or '' for x in self.fechas_en_pantalla()[1:]), ['', '', '200'])

    def test_el_id_desempata_para_que_la_paginacion_no_repita_filas(self):
        # Dos gastos del mismo dia: sin desempate el orden es arbitrario entre
        # paginas y la paginacion de 60 en 60 puede repetir o saltarse filas.
        primero = self.gasto('20/10/2026', 'F-1')
        segundo = self.gasto('20/10/2026', 'F-2')
        respuesta = self.cliente.get(URL, {'page_size': 60})
        ids = [f['id'] for f in respuesta.data['results']]
        self.assertEqual(ids, [segundo.id, primero.id])
