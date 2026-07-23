"""Helpers puros de api/confianza.py — sin BD."""
from django.test import SimpleTestCase

from api import confianza


class ConfianzaHelpersTests(SimpleTestCase):

    def test_hash_es_estable_y_de_64_hex(self):
        h = confianza.hash_token('abc')
        self.assertEqual(h, confianza.hash_token('abc'))
        self.assertEqual(len(h), 64)
        self.assertNotEqual(h, confianza.hash_token('abd'))

    def test_hash_de_none_o_vacio_no_revienta(self):
        self.assertEqual(len(confianza.hash_token(None)), 64)
        self.assertEqual(len(confianza.hash_token('')), 64)

    def test_generar_token_es_largo_y_distinto_cada_vez(self):
        a, b = confianza.generar_token(), confianza.generar_token()
        self.assertNotEqual(a, b)
        self.assertGreaterEqual(len(a), 32)

    def test_quiere_recordar_acepta_bool_y_string(self):
        for v in (True, 'true', 'True', '1', 'on', 'yes'):
            self.assertTrue(confianza.quiere_recordar(v), v)
        for v in (False, 'false', '0', '', None, 'no'):
            self.assertFalse(confianza.quiere_recordar(v), v)

    def test_ip_valida_filtra_lo_que_no_es_ip(self):
        self.assertEqual(confianza.ip_valida('127.0.0.1'), '127.0.0.1')
        self.assertEqual(confianza.ip_valida('::1'), '::1')
        # El log de seguridad usa '-' cuando no resuelve: no debe llegar al INSERT.
        self.assertIsNone(confianza.ip_valida('-'))
        self.assertIsNone(confianza.ip_valida(None))
        self.assertIsNone(confianza.ip_valida('no-una-ip'))

    def test_etiqueta_reconoce_navegador_y_so(self):
        chrome_win = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/151.0 Safari/537.36')
        self.assertEqual(confianza.etiqueta_desde_ua(chrome_win), 'Chrome en Windows')

        edge_win = chrome_win + ' Edg/151.0'
        # Edge trae "chrome" en su UA: el orden debe darle prioridad a Edge.
        self.assertEqual(confianza.etiqueta_desde_ua(edge_win), 'Edge en Windows')

        iphone = ('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) '
                  'AppleWebKit/605.1 (KHTML, like Gecko) Version/18.0 Mobile Safari/604.1')
        self.assertEqual(confianza.etiqueta_desde_ua(iphone), 'Safari en iPhone')

    def test_etiqueta_desconocida_cae_en_equipo(self):
        self.assertEqual(confianza.etiqueta_desde_ua(''), 'Equipo')
        self.assertEqual(confianza.etiqueta_desde_ua('bot-raro/1.0'), 'Equipo')
