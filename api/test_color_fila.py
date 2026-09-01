"""Pruebas de los dos baldes de pintura: el de la FILA y el de la CELDA.

Mismo contrato en Maniobras, Vacíos y Gastos, con dos validaciones compartidas
(`validar_color_de_fila` y `validar_colores_de_celda`). La batería completa corre
contra Maniobras; de las otras dos se comprueba que el serializer está enganchado
a esas validaciones y no se olvidó.

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
from api.Serializers import (GastoSerializer, ManiobraSerializer,
                             VacioSerializer, MAX_CELDAS_PINTADAS)
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
            # `vacios` tambien: desde la 0061 la maniobra lee de ahi sus fechas y
            # su patio al serializarse, asi que sin esta tabla cualquier lectura
            # revienta.
            editor.create_model(Vacio)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Vacio)
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
            # `maniobras` primero aunque esta prueba no la use: desde la 0061
            # `vacios` tiene una FK a ella y no se puede crear sin su destino.
            editor.create_model(Maniobra)
            editor.create_model(Vacio)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Vacio)
            editor.delete_model(Maniobra)
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


class ColorDeCeldaTests(BaseColor):
    """El balde por celda: `colores` es {columna: "#rrggbb"}.

    Es un jsonb ABIERTO y cada valor acaba dentro del CSS de la tabla, así que
    aquí se aprieta más que en el de la fila: además del color hay que validar
    la clave y el tamaño del mapa.
    """

    def pintar_celdas(self, mapa):
        return self.cliente.patch(
            f'/api/maniobras/{self.maniobra.id}/', {'colores': mapa}, format='json',
        )

    def celdas_guardadas(self):
        return Maniobra.objects.get(id=self.maniobra.id).colores

    def test_se_pintan_varias_celdas_de_la_misma_fila(self):
        r = self.pintar_celdas({'contenedor': '#ffd966', 'fecha_pis': '#b6d7a8'})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.celdas_guardadas(),
                         {'contenedor': '#ffd966', 'fecha_pis': '#b6d7a8'})

    def test_las_mayusculas_se_normalizan_a_minusculas(self):
        self.pintar_celdas({'contenedor': '#FFD966'})
        self.assertEqual(self.celdas_guardadas(), {'contenedor': '#ffd966'})

    def test_no_entra_css_disfrazado_de_color(self):
        for basura in ('#fff', 'red', '#ffd966; background-image: url(x)',
                       'var(--x)', 123, None):
            with self.subTest(color=basura):
                self.assertEqual(
                    self.pintar_celdas({'contenedor': basura}).status_code, 400)

    def test_la_clave_tiene_que_parecer_una_columna(self):
        """No se compara contra una lista de columnas —viviría aquí y en el
        frontend—, pero sí contra su forma: lo que llega es una clave de jsonb."""
        for clave in ('con espacios', 'MAYUSCULAS', '../etc', '', 'a' * 41):
            with self.subTest(clave=clave):
                self.assertEqual(
                    self.pintar_celdas({clave: '#ffd966'}).status_code, 400)

    def test_una_columna_que_no_existe_no_es_un_error(self):
        """Inerte a propósito: así añadir una columna al frontend no exige tocar
        el servidor. Una clave que no case con ninguna simplemente no pinta."""
        self.assertEqual(self.pintar_celdas({'columna_inventada': '#ffd966'}).status_code, 200)

    def test_hay_un_tope_de_celdas_por_fila(self):
        cabe = {f'columna_{i}': '#ffd966' for i in range(MAX_CELDAS_PINTADAS)}
        self.assertEqual(self.pintar_celdas(cabe).status_code, 200)
        no_cabe = {f'columna_{i}': '#ffd966' for i in range(MAX_CELDAS_PINTADAS + 1)}
        self.assertEqual(self.pintar_celdas(no_cabe).status_code, 400)

    def test_el_mapa_vacio_despinta_todas(self):
        self.pintar_celdas({'contenedor': '#ffd966'})
        self.assertEqual(self.pintar_celdas({}).status_code, 200)
        self.assertEqual(self.celdas_guardadas(), {})

    def test_un_mapa_rechazado_no_pisa_el_que_ya_estaba(self):
        self.pintar_celdas({'contenedor': '#ffd966'})
        self.pintar_celdas({'contenedor': 'javascript:alert(1)'})
        self.assertEqual(self.celdas_guardadas(), {'contenedor': '#ffd966'})

    def test_pintar_la_celda_no_toca_el_color_de_la_fila(self):
        """Son dos baldes independientes: el de la celda se añadió SIN sustituir
        al de la fila, y quitar uno no puede llevarse el otro por delante."""
        self.pintar('#0b5394')
        self.pintar_celdas({'contenedor': '#ffd966'})
        self.assertEqual(self.color_guardado(), '#0b5394')
        self.pintar_celdas({})
        self.assertEqual(self.color_guardado(), '#0b5394')


class EngancheColorDeCeldaTests(SimpleTestCase):
    """Vacíos y Gastos usan la misma validación. Igual que con el color de fila,
    aquí solo se comprueba el enganche: una columna `colores` sin su
    `validate_colores` deja el jsonb abierto sin que nada falle.

    Sin BD: la validación es una función pura del serializer."""

    def test_las_tres_tablas_enganchan_la_validacion_compartida(self):
        for serializer in (ManiobraSerializer(), VacioSerializer(), GastoSerializer()):
            with self.subTest(serializer=type(serializer).__name__):
                self.assertEqual(
                    serializer.validate_colores({'contenedor': '#B6D7A8'}),
                    {'contenedor': '#b6d7a8'},
                )
                self.assertEqual(serializer.validate_colores(None), {})
                with self.assertRaises(drf_serializers.ValidationError):
                    serializer.validate_colores({'contenedor': '#b6d7a8; url(x)'})
                with self.assertRaises(drf_serializers.ValidationError):
                    serializer.validate_colores('no soy un mapa')
