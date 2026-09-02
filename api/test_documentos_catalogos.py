"""Los documentos de Tractos y Remolques: tarjeta, permisos y verificaciones.

Cuelgan de la misma tabla que las fotos de maniobras (FotoRegistro), pero con
otras reglas, y son justo esas reglas las que pueden decidir mal en silencio:
aqui SI se admite PDF y el tope es 10 MB en vez de 2, porque un comprobante
recomprimido deja de servir de comprobante. Al reves —un PDF colandose como foto
de maniobra— seria un archivo que la pantalla de fotos no sabe pintar.

Lo otro que se prueba es el numero de huecos: 'Permisos Full' usa dos y el resto
uno, asi que un archivo guardado en el hueco 2 de los demas quedaria escrito
donde nadie lo ve nunca.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
import io
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connections
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from api.models import Chofer, FotoRegistro, Maniobra, Remolque, Tracto

SUBIR = '/api/fotos/subir/'
CATALOGOS = '/api/fotos/catalogos/'
ALERTAS = '/api/alertas-vencimiento/'

PDF = b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'


def png(ancho=8, alto=8):
    buffer = io.BytesIO()
    Image.new('RGB', (ancho, alto), 'white').save(buffer, format='PNG')
    return buffer.getvalue()


class BaseCatalogos(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # `tractos`, `remolques`, `maniobras` y `choferes` son managed=False:
        # settings_test no las crea. Chofer entra porque el endpoint de alertas
        # mira las licencias en la misma respuesta.
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Tracto)
            editor.create_model(Remolque)
            editor.create_model(Maniobra)
            editor.create_model(Chofer)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Chofer)
            editor.delete_model(Maniobra)
            editor.delete_model(Remolque)
            editor.delete_model(Tracto)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('capturista', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)
        self.tracto = Tracto.objects.create(
            no_eco='T-01', unidad='KENWORTH', anio=2019, placas='ABC123', tipo='QUINTA RUEDA')

    def subir(self, tipo, registro_id, contenido, nombre='doc.pdf', slot=1):
        return self.cliente.post(SUBIR, {
            'tipo': tipo,
            'registro_id': registro_id,
            'slot': slot,
            'foto': SimpleUploadedFile(nombre, contenido),
        }, format='multipart')


class SubidaDeDocumentosTests(BaseCatalogos):

    def test_un_pdf_entra_en_un_documento_de_catalogo(self):
        r = self.subir('tracto_tarjeta', self.tracto.id, PDF)
        self.assertEqual(r.status_code, 200, r.data)
        guardado = FotoRegistro.objects.get(tipo='tracto_tarjeta', registro_id=self.tracto.id)
        self.assertEqual(guardado.foto_1_mime, 'application/pdf')
        self.assertEqual(bytes(guardado.foto_1), PDF)

    def test_el_mismo_pdf_NO_entra_como_foto_de_maniobra(self):
        """La pantalla de fotos pinta <img>: un PDF ahi seria un hueco roto."""
        maniobra = Maniobra.objects.create(solicita='PRUEBA')
        r = self.subir('maniobra', maniobra.id, PDF)
        self.assertEqual(r.status_code, 400)
        self.assertIn('imagen', r.data['detail'].lower())

    def test_una_imagen_tambien_entra_como_documento(self):
        r = self.subir('tracto_humo', self.tracto.id, png(), nombre='foto.png')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(
            FotoRegistro.objects.get(tipo='tracto_humo').foto_1_mime, 'image/png')

    def test_lo_que_no_es_ni_pdf_ni_imagen_se_rechaza(self):
        r = self.subir('tracto_tarjeta', self.tracto.id, b'no soy un pdf ni una imagen')
        self.assertEqual(r.status_code, 400)

    def test_un_documento_de_un_tracto_que_no_existe_es_404(self):
        """Sin esto quedarian archivos colgando de un id inexistente."""
        r = self.subir('tracto_tarjeta', 99999, PDF)
        self.assertEqual(r.status_code, 404)

    def test_permisos_full_tiene_dos_huecos(self):
        self.assertEqual(self.subir('tracto_full', self.tracto.id, PDF, slot=2).status_code, 200)

    def test_los_demas_documentos_solo_tienen_uno(self):
        r = self.subir('tracto_humo', self.tracto.id, PDF, slot=2)
        self.assertEqual(r.status_code, 400)
        self.assertIn('slot debe ser 1', r.data['detail'])

    def test_un_tipo_inventado_se_rechaza(self):
        self.assertEqual(self.subir('tracto_loquesea', self.tracto.id, PDF).status_code, 400)

    def test_el_tope_de_los_documentos_es_mas_alto_que_el_de_las_fotos(self):
        """3 MB: pasa como documento y rebota como foto de maniobra."""
        maniobra = Maniobra.objects.create(solicita='PRUEBA')
        gordo = PDF + b'\0' * (3 * 1024 * 1024)
        self.assertEqual(self.subir('tracto_tarjeta', self.tracto.id, gordo).status_code, 200)
        r = self.subir('maniobra', maniobra.id, gordo)
        self.assertEqual(r.status_code, 400)
        self.assertIn('2 MB', r.data['detail'])

    def test_ni_los_documentos_pasan_de_diez_megas(self):
        r = self.subir('tracto_tarjeta', self.tracto.id, PDF + b'\0' * (10 * 1024 * 1024))
        self.assertEqual(r.status_code, 400)
        self.assertIn('10 MB', r.data['detail'])


class BorradoDeDocumentosTests(BaseCatalogos):
    """Borrar es cosa del admin, como todo borrado en el proyecto (decision A1).

    Se prueba aqui porque en local no hay forma comoda de entrar como admin —el
    segundo factor pide un codigo que no esta sincronizado—, asi que esta es la
    unica verificacion real de la regla antes de subir.
    """

    def test_un_capturista_no_borra_un_documento(self):
        self.subir('tracto_tarjeta', self.tracto.id, PDF)
        r = self.cliente.delete(
            f'/api/fotos/eliminar/?tipo=tracto_tarjeta&registro_id={self.tracto.id}&slot=1')
        self.assertEqual(r.status_code, 403)
        self.assertTrue(FotoRegistro.objects.filter(tipo='tracto_tarjeta').exists())

    def test_el_admin_si_borra(self):
        self.subir('tracto_tarjeta', self.tracto.id, PDF)
        self.cliente.force_authenticate(
            user=get_user_model().objects.create_user('jefa', password='x', is_staff=True))

        r = self.cliente.delete(
            f'/api/fotos/eliminar/?tipo=tracto_tarjeta&registro_id={self.tracto.id}&slot=1')
        self.assertEqual(r.status_code, 200, r.data)
        # La fila entera se va cuando no queda ningun archivo: sin esto el clip
        # seguiria pintandose lleno para un documento que ya no esta.
        self.assertFalse(FotoRegistro.objects.filter(tipo='tracto_tarjeta').exists())

    def test_borrar_una_hoja_de_permisos_full_deja_la_otra(self):
        self.subir('tracto_full', self.tracto.id, PDF, slot=1)
        self.subir('tracto_full', self.tracto.id, png(), nombre='hoja2.png', slot=2)
        self.cliente.force_authenticate(
            user=get_user_model().objects.create_user('jefe', password='x', is_staff=True))

        r = self.cliente.delete(
            f'/api/fotos/eliminar/?tipo=tracto_full&registro_id={self.tracto.id}&slot=1')
        self.assertEqual(r.status_code, 200, r.data)
        fila = FotoRegistro.objects.get(tipo='tracto_full', registro_id=self.tracto.id)
        self.assertIsNone(fila.foto_1 or None)
        self.assertEqual(fila.foto_2_mime, 'image/png')


class QueDocumentosHayTests(BaseCatalogos):

    def test_dice_que_registros_ya_tienen_cada_documento(self):
        """De una sola vez: preguntarlo fila a fila serian cuatro peticiones
        por tracto."""
        remolque = Remolque.objects.create(color='ROJO', tipo='CAJA', placas='XYZ789')
        self.subir('tracto_tarjeta', self.tracto.id, PDF)
        self.subir('remolque_full', remolque.id, PDF)

        r = self.cliente.get(CATALOGOS)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['tracto_tarjeta'], [self.tracto.id])
        self.assertEqual(r.data['remolque_full'], [remolque.id])
        # Los tipos sin nada tambien salen, vacios: la pantalla no tiene que
        # distinguir "no hay" de "no vino en la respuesta".
        self.assertEqual(r.data['tracto_humo'], [])
        self.assertEqual(r.data['remolque_fisico'], [])


class AlertasDeVencimientoTests(BaseCatalogos):

    def tipos(self, respuesta):
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        return {a['tipo'] for a in respuesta.data}

    def test_los_permisos_full_avisan_con_un_mes(self):
        self.tracto.fecha_vencimiento_permisos_full = date.today() + timedelta(days=20)
        self.tracto.save()
        self.assertIn('permisos_full_tracto', self.tipos(self.cliente.get(ALERTAS)))

    def test_los_permisos_full_a_mes_y_medio_todavia_no_avisan(self):
        self.tracto.fecha_vencimiento_permisos_full = date.today() + timedelta(days=45)
        self.tracto.save()
        self.assertNotIn('permisos_full_tracto', self.tipos(self.cliente.get(ALERTAS)))

    def test_el_humo_no_avisa_antes_de_tiempo(self):
        """A diferencia del resto, este no se adelanta ni un dia."""
        self.tracto.fecha_vencimiento_humo = date.today() + timedelta(days=1)
        self.tracto.save()
        self.assertNotIn('humo', self.tipos(self.cliente.get(ALERTAS)))

    def test_el_humo_avisa_el_dia_que_vence(self):
        self.tracto.fecha_vencimiento_humo = date.today()
        self.tracto.save()
        self.assertIn('humo', self.tipos(self.cliente.get(ALERTAS)))

    def test_el_humo_vencido_sigue_avisando(self):
        """Es la unica familia de alertas que habla de algo YA vencido: una
        verificacion caducada hace meses sigue siendo un camion que no deberia
        estar circulando. Se quita renovando la fecha, como las demas."""
        self.tracto.fecha_vencimiento_humo = date.today() - timedelta(days=90)
        self.tracto.save()
        self.assertIn('humo', self.tipos(self.cliente.get(ALERTAS)))

        self.tracto.fecha_vencimiento_humo = date.today() + timedelta(days=365)
        self.tracto.save()
        self.assertNotIn('humo', self.tipos(self.cliente.get(ALERTAS)))

    def test_la_poliza_conserva_sus_dos_semanas(self):
        """Los plazos de antes no se tocaron: a 20 dias la poliza NO avisa,
        aunque unos Permisos Full con esa misma fecha si lo harian."""
        self.tracto.fecha_vencimiento_poliza = date.today() + timedelta(days=20)
        self.tracto.save()
        self.assertNotIn('poliza', self.tipos(self.cliente.get(ALERTAS)))

    def test_el_remolque_avisa_con_su_placa(self):
        remolque = Remolque.objects.create(color='ROJO', tipo='CAJA', placas='XYZ789')
        remolque.fecha_vencimiento_fisico_mecanica = date.today() - timedelta(days=3)
        remolque.save()
        alerta = next(a for a in self.cliente.get(ALERTAS).data
                      if a['tipo'] == 'fisico_mecanica_remolque')
        self.assertIn('XYZ789', alerta['nombre'])
