"""Modelo DispositivoConfianza (9.1 fase 3).

CON base de datos: se prueba la ruta que decide si un equipo salta el MFA, que
es justo la clase de lógica que un SimpleTestCase con mocks dejaría pasar rota.

Corre con:  Manage.py test api --settings=config.settings_test

Lo que estas pruebas NO cubren: los GRANT y la RLS de la 0024. En la base de
test las migraciones de `api` se saltan y no existe django_standard_role, así
que los permisos se verifican solo contra la base real (ver settings_test.py).
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from api.models import DispositivoConfianza, DIAS_CONFIANZA


class DispositivoConfianzaTests(TestCase):

    # El router enruta por el alias del hilo (fuera de una petición, 'standard').
    databases = {'default', 'standard'}

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.juan = User.objects.create_user('juan', password='x')
        cls.ana = User.objects.create_user('ana', password='x')

    def _alta(self, usuario=None, token_hash='h', **extra):
        return DispositivoConfianza.objects.create(
            usuario=usuario or self.juan, token_hash=token_hash, **extra
        )

    def test_caducidad_por_defecto_son_14_dias_absolutos(self):
        d = self._alta()
        esperado = timezone.now() + timedelta(days=DIAS_CONFIANZA)
        # Margen amplio: solo comprobamos que la ventana es ~14 días, no el reloj.
        self.assertAlmostEqual(d.expira_en, esperado, delta=timedelta(minutes=1))

    def test_buscar_vigente_encuentra_el_dispositivo_correcto(self):
        self._alta(token_hash='abc')
        self.assertIsNotNone(DispositivoConfianza.buscar_vigente(self.juan, 'abc'))

    def test_no_sirve_el_de_otro_usuario(self):
        self._alta(usuario=self.ana, token_hash='abc')
        # Mismo hash, distinto dueño: no debe entrar. Es el caso del equipo
        # compartido — la confianza de Ana no vale para Juan.
        self.assertIsNone(DispositivoConfianza.buscar_vigente(self.juan, 'abc'))

    def test_no_sirve_uno_caducado(self):
        self._alta(token_hash='abc', expira_en=timezone.now() - timedelta(seconds=1))
        self.assertIsNone(DispositivoConfianza.buscar_vigente(self.juan, 'abc'))

    def test_no_sirve_uno_revocado(self):
        self._alta(token_hash='abc', revocado_en=timezone.now())
        self.assertIsNone(DispositivoConfianza.buscar_vigente(self.juan, 'abc'))

    def test_hash_vacio_o_nulo_no_entra(self):
        self._alta(token_hash='abc')
        for vacio in ('', None):
            self.assertIsNone(DispositivoConfianza.buscar_vigente(self.juan, vacio))

    def test_propiedad_vigente(self):
        self.assertTrue(self._alta(token_hash='v').vigente)
        self.assertFalse(self._alta(token_hash='r', revocado_en=timezone.now()).vigente)
        self.assertFalse(
            self._alta(token_hash='c', expira_en=timezone.now() - timedelta(seconds=1)).vigente
        )
