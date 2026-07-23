"""Equipo de confianza de punta a punta (9.1 fase 3), CON base de datos.

Es la integración que un mock esconde: la cookie de verdad, la fila de verdad,
la blacklist de verdad. El segundo factor (match_token) SÍ se simula —ya está
probado aparte y aquí estorbaría con sus ventanas de tiempo— pero todo lo que
toca la BD es real.

Corre con:  Manage.py test api --settings=config.settings_test
"""
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import (
    OutstandingToken, BlacklistedToken,
)

from api import confianza
from api.models import DispositivoConfianza

PASS = 'Secreta123.'
CONFIRMED = 'api.Serializers.devices_for_user'
MATCH = 'api.Serializers.match_token'


def _con_dispositivo():
    """Finge que el usuario tiene un TOTP confirmado, para que el MFA se active."""
    return patch(CONFIRMED, return_value=[object()])


class LoginConfianzaTests(TestCase):
    databases = {'default', 'standard'}

    def setUp(self):
        self.user = get_user_model().objects.create_user('juan', password=PASS)
        self.client = APIClient()
        self.url = reverse('login')

    def _post(self, **extra):
        return self.client.post(
            self.url, {'username': 'juan', 'password': PASS, **extra}, format='json'
        )

    # ── Sin dispositivo: nada cambia (ruta real, sin mocks) ─────────────────
    def test_sin_dispositivo_entra_y_no_emite_cookie(self):
        r = self._post()
        self.assertEqual(r.status_code, 200)
        self.assertIn('access', r.data)
        self.assertNotIn(confianza.COOKIE_CONFIANZA, r.cookies)

    # ── Con dispositivo ─────────────────────────────────────────────────────
    def test_con_dispositivo_sin_codigo_pide_codigo(self):
        with _con_dispositivo():
            r = self._post()
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.data['codigo'], 'mfa_requerida')

    def test_codigo_valido_sin_recordar_no_crea_confianza(self):
        with _con_dispositivo(), patch(MATCH, return_value=object()):
            r = self._post(otp_token='123456')
        self.assertEqual(r.status_code, 200)
        self.assertNotIn(confianza.COOKIE_CONFIANZA, r.cookies)
        self.assertFalse(DispositivoConfianza.objects.exists())

    def test_codigo_valido_con_recordar_crea_confianza_y_emite_cookie(self):
        with _con_dispositivo(), patch(MATCH, return_value=object()):
            r = self._post(otp_token='123456', recordar_equipo=True)
        self.assertEqual(r.status_code, 200)

        cookie = r.cookies.get(confianza.COOKIE_CONFIANZA)
        self.assertIsNotNone(cookie)
        self.assertTrue(cookie.value)
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['samesite'], 'Strict')
        self.assertEqual(cookie['path'], '/api/login/')

        disp = DispositivoConfianza.objects.get(usuario=self.user)
        # En la BD vive el HASH del token de la cookie, nunca el token.
        self.assertEqual(disp.token_hash, confianza.hash_token(cookie.value))
        self.assertNotEqual(disp.token_hash, cookie.value)
        self.assertTrue(disp.vigente)

    def test_cookie_valida_salta_el_codigo(self):
        raw = 'un-token-de-confianza'
        DispositivoConfianza.objects.create(
            usuario=self.user, token_hash=confianza.hash_token(raw), etiqueta='PC'
        )
        self.client.cookies[confianza.COOKIE_CONFIANZA] = raw

        no_debe_llamarse = MagicMock()
        with _con_dispositivo(), patch(MATCH, no_debe_llamarse):
            r = self._post()   # sin otp_token

        self.assertEqual(r.status_code, 200)
        self.assertIn('access', r.data)
        no_debe_llamarse.assert_not_called()

    def test_cookie_invalida_pide_codigo(self):
        # Una cookie que no corresponde a ningún dispositivo se ignora y se cae
        # al segundo factor de siempre, como si no hubiera cookie.
        self.client.cookies[confianza.COOKIE_CONFIANZA] = 'basura-que-no-existe'
        with _con_dispositivo(), patch(MATCH, return_value=object()):
            r = self._post()   # sin otp_token
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.data['codigo'], 'mfa_requerida')

    def test_cookie_de_dispositivo_revocado_no_sirve(self):
        raw = 'token-revocado'
        DispositivoConfianza.objects.create(
            usuario=self.user, token_hash=confianza.hash_token(raw),
            revocado_en=timezone.now(),
        )
        self.client.cookies[confianza.COOKIE_CONFIANZA] = raw
        with _con_dispositivo(), patch(MATCH, return_value=object()):
            r = self._post()   # sin otp_token
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.data['codigo'], 'mfa_requerida')


class RevocacionTests(TestCase):
    databases = {'default', 'standard'}

    def setUp(self):
        User = get_user_model()
        self.juan = User.objects.create_user('juan', password=PASS)
        self.ana = User.objects.create_user('ana', password=PASS)
        self.client = APIClient()
        self.client.force_authenticate(self.juan)

    def test_list_solo_los_propios_y_vigentes(self):
        DispositivoConfianza.objects.create(usuario=self.juan, token_hash='a', etiqueta='PC')
        DispositivoConfianza.objects.create(usuario=self.ana, token_hash='b', etiqueta='DeAna')
        DispositivoConfianza.objects.create(
            usuario=self.juan, token_hash='c', etiqueta='Viejo',
            expira_en=timezone.now() - timedelta(days=1),
        )
        r = self.client.get(reverse('dispositivos-confianza-list'))
        self.assertEqual(r.status_code, 200)
        etiquetas = [d['etiqueta'] for d in r.data]
        self.assertEqual(etiquetas, ['PC'])

    def test_revocar_marca_y_cierra_todas_las_sesiones(self):
        disp = DispositivoConfianza.objects.create(usuario=self.juan, token_hash='a')
        RefreshToken.for_user(self.juan)   # deja un OutstandingToken vivo
        self.assertTrue(OutstandingToken.objects.filter(user=self.juan).exists())

        url = reverse('dispositivos-confianza-revocar', kwargs={'pk': disp.pk})
        r = self.client.post(url)

        self.assertEqual(r.status_code, 204)
        disp.refresh_from_db()
        self.assertIsNotNone(disp.revocado_en)
        # El refresh del usuario quedó en la blacklist: el ladrón sale.
        self.assertTrue(BlacklistedToken.objects.filter(token__user=self.juan).exists())

    def test_no_puedo_revocar_el_de_otro_usuario(self):
        disp = DispositivoConfianza.objects.create(usuario=self.ana, token_hash='a')
        url = reverse('dispositivos-confianza-revocar', kwargs={'pk': disp.pk})
        r = self.client.post(url)
        self.assertEqual(r.status_code, 404)
        disp.refresh_from_db()
        self.assertIsNone(disp.revocado_en)   # intacto
