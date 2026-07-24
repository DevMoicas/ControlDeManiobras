"""Regresión del incidente del `drift` (2026-07-23).

django-otp reaprende y persiste el `drift` (desfase móvil↔servidor) en cada
verificación correcta. Con el reloj de un contenedor torcido, ese drift heredado
descentra la ventana y bloquea a TODOS tras el siguiente redeploy. El arreglo fue
`OTP_TOTP_SYNC = False` (config/settings.py): el drift ya no se guarda.

La suite de MFA (test_mfa_login / test_confianza) MOCKEA match_token, así que nada
cubría esto. Aquí se usa un TOTPDevice real y verify_token real.

Corre con BD:  Manage.py test api.test_otp_drift --settings=config.settings_test
"""
import time

from django.contrib.auth.models import User
from django.test import TestCase
from django_otp.oath import TOTP
from django_otp.plugins.otp_totp.models import TOTPDevice


class DriftNoSePersisteTests(TestCase):
    # verify_token escribe (last_t); ambos alias apuntan a la misma base de test.
    databases = {'default', 'standard'}

    def test_verify_correcto_no_guarda_drift(self):
        user = User.objects.create_user(username='drifttest', password='x')
        device = TOTPDevice.objects.create(
            user=user, name='t', confirmed=True, tolerance=2, drift=0,
        )

        # Código que corresponde a drift=+1 (un paso en el futuro): cae dentro de
        # la tolerancia, así que verify_token lo acepta y casa en el offset +1.
        # Con SYNC=True eso guardaría drift=1; con SYNC=False debe seguir en 0.
        totp = TOTP(device.bin_key, device.step, device.t0, device.digits, drift=1)
        totp.time = time.time()
        codigo = totp.token()

        self.assertTrue(
            device.verify_token(str(codigo)),
            "el código dentro de tolerancia debería verificar",
        )

        device.refresh_from_db()
        self.assertEqual(
            device.drift, 0,
            "OTP_TOTP_SYNC=False no impidió persistir el drift reaprendido",
        )

    def test_dispositivo_nuevo_nace_con_tolerance_2(self):
        # El signal de api/Apps.py fija un piso de 2 en la creación.
        user = User.objects.create_user(username='toltest', password='x')
        device = TOTPDevice.objects.create(user=user, name='t', confirmed=True)
        self.assertEqual(device.tolerance, 2)
