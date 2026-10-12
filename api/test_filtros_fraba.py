from django.test import SimpleTestCase

from .dashboards import de_fraba


class DeFrabaTests(SimpleTestCase):
    def test_solo_quedan_los_del_catalogo_sin_distinguir_mayusculas(self):
        catalogo = [' Juan Pablo Estrada ', '06BF7E', None]
        self.assertEqual(de_fraba(['JUAN PABLO ESTRADA', 'ALBERTO SOMERA', '06bf7e', '19AT6G-38AV7C'], catalogo),
                         ['JUAN PABLO ESTRADA', '06bf7e'])
