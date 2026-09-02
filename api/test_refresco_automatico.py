"""El reloj que deja a todos viendo lo mismo sin recargar la pagina.

`GET <recurso>/cambios/` devuelve dos numeros y `?modificado_desde=` acota la
lista a lo tocado despues de una marca. Lo que se cubre aqui es lo que fallaria
en silencio y nadie sabria por que: un borrado que no mueve el reloj (la fila
fantasma se quedaria en pantalla para siempre) y una marca ilegible que
convierte un refresco de 40 bytes en la tabla entera cada 3 segundos.

Ver el analisis de viabilidad del 2026-08-26: se eligio sondeo y no WebSockets
porque Redis costaba mas que todo el sistema.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Gasto, Maniobra, Vacio


class BaseRefresco(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Maniobra)
            editor.create_model(Gasto)
            editor.create_model(Vacio)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Vacio)
            editor.delete_model(Gasto)
            editor.delete_model(Maniobra)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_superuser('jefe', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def reloj(self, recurso='vacios', **params):
        return self.cliente.get(f'/api/{recurso}/cambios/', params).data


class RelojTests(BaseRefresco):

    def test_una_tabla_vacia_da_un_reloj_vacio(self):
        self.assertEqual(self.reloj(), {'t': '', 'n': 0})

    def test_dar_de_alta_mueve_las_dos_cifras(self):
        antes = self.reloj()
        Vacio.objects.create(contenedor='WHLU5591210', status='pendiente')

        ahora = self.reloj()

        self.assertNotEqual(ahora['t'], antes['t'])
        self.assertEqual(ahora['n'], antes['n'] + 1)

    def test_editar_mueve_la_marca_de_tiempo(self):
        v = Vacio.objects.create(contenedor='WHLU5591210', status='pendiente')
        antes = self.reloj()

        # Un campo cualquiera: lo que se mide es que EDITAR mueve el reloj, no
        # que lo haga este campo. Antes se usaba `cita`, que desde la 0063 ya no
        # es texto libre sino un instante.
        v.cd = 'EDITADO'
        v.save()

        self.assertGreater(self.reloj()['t'], antes['t'])

    def test_borrar_NO_mueve_la_marca_pero_si_el_contador(self):
        """El motivo de que el reloj lleve dos numeros y no uno.

        La fila que se va no baja la fecha maxima de las que quedan: con solo la
        marca de tiempo, el navegador creeria que no ha pasado nada y seguiria
        enseñando la fila borrada indefinidamente.
        """
        viejo = Vacio.objects.create(contenedor='VIEJO', status='pendiente')
        Vacio.objects.create(contenedor='NUEVO', status='pendiente')   # el mas reciente
        antes = self.reloj()

        viejo.delete()

        ahora = self.reloj()
        self.assertEqual(ahora['t'], antes['t'])      # la marca NO se entera
        self.assertEqual(ahora['n'], antes['n'] - 1)  # el contador SI

    def test_el_reloj_respeta_el_filtro_de_la_vista(self):
        """Quien mira Pendientes no debe refrescar por un cambio en Entregados."""
        Vacio.objects.create(contenedor='A', status='pendiente')
        Vacio.objects.create(contenedor='B', status='entregado')

        self.assertEqual(self.reloj(status='pendiente')['n'], 1)
        self.assertEqual(self.reloj(status='entregado')['n'], 1)
        self.assertEqual(self.reloj()['n'], 2)

    def test_entregar_un_vacio_es_una_baja_para_quien_mira_pendientes(self):
        v = Vacio.objects.create(contenedor='A', status='pendiente')
        antes = self.reloj(status='pendiente')

        self.cliente.patch(f'/api/vacios/{v.id}/', {'status': 'entregado'}, format='json')

        self.assertEqual(self.reloj(status='pendiente')['n'], antes['n'] - 1)

    def test_maniobras_tiene_su_propio_reloj(self):
        Maniobra.objects.create(solicita='PRUEBA')
        self.assertEqual(self.reloj('maniobras')['n'], 1)


class ModificadoDesdeTests(BaseRefresco):
    """El refresco pide UNA fila, no sesenta."""

    def test_solo_devuelve_lo_tocado_despues_de_la_marca(self):
        Vacio.objects.create(contenedor='ANTIGUO', status='pendiente')
        marca = self.reloj()['t']

        Vacio.objects.create(contenedor='RECIENTE', status='pendiente')

        r = self.cliente.get('/api/vacios/', {'modificado_desde': marca})
        self.assertEqual([v['contenedor'] for v in r.data['results']], ['RECIENTE'])

    def test_sin_cambios_no_devuelve_nada(self):
        Vacio.objects.create(contenedor='A', status='pendiente')
        marca = self.reloj()['t']

        r = self.cliente.get('/api/vacios/', {'modificado_desde': marca})

        self.assertEqual(r.data['results'], [])

    def test_las_filas_sin_fecha_de_auditoria_quedan_fuera(self):
        """383 de 414 maniobras la tienen vacia: son anteriores a la auditoria y
        nadie las ha tocado desde entonces. Si entraran, cada refresco se
        traeria la tabla entera."""
        Vacio.objects.create(contenedor='A', status='pendiente')
        Vacio.objects.filter(contenedor='A').update(updated_at=None)

        r = self.cliente.get('/api/vacios/', {'modificado_desde': '2020-01-01T00:00:00+00:00'})

        self.assertEqual(r.data['results'], [])

    def test_una_marca_ilegible_se_rechaza_en_vez_de_devolverlo_todo(self):
        """Sin esto, un refresco de 40 bytes pasaria a ser la tabla entera cada
        3 segundos y nadie lo notaria hasta ver la factura."""
        Vacio.objects.create(contenedor='A', status='pendiente')

        r = self.cliente.get('/api/vacios/', {'modificado_desde': 'ayer por la tarde'})

        self.assertEqual(r.status_code, 400, r.data)

    def test_sin_el_parametro_la_lista_sigue_completa(self):
        """La carga normal de la pagina no debe cambiar."""
        Vacio.objects.create(contenedor='A', status='pendiente')
        Vacio.objects.create(contenedor='B', status='pendiente')

        self.assertEqual(len(self.cliente.get('/api/vacios/').data['results']), 2)


class RenombrarFolioTests(BaseRefresco):
    """El unico camino que escribia en maniobras saltandose el ORM."""

    def test_renombrar_un_folio_mueve_el_reloj_de_maniobras(self):
        """auto_now no corre en un update() masivo: sin ponerlo a mano, el
        renombrado seria invisible y las demas pantallas seguirian mostrando el
        codigo viejo hasta que alguien pulsara F5."""
        from api.models import Folio
        m = Maniobra.objects.create(solicita='PRUEBA', folio='F-2279')
        Maniobra.objects.filter(pk=m.pk).update(updated_at=None)
        antes = self.reloj('maniobras')
        folio = Folio.objects.create(codigo='F-2279', tabla='fraba', numero=2279, letra='F')

        self.cliente.patch(f'/api/folios/{folio.id}/', {'codigo': 'F-9999'}, format='json')

        m.refresh_from_db()
        self.assertEqual(m.folio, 'F-9999')
        self.assertIsNotNone(m.updated_at)
        self.assertNotEqual(self.reloj('maniobras')['t'], antes['t'])
