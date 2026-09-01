"""El status CANCELADO: se guarda, se filtra y se combina como los demas.

Lo que puede romper en silencio son los CHOICES: un combo que falte se rechaza con
un 400 que en pantalla se ve como "no se pudo guardar", sin decir cual de los dos
status sobra. Y el orden canonico importa — "pendiente,cancelado" NO es un choice
valido, solo lo es al reves.

Cancelado comparte color con Quemada pero son status DISTINTOS: se filtran por
separado, y esa es la mitad que hay que fijar.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Maniobra, Vacio

URL = '/api/maniobras/'


class StatusCanceladoTests(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Maniobra)
            # `vacios` tambien: desde la 0061 la maniobra lee de ahi sus fechas y su
            # patio al serializarse, asi que sin esta tabla cualquier lectura revienta.
            editor.create_model(Vacio)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Vacio)
            editor.delete_model(Maniobra)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('capturista', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def poner_status(self, maniobra_id, status):
        return self.cliente.patch(f'{URL}{maniobra_id}/', {'status': status}, format='json')

    def test_se_puede_marcar_una_maniobra_como_cancelada(self):
        m = Maniobra.objects.create(solicita='PRUEBA')

        r = self.poner_status(m.id, 'cancelado')

        self.assertEqual(r.status_code, 200, r.data)
        m.refresh_from_db()
        self.assertEqual(m.status, 'cancelado')

    def test_el_filtro_devuelve_solo_las_canceladas(self):
        Maniobra.objects.create(solicita='A', status='cancelado')
        Maniobra.objects.create(solicita='B', status='quemada')
        Maniobra.objects.create(solicita='C', status='activo')

        r = self.cliente.get(URL, {'status': 'cancelado'})

        self.assertEqual([m['solicita'] for m in r.data['results']], ['A'])

    def test_cancelado_y_quemada_NO_se_mezclan_al_filtrar(self):
        """Comparten color, pero son status distintos: si el filtro de Quemados
        arrastrara los cancelados, la tabla mentiria sin que se note."""
        Maniobra.objects.create(solicita='CANCELADA', status='cancelado')
        Maniobra.objects.create(solicita='QUEMADA', status='quemada')

        quemados = self.cliente.get(URL, {'status': 'quemada'}).data['results']

        self.assertEqual([m['solicita'] for m in quemados], ['QUEMADA'])

    def test_el_filtro_encuentra_cancelado_dentro_de_un_combo(self):
        """El campo guarda hasta dos status: un filtro exacto dejaria fuera esta."""
        Maniobra.objects.create(solicita='A', status='activo,cancelado')

        r = self.cliente.get(URL, {'status': 'cancelado'})

        self.assertEqual(len(r.data['results']), 1)

    def test_los_combos_con_cancelado_son_choices_validos(self):
        """Sin el choice, guardar devuelve un 400 que en pantalla solo se ve como
        "no se pudo guardar", sin decir cual de los dos status sobra."""
        for combo in ('por_salir,cancelado', 'activo,cancelado',
                      'quemada,cancelado', 'cancelado,pendiente'):
            with self.subTest(combo=combo):
                m = Maniobra.objects.create(solicita='PRUEBA')
                r = self.poner_status(m.id, combo)
                self.assertEqual(r.status_code, 200, r.data)

    def test_un_combo_en_orden_no_canonico_se_rechaza(self):
        """Es lo que hace que el primer segmento sea SIEMPRE el color que gana en
        la fila, sin escribir ni una linea de validacion."""
        m = Maniobra.objects.create(solicita='PRUEBA')

        r = self.poner_status(m.id, 'pendiente,cancelado')

        self.assertEqual(r.status_code, 400, r.data)

    def test_el_combo_mas_largo_cabe_en_la_columna(self):
        """max_length=20. 'por_salir,cancelado' y 'cancelado,pendiente' miden 19:
        si algun dia se anade un status de nombre mas largo, esto lo avisa."""
        for combo in ('por_salir,cancelado', 'cancelado,pendiente'):
            self.assertLessEqual(len(combo), 20)

    def test_cancelado_no_entra_en_el_resumen_del_panel(self):
        """El panel de inicio resume ACTIVOS y PENDIENTES; cancelado no es
        ninguno de los dos y no debe inflar esos numeros."""
        Maniobra.objects.create(solicita='A', status='cancelado')

        resumen = self.cliente.get(f'{URL}resumen-status/').data

        self.assertEqual(resumen['activo'], 0)
        self.assertEqual(resumen['pendiente'], 0)
