"""Pruebas del desglose de las celdas de dinero de Gastos (`Gasto.formulas`).

Cinco casetas se pagan de una en una pero la tabla tiene UNA columna: la celda
acepta la fórmula de Excel ("=150+230+430") y guarda el total. `formulas` guarda
aparte el texto tal cual para poder volver a enseñarlo al editar.

Lo que se cubre es lo que rompe en silencio:

  · `formulas` es un jsonb ABIERTO que llega del cliente. Sin validar, cualquiera
    con sesión podría usar la fila como almacén de texto arbitrario, o meter una
    fórmula en un campo de texto que no es de dinero.
  · El número que manda es SIEMPRE el de la columna: la fórmula no se recalcula
    en el servidor. Por eso aquí solo se valida forma, no aritmética.

No toca la base: la validación es una función pura del serializer.

Solo corre con:  Manage.py test api.test_formulas_gasto --settings=config.settings_test
"""
from django.test import SimpleTestCase
from rest_framework import serializers

from api.Serializers import GastoSerializer


class FormulasDelGasto(SimpleTestCase):
    def validar(self, valor):
        return GastoSerializer().validate_formulas(valor)

    def test_formula_de_casetas_pasa(self):
        valor = {'casetas_ida': '=150+230+430+320+320'}
        self.assertEqual(self.validar(valor), valor)

    def test_acepta_decimales_restas_y_espacios(self):
        valor = {
            'casetas_regreso': '=150.50+230',
            'gasto_diesel': '= 1200 - 150',
            'facturado': '=-50+20',
        }
        self.assertEqual(self.validar(valor), valor)

    def test_vacio_es_valido(self):
        self.assertEqual(self.validar({}), {})

    def test_campo_que_no_es_de_dinero_se_rechaza(self):
        # Una fórmula en `descripcion_gastos` convertiría la nota en un número.
        for campo in ('descripcion_gastos', 'unidad', 'gastos_totales', 'lo_que_sea'):
            with self.assertRaises(serializers.ValidationError, msg=campo):
                self.validar({campo: '=1+2'})

    def test_texto_libre_disfrazado_de_formula_se_rechaza(self):
        for formula in ('150+230', '=150*2', '=__import__("os")', '=1;DROP TABLE gastos', '=(1+2)'):
            with self.assertRaises(serializers.ValidationError, msg=formula):
                self.validar({'casetas_ida': formula})

    def test_valor_que_no_es_texto_se_rechaza(self):
        for formula in (150, None, ['=1+2'], {'a': 1}):
            with self.assertRaises(serializers.ValidationError, msg=repr(formula)):
                self.validar({'casetas_ida': formula})

    def test_formula_kilometrica_se_rechaza(self):
        # El tope evita que la fila se use como almacén de texto.
        with self.assertRaises(serializers.ValidationError):
            self.validar({'casetas_ida': '=1' + '+1' * 200})

    def test_lo_que_no_es_un_objeto_se_rechaza(self):
        for valor in ('=1+2', ['=1+2'], 7, None):
            with self.assertRaises(serializers.ValidationError, msg=repr(valor)):
                self.validar(valor)
