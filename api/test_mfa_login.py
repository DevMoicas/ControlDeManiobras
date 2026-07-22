"""MFA en el login por JWT (tarea 9.1, fase 1).

Estas pruebas cubren la LÓGICA DE DECISIÓN: a quién se le exige el código y qué
pasa con cada respuesta. Van sin base de datos, como el resto de la suite: los
modelos managed=False no se crean en la BD de test y la migración 0019 no puede
alterarlos, así que aquí no hay TestCase con BD que valga.

⚠️ Lo que estas pruebas NO pueden cubrir: que el rol django_standard_role tenga
permiso para escribir en las tablas de OTP (migración 0022). Eso es un permiso de
PostgreSQL y solo se comprueba contra una base real — se verifica consultando
information_schema.role_table_grants tras aplicar la migración. Sin ese permiso el
login con código revienta con 'permission denied' y estas pruebas seguirían en verde.
"""
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from api.Serializers import CustomTokenObtainPairSerializer

TOKENS = {"access": "un-access", "refresh": "un-refresh"}


class _UsuarioFalso:
    username = "juan"
    is_staff = False


class _DispositivoFalso:
    pass


class MfaLoginTests(SimpleTestCase):

    def _validar(self, datos, dispositivos=(), codigo_correcto=False):
        """Corre validate() sustituyendo las dos consultas a BD y la validación
        de credenciales del padre (que ya está probada por simplejwt)."""
        serializer = CustomTokenObtainPairSerializer(data=datos)
        serializer.initial_data = datos
        serializer.user = _UsuarioFalso()

        with patch.object(TokenObtainPairSerializer, "validate", return_value=dict(TOKENS)), \
             patch("api.Serializers.devices_for_user", return_value=iter(dispositivos)), \
             patch("api.Serializers.match_token",
                   return_value=_DispositivoFalso() if codigo_correcto else None):
            return serializer.validate(datos)

    # ── Sin dispositivo: nada cambia ────────────────────────────────────────
    def test_sin_dispositivo_entra_sin_codigo(self):
        """Lo que permite desplegar la fase 1 sin dejar a nadie fuera."""
        self.assertEqual(self._validar({"username": "juan", "password": "x"}), TOKENS)

    def test_sin_dispositivo_ignora_un_codigo_sobrante(self):
        datos = {"username": "juan", "password": "x", "otp_token": "123456"}
        self.assertEqual(self._validar(datos), TOKENS)

    # ── Con dispositivo: se exige el código ─────────────────────────────────
    def test_con_dispositivo_sin_codigo_pide_el_codigo(self):
        with self.assertRaises(AuthenticationFailed) as caso:
            self._validar({"username": "juan", "password": "x"},
                          dispositivos=[_DispositivoFalso()])
        self.assertEqual(caso.exception.detail["codigo"], "mfa_requerida")

    def test_codigo_vacio_o_en_blanco_cuenta_como_ausente(self):
        for vacio in ("", "   ", None):
            with self.assertRaises(AuthenticationFailed) as caso:
                self._validar({"username": "juan", "password": "x", "otp_token": vacio},
                              dispositivos=[_DispositivoFalso()])
            self.assertEqual(caso.exception.detail["codigo"], "mfa_requerida")

    def test_con_dispositivo_y_codigo_invalido_no_entra(self):
        with self.assertRaises(AuthenticationFailed) as caso:
            self._validar({"username": "juan", "password": "x", "otp_token": "000000"},
                          dispositivos=[_DispositivoFalso()], codigo_correcto=False)
        self.assertEqual(caso.exception.detail["codigo"], "mfa_invalida")

    def test_con_dispositivo_y_codigo_correcto_entra(self):
        datos = {"username": "juan", "password": "x", "otp_token": "123456"}
        resultado = self._validar(datos, dispositivos=[_DispositivoFalso()],
                                  codigo_correcto=True)
        self.assertEqual(resultado, TOKENS)

    # ── El código nunca sustituye a la contraseña ───────────────────────────
    def test_si_la_contrasena_falla_no_se_llega_al_mfa(self):
        """Un código válido con contraseña incorrecta NO puede entrar."""
        serializer = CustomTokenObtainPairSerializer(data={})
        serializer.initial_data = {"otp_token": "123456"}
        serializer.user = _UsuarioFalso()

        with patch.object(TokenObtainPairSerializer, "validate",
                          side_effect=AuthenticationFailed("credenciales")), \
             patch("api.Serializers.match_token") as comprobar_codigo:
            with self.assertRaises(AuthenticationFailed):
                serializer.validate({})
            comprobar_codigo.assert_not_called()

    # ── El fallo de MFA deja rastro ─────────────────────────────────────────
    def test_codigo_invalido_se_registra_como_evento_de_seguridad(self):
        """'Contraseña correcta + código fallido' identifica exactamente qué
        cuenta tiene la contraseña comprometida. Es la alerta más valiosa."""
        with self.assertLogs("api.security", level="WARNING") as registro:
            with self.assertRaises(AuthenticationFailed):
                self._validar({"username": "juan", "password": "x", "otp_token": "000000"},
                              dispositivos=[_DispositivoFalso()])
        self.assertIn("MFA FALLIDO", registro.output[0])
        self.assertIn("juan", registro.output[0])
