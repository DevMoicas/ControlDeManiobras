"""El parseo del peso que va a los documentos — sin BD.

El caso que motivó las pruebas: un peso capturado como "1,332" hacía que el
documento imprimiera la celda del peso EN BLANCO, sin error. Sin separador de
millares sí salía.
"""
from django.test import SimpleTestCase

from api.views import _sumar_peso


class SumarPesoTests(SimpleTestCase):

    def test_separadores_de_millares(self):
        for crudo in ('1,332', "1'332", '1332'):
            self.assertEqual(_sumar_peso(crudo), 1332.0, crudo)

    def test_dos_pesos_con_millares_se_suman(self):
        self.assertEqual(_sumar_peso('8,376 / 12,117'), 20493.0)
        self.assertEqual(_sumar_peso('23,412 - 22,000'), 45412.0)

    def test_lo_que_ya_funcionaba_sigue_igual(self):
        self.assertEqual(_sumar_peso('8376/12117'), 20493.0)
        self.assertEqual(_sumar_peso('23412 - 22000'), 45412.0)
        self.assertEqual(_sumar_peso('1332.5'), 1332.5)

    def test_sin_nada_numerico_deja_la_celda_en_blanco(self):
        for crudo in ('', None, 'SIN PESO', '-'):
            self.assertEqual(_sumar_peso(crudo), '', repr(crudo))
