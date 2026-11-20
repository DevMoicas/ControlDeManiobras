"""El saludo del inicio muestra el First Name: tiene que viajar en el token,
también en el access que se renueva desde el refresh.

Sin BD, como test_mfa_login: las tablas son managed=False y el test runner no
puede crearlas. super().get_token() se sustituye por un RefreshToken vacío
porque con la blacklist instalada for_user() escribe en la base.
"""
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from api.Serializers import CustomTokenObtainPairSerializer


class _UsuarioFalso:
    username = "jperez"
    first_name = "Juan"
    is_staff = False


class TokenClaimsTests(SimpleTestCase):
    @patch.object(TokenObtainPairSerializer, "get_token", side_effect=lambda user: RefreshToken())
    def test_first_name_en_refresh_y_access(self, _):
        refresh = CustomTokenObtainPairSerializer.get_token(_UsuarioFalso())
        self.assertEqual(refresh["first_name"], "Juan")
        self.assertEqual(refresh.access_token["first_name"], "Juan")
        self.assertEqual(refresh["username"], "jperez")
