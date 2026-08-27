"""Pruebas del color de relleno de una fila (el balde de pintura).

Mismo contrato en Maniobras y en Vacíos, con una sola validación compartida
(`validar_color_de_fila`). La batería completa corre contra Maniobras; de Vacíos
se comprueba que el serializer está enganchado a esa validación y no se olvidó.

Lo que se cubre es lo que rompe en silencio:

  · El color acaba DENTRO del CSS de la tabla para todos los usuarios, así que
    solo puede entrar "#rrggbb". La paleta del frontend no es una defensa:
    cualquiera con la consola abierta manda lo que quiera.
  · Restablecer tiene que dejar la columna en NULL de verdad. Si guardara ""
    o "null", la fila seguiría contando como pintada y no volvería al color de
    su status.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from api.models import Maniobra, Vacio
from api.Serializers import GastoSerializer
from rest_framework import serializers as drf_serializers


class BaseColor(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # `maniobras` es managed=False y settings_test no la crea (ver su
        # docstring). Mismo montaje que test_costos_extra.py.
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Maniobra)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Maniobra)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('color_user', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)
        self.maniobra = Maniobra.objects.create(solicita='PRUEBA')

    def pintar(self, color):
        return self.cliente.patch(
            f'/api/maniobras/{self.maniobra.id}/', {'color': color}, format='json',
        )

    def color_guardado(self):
        return Maniobra.objects.get(id=self.maniobra.id).color


class ColorValidoTests(BaseColor):

    def test_un_color_de_la_paleta_se_guarda(self):
        self.assertEqual(self.pintar('#ffd966').status_code, 200)
        self.assertEqual(self.color_guardado(), '#ffd966')

    def test_las_mayusculas_se_normalizan_a_minusculas(self):
        """Para que dos filas del mismo color se comparen igual sin tener que
        acordarse de normalizar en cada sitio que lea la columna."""
        self.assertEqual(self.pintar('#FFD966').status_code, 200)
        self.assertEqual(self.color_guardado(), '#ffd966')


class ColorInvalidoTests(BaseColor):

    def test_no_entra_nada_que_no_sea_rrggbb(self):
        for basura in ('red',
                       '#fff',                               # atajo de 3 dígitos
                       '#ffd966; background-image: url(x)',  # intento de colar CSS
                       'javascript:alert(1)',
                       '#gggggg'):
            with self.subTest(color=basura):
                self.assertEqual(self.pintar(basura).status_code, 400)
                self.assertIsNone(self.color_guardado())

    def test_un_color_rechazado_no_pisa_el_que_ya_estaba(self):
        self.pintar('#ffd966')
        self.assertEqual(self.pintar('red').status_code, 400)
        self.assertEqual(self.color_guardado(), '#ffd966')


class RestablecerTests(BaseColor):

    def test_restablecer_deja_la_columna_en_null(self):
        """Null y no cadena vacía: la fila tiene que dejar de contar como
        pintada para volver al color de su status."""
        self.pintar('#ffd966')

        self.assertEqual(self.pintar(None).status_code, 200)
        self.assertIsNone(self.color_guardado())

    def test_la_cadena_vacia_tambien_limpia(self):
        # El apiClient del frontend convierte "" y null en null antes de enviar,
        # pero el servidor no puede dar por hecho quién le habla.
        self.pintar('#ffd966')
        self.assertEqual(self.pintar('').status_code, 200)
        self.assertIsNone(self.color_guardado())


class SinSesionTests(BaseColor):

    def test_un_anonimo_no_puede_pintar(self):
        anonimo = APIClient()
        respuesta = anonimo.patch(
            f'/api/maniobras/{self.maniobra.id}/', {'color': '#ffd966'}, format='json',
        )
        self.assertEqual(respuesta.status_code, 401)
        self.assertIsNone(self.color_guardado())


class VacioColorTests(TestCase):
    """Vacíos usa la misma validación. Aquí solo se comprueba el enganche: si
    alguien añade la columna a un modelo nuevo y olvida el `validate_color`, la
    puerta queda abierta sin que nada falle."""
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Vacio)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Vacio)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('color_vacio', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)
        self.vacio = Vacio.objects.create(contenedor='TEST1234567')

    def pintar(self, color):
        return self.cliente.patch(
            f'/api/vacios/{self.vacio.id}/', {'color': color}, format='json',
        )

    def color_guardado(self):
        return Vacio.objects.get(id=self.vacio.id).color

    def test_un_color_valido_se_guarda(self):
        self.assertEqual(self.pintar('#B6D7A8').status_code, 200)
        self.assertEqual(self.color_guardado(), '#b6d7a8')

    def test_no_entra_css_disfrazado_de_color(self):
        self.assertEqual(self.pintar('#b6d7a8; background-image: url(x)').status_code, 400)
        self.assertIsNone(self.color_guardado())

    def test_restablecer_deja_la_columna_en_null(self):
        self.pintar('#b6d7a8')
        self.assertEqual(self.pintar(None).status_code, 200)
        self.assertIsNone(self.color_guardado())


class GastoColorTests(SimpleTestCase):
    """Gastos usa la misma validación. Igual que en Vacíos, aquí solo se
    comprueba el enganche: una columna `color` en un modelo nuevo sin su
    `validate_color` deja la puerta abierta sin que nada falle.

    Sin BD: la validación es una función pura del serializer."""

    def test_engancha_la_validacion_compartida(self):
        campo = GastoSerializer()
        self.assertEqual(campo.validate_color('#B6D7A8'), '#b6d7a8')
        self.assertIsNone(campo.validate_color(''))
        with self.assertRaises(drf_serializers.ValidationError):
            campo.validate_color('#b6d7a8; background-image: url(x)')
