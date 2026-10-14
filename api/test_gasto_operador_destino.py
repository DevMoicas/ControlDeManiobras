"""Operador y destino del gasto salen de la maniobra del folio, y solo de lectura.

Sin BD (SimpleTestCase): las instancias se construyen en memoria, que es todo lo
que hace falta para comprobar de dónde lee el serializer y qué deja escribir.
"""
from django.test import SimpleTestCase

from api.models import Gasto, Maniobra
from api.Serializers import GastoSerializer


class GastoOperadorDestinoTests(SimpleTestCase):
    def test_lee_operador_y_destino_de_la_maniobra(self):
        maniobra = Maniobra(
            folio="F-2280",
            destino="Manzanillo",
            asignacion_operador_status="Juan Pérez",
        )
        datos = GastoSerializer(Gasto(maniobra=maniobra)).data
        self.assertEqual(datos["operador"], "Juan Pérez")
        self.assertEqual(datos["destino"], "Manzanillo")

    def test_maniobra_sin_operador_ni_destino_no_revienta(self):
        datos = GastoSerializer(Gasto(maniobra=Maniobra(folio="F-2281"))).data
        self.assertIsNone(datos["operador"])
        self.assertIsNone(datos["destino"])

    def test_son_de_solo_lectura(self):
        # Un PUT desde Gastos no puede reescribir el operador ni el destino de la
        # maniobra: se cambian en Maniobras. DRF descarta los campos read_only.
        campos = GastoSerializer().fields
        self.assertTrue(campos["operador"].read_only)
        self.assertTrue(campos["destino"].read_only)
        # `unidad` también desde el 2026-10-14: son las placas de la maniobra.
        self.assertTrue(campos["unidad"].read_only)

    def test_la_unidad_son_las_placas_de_la_maniobra(self):
        sencillo = GastoSerializer(Gasto(maniobra=Maniobra(unidad="ABC123"),
                                         unidad="texto viejo")).data
        self.assertEqual(sencillo["unidad"], "ABC123")
        full = GastoSerializer(Gasto(maniobra=Maniobra(unidad="ABC123", unidad_2="XYZ789"))).data
        self.assertEqual(full["unidad"], "ABC123 / XYZ789")
        self.assertEqual(GastoSerializer(Gasto(maniobra=Maniobra())).data["unidad"], "")
