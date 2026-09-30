"""Clientes principales (Fase 2 de docs/planes/PLAN_MODULO_FINANZAS.md, rama main).

Lo que fallaría en silencio: que borrar un principal se lleve sus direcciones
por delante, o que la tabla de Direcciones no sepa pintar a quién pertenecen.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Cliente, ClientePrincipal


class ClientesPrincipalesTests(TestCase):
    databases = {'default', 'standard'}

    def cliente_api(self, staff=False):
        u = get_user_model().objects.create_user('admin' if staff else 'cap', password='x',
                                                 is_staff=staff)
        c = APIClient()
        c.force_authenticate(user=u)
        return c

    def test_asignar_y_quitar_el_principal_de_una_direccion(self):
        cap = self.cliente_api()
        r = cap.post('/api/clientes-principales/', {'nombre': 'REAL SHIPPING', 'dias_credito': 30},
                     format='json')
        self.assertEqual(r.status_code, 201, r.data)
        d = Cliente.objects.create(nombre_cliente='REAL SHIPPING MANZANILLO')

        cap.patch(f'/api/clientes/{d.id}/', {'cliente_principal': r.data['id']}, format='json')
        fila = cap.get(f'/api/clientes/{d.id}/').data
        self.assertEqual(fila['cliente_principal_nombre'], 'REAL SHIPPING')

        cap.patch(f'/api/clientes/{d.id}/', {'cliente_principal': None}, format='json')
        self.assertIsNone(Cliente.objects.get(pk=d.id).cliente_principal_id)

    def test_borrar_es_solo_staff_y_no_se_lleva_las_direcciones(self):
        p = ClientePrincipal.objects.create(nombre='HERRAMENTAL')
        d = Cliente.objects.create(nombre_cliente='HERRAMENTAL GDL', cliente_principal=p)

        self.assertEqual(self.cliente_api().delete(f'/api/clientes-principales/{p.id}/').status_code, 403)
        self.assertEqual(self.cliente_api(staff=True).delete(f'/api/clientes-principales/{p.id}/').status_code, 204)

        d.refresh_from_db()
        self.assertIsNone(d.cliente_principal_id)

    def test_los_dias_de_credito_son_opcionales(self):
        cap = self.cliente_api()
        for cuerpo in ({'nombre': 'SIN CREDITO A'}, {'nombre': 'SIN CREDITO B', 'dias_credito': None}):
            r = cap.post('/api/clientes-principales/', cuerpo, format='json')
            self.assertEqual(r.status_code, 201, r.data)
            self.assertEqual(r.data['dias_credito'], 0)

    def test_el_nombre_no_se_repite(self):
        ClientePrincipal.objects.create(nombre='REAL SHIPPING')
        r = self.cliente_api().post('/api/clientes-principales/', {'nombre': 'REAL SHIPPING'}, format='json')
        self.assertEqual(r.status_code, 400)
