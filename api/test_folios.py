"""Pruebas de la página FOLIOS.

Lo que se cubre es lo que puede romper en silencio: que cada lote sean 14
códigos contiguos reiniciando en F, que los contadores de Manzanillo y Lázaro
sean independientes, que el cliente no pueda falsear el código y que vaciar la
celda ASIGNACIÓN no reviente (el apiClient manda null, no "").

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Folio

LOTE_MZO = ['F-2279', 'R-2280', 'A-2281', 'B-2282', 'A-2283', 'C-2284', 'O-2285',
            'N-2286', 'T-2287', 'A-2288', 'I-2289', 'N-2290', 'E-2291', 'R-2292']


class FoliosTests(TestCase):

    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('folios_user', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def generar(self, tabla):
        return self.cliente.post('/api/folios/generar/', {'tabla': tabla}, format='json')

    # ── Generación de lotes ──────────────────────────────────────────────
    def test_el_primer_lote_de_manzanillo_arranca_en_2279(self):
        r = self.generar('manzanillo')
        self.assertEqual(r.status_code, 201)
        self.assertEqual([f['codigo'] for f in r.data], LOTE_MZO)

    def test_cada_lote_son_14_codigos_reiniciando_en_F(self):
        """El ciclo de letras se reinicia por lote, no es numero % 14: si se
        calculara con el módulo, el segundo lote no empezaría en F."""
        self.generar('manzanillo')
        r = self.generar('manzanillo')
        codigos = [f['codigo'] for f in r.data]
        self.assertEqual(len(codigos), 14)
        self.assertEqual(codigos[0], 'F-2293')
        self.assertEqual(codigos[-1], 'R-2306')

    def test_el_contador_nunca_retrocede_ni_repite(self):
        for _ in range(3):
            self.generar('manzanillo')
        numeros = list(Folio.objects.filter(tabla='manzanillo')
                       .order_by('numero').values_list('numero', flat=True))
        self.assertEqual(numeros, list(range(2279, 2279 + 42)))

    def test_lazaro_lleva_su_propio_contador(self):
        self.generar('manzanillo')
        r = self.generar('lazaro')
        self.assertEqual(r.data[0]['codigo'], 'F-LCR-323')
        self.assertEqual(r.data[-1]['codigo'], 'R-LCR-336')

    def test_tabla_invalida_es_400(self):
        self.assertEqual(self.generar('otra_cosa').status_code, 400)

    def test_generar_exige_autenticacion(self):
        self.assertIn(APIClient().post('/api/folios/generar/',
                                       {'tabla': 'manzanillo'}, format='json').status_code,
                      (401, 403))

    # ── Listado ──────────────────────────────────────────────────────────
    def test_el_listado_no_pagina_y_filtra_por_tabla(self):
        """Con PAGE_SIZE=60 global, a partir del quinto lote se perderían filas
        en silencio y el frontend no podría reconstruir las columnas."""
        for _ in range(5):
            self.generar('manzanillo')
        r = self.cliente.get('/api/folios/?tabla=manzanillo')
        self.assertIsInstance(r.data, list)
        self.assertEqual(len(r.data), 70)

    # ── Columna ASIGNACIÓN ───────────────────────────────────────────────
    def test_la_asignacion_se_edita_y_se_limita_a_40(self):
        folio_id = self.generar('manzanillo').data[0]['id']
        self.assertEqual(
            self.cliente.patch(f'/api/folios/{folio_id}/', {'asignacion': 'a' * 41},
                               format='json').status_code, 400)
        r = self.cliente.patch(f'/api/folios/{folio_id}/', {'asignacion': 'viaje 12'},
                               format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Folio.objects.get(pk=folio_id).asignacion, 'viaje 12')

    def test_vaciar_la_celda_manda_null_y_se_guarda_como_cadena_vacia(self):
        """sanitizarPayload() del apiClient convierte "" en null. Sin
        allow_null + la normalización, limpiar una celda daría 400."""
        folio_id = self.generar('manzanillo').data[0]['id']
        self.cliente.patch(f'/api/folios/{folio_id}/', {'asignacion': 'x'}, format='json')
        r = self.cliente.patch(f'/api/folios/{folio_id}/', {'asignacion': None}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Folio.objects.get(pk=folio_id).asignacion, '')

    # ── Columna FOLIO (editable a mano) ──────────────────────────────────
    def test_el_codigo_se_edita_a_mano(self):
        """A veces hay que añadirle al folio algo que no sale automático."""
        folio_id = self.generar('manzanillo').data[0]['id']
        r = self.cliente.patch(f'/api/folios/{folio_id}/',
                               {'codigo': 'F-2279 BIS'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Folio.objects.get(pk=folio_id).codigo, 'F-2279 BIS')

    def test_renombrar_un_folio_no_mueve_el_contador(self):
        """El siguiente lote sale de `numero`, no de `codigo`: renombrar no
        debe poder saltar ni repetir la secuencia."""
        folio_id = self.generar('manzanillo').data[0]['id']
        self.cliente.patch(f'/api/folios/{folio_id}/', {'codigo': 'ZZZ-9999'}, format='json')
        folio = Folio.objects.get(pk=folio_id)
        self.assertEqual((folio.numero, folio.tabla), (2279, 'manzanillo'))
        self.assertEqual(self.generar('manzanillo').data[0]['codigo'], 'F-2293')

    def test_un_codigo_duplicado_se_rechaza_con_mensaje_legible(self):
        """El apiClient solo lee la clave 'detail'; bajo cualquier otra el
        usuario vería un inútil "HTTP 400"."""
        lote = self.generar('manzanillo').data
        r = self.cliente.patch(f'/api/folios/{lote[1]["id"]}/',
                               {'codigo': 'F-2279'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('ya existe', str(r.data.get('detail', '')))
        self.assertEqual(Folio.objects.get(pk=lote[1]['id']).codigo, 'R-2280')

    def test_renombrar_un_folio_a_su_propio_codigo_no_choca_consigo_mismo(self):
        folio_id = self.generar('manzanillo').data[0]['id']
        r = self.cliente.patch(f'/api/folios/{folio_id}/', {'codigo': 'F-2279'}, format='json')
        self.assertEqual(r.status_code, 200)

    def test_el_codigo_no_puede_quedar_vacio(self):
        folio_id = self.generar('manzanillo').data[0]['id']
        for vacio in ('', '   ', None):
            r = self.cliente.patch(f'/api/folios/{folio_id}/', {'codigo': vacio}, format='json')
            self.assertEqual(r.status_code, 400, vacio)
            self.assertIn('vacío', str(r.data.get('detail', '')))
        self.assertEqual(Folio.objects.get(pk=folio_id).codigo, 'F-2279')

    def test_el_cliente_no_puede_falsear_tabla_ni_numero(self):
        folio_id = self.generar('manzanillo').data[0]['id']
        self.cliente.patch(f'/api/folios/{folio_id}/',
                           {'numero': 9, 'tabla': 'lazaro'}, format='json')
        folio = Folio.objects.get(pk=folio_id)
        self.assertEqual((folio.numero, folio.tabla), (2279, 'manzanillo'))

    # ── Borrado ──────────────────────────────────────────────────────────
    def test_solo_un_admin_puede_borrar(self):
        folio_id = self.generar('manzanillo').data[0]['id']
        self.assertEqual(self.cliente.delete(f'/api/folios/{folio_id}/').status_code, 403)

        self.usuario.is_staff = True
        self.usuario.save()
        self.assertEqual(self.cliente.delete(f'/api/folios/{folio_id}/').status_code, 204)
