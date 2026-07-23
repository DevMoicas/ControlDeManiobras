"""Comprueba que la infraestructura de pruebas CON base de datos funciona.

Existe porque hasta el 2026-07-23 toda la suite era `SimpleTestCase` y eso dejó
pasar a producción un login que devolvía 500: `match_token` estaba simulado y un
mock no hace `select_for_update`. Este fichero es la prueba de que sí se puede
probar contra una base real, y falla en cuanto los ajustes de prueba dejen de
construirla.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from api.models import UnidadTercero


class InfraBDTests(TestCase):

    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo, y fuera de una petición get_db_alias() devuelve
    # 'standard'. Sin declararlo, Django corta la consulta por aislamiento.
    databases = {'default', 'standard'}

    def test_se_crea_la_tabla_de_un_modelo_managed(self):
        """Sin MIGRATION_MODULES, construir la BD de test falla en la 0019."""
        UnidadTercero.objects.create(placas="ABC-123", transportista="FRABA")
        self.assertEqual(
            UnidadTercero.objects.get(placas="ABC-123").transportista, "FRABA"
        )

    def test_las_apps_de_terceros_si_migran(self):
        """auth, django-otp y la blacklist del JWT sí aplican sus migraciones:
        solo se saltan las de `api`. Sin esto no habría dónde probar el MFA."""
        usuario = get_user_model().objects.create_user("prueba", password="x")
        self.assertTrue(usuario.pk)
