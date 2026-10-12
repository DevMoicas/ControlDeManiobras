from django.test import SimpleTestCase

from .dashboards import clave_ruta, de_fraba


class DeFrabaTests(SimpleTestCase):
    def test_solo_quedan_los_del_catalogo_sin_distinguir_mayusculas(self):
        catalogo = [' Juan Pablo Estrada ', '06BF7E', None]
        self.assertEqual(de_fraba(['JUAN PABLO ESTRADA', 'ALBERTO SOMERA', '06bf7e', '19AT6G-38AV7C'], catalogo),
                         ['JUAN PABLO ESTRADA', '06bf7e'])


class ClaveRutaTests(SimpleTestCase):
    def test_misma_ruta_escrita_distinto_es_una(self):
        for ruta in ('MANZANILLO → APODACA / NL', 'Manzanillo → apodaca/ NL', ' MANZANILLO  → APODACA NL'):
            self.assertEqual(clave_ruta(ruta), 'MANZANILLO → APODACA NL')
        self.assertEqual(clave_ruta('MANZANILLO'), 'MANZANILLO')
        self.assertNotEqual(clave_ruta('MANZANILLO → MONTEREY'), clave_ruta('MANZANILLO → MONTERREY'))
