"""Al asignar un folio a un viaje propio se abre solo su reporte de viaje.

Mismo disparo que el gasto (test_gasto_automatico.py) y los vacios
(test_vacio_automatico.py), y con el filtro MAS estrecho de los tres: solo los
viajes de FRABA que ademas no esten marcados como TERCERO.

Lo que se cubre es lo que decidiria mal en silencio:

  · CUANDO NO se abre — un reporte de mas en un viaje de tercero es un papel que
    alguien tendria que ir a borrar, y solo un admin puede;
  · el reparto de un Full, que gasta un folio por operador y abre DOS reportes,
    cada uno con SU operador y SU coordinador;
  · RECOLECCION EN PUERTO, que la dicta `placas_pis` contra el catalogo de
    tractos y NO la marca TERCERO de la maniobra — son dos preguntas distintas y
    confundirlas se ve en el papel firmado, no aqui;
  · el remate: el folio se asigna ANTES de saber quien lo llevara y antes de
    capturar las placas, asi que el reporte nace con huecos y hay que rellenarlos
    cuando el dato llega — pero SIN pisar lo que el coordinador ya escribio.

Decisiones del usuario (2026-09-03): un reporte por folio, solo de aqui en
adelante (nada de rellenar el historico), y los dos criterios —transportista y
marca TERCERO— juntos, porque marcar TERCERO se le puede pasar al capturista.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from datetime import date, datetime, timezone as tz
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from api.models import Chofer, Gasto, Maniobra, ReporteViaje, Tracto, Vacio
from api.views import _fecha_de_ruta_inicio

URL = '/api/maniobras/'
REPORTES = '/api/reportes-viaje/'
ZONA = ZoneInfo('America/Mexico_City')


class BaseReporteAutomatico(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # Todas son managed=False y settings_test no las crea. Gasto y Vacio
        # entran porque el mismo PATCH dispara sus automatismos; Chofer y Tracto
        # porque el reporte lee de ellos el coordinador y la recoleccion.
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Maniobra)
            editor.create_model(Gasto)
            editor.create_model(Vacio)
            editor.create_model(Chofer)
            editor.create_model(Tracto)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Tracto)
            editor.delete_model(Chofer)
            editor.delete_model(Vacio)
            editor.delete_model(Gasto)
            editor.delete_model(Maniobra)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('capturista', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    # -- Utilidades -------------------------------------------------------
    def maniobra(self, **campos):
        campos.setdefault('solicita', 'PRUEBA')
        return Maniobra.objects.create(**campos)

    def patch(self, maniobra_id, **campos):
        return self.cliente.patch(f'{URL}{maniobra_id}/', campos, format='json')

    def poner_folio(self, maniobra_id, folio='F-2279', **campos):
        return self.patch(maniobra_id, folio=folio, **campos)

    def reporte(self, folio='F-2279'):
        return ReporteViaje.objects.get(folio=folio)

    def tracto_propio(self, placas='93-AF-2K'):
        return Tracto.objects.create(no_eco='01', unidad='KENWORTH', anio=2020,
                                     placas=placas, tipo='TRACTO')

    def chofer(self, nombre='JUAN PEREZ', coordinador='ANA LOPEZ'):
        return Chofer.objects.create(nombre=nombre, coordinador=coordinador)


class SeAbreElReporteTests(BaseReporteAutomatico):

    def test_sin_folio_no_hay_reporte(self):
        """Es la mitad que importa del disparo: el reporte no existe hasta que
        el viaje tiene folio."""
        self.maniobra(transportista='FRABA CONTAINER')
        self.assertEqual(ReporteViaje.objects.count(), 0)

    def test_al_asignar_el_folio_nace_su_reporte(self):
        m = self.maniobra(transportista='FRABA CONTAINER')

        r = self.poner_folio(m.id)

        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(ReporteViaje.objects.count(), 1)
        self.assertEqual(self.reporte().folio, 'F-2279')

    def test_crear_la_maniobra_ya_con_folio_tambien_lo_abre(self):
        """El folio se puede elegir en la fila nueva, antes de guardar."""
        r = self.cliente.post(URL, {'solicita': 'PRUEBA', 'folio': 'F-2279'},
                              format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(ReporteViaje.objects.count(), 1)

    def test_precarga_lo_que_la_maniobra_ya_sabe(self):
        """Lo mismo que precargaba el modal al elegir el folio a mano, que es lo
        que esta regla viene a ahorrarse."""
        m = self.maniobra(tipo_servicio='full', cliente='YAZAKI',
                          origen='MANZANILLO', destino='SILAO',
                          asignacion_operador_status='JUAN PEREZ',
                          unidad='93-AF-2K', remolque='R-1', remolque_2='R-2')

        self.poner_folio(m.id)

        reporte = self.reporte()
        self.assertEqual(reporte.servicio,   'full')
        self.assertEqual(reporte.cliente,    'YAZAKI')
        self.assertEqual(reporte.origen,     'MANZANILLO')
        self.assertEqual(reporte.destino,    'SILAO')
        self.assertEqual(reporte.operador,   'JUAN PEREZ')
        self.assertEqual(reporte.unidad,     '93-AF-2K')
        self.assertEqual(reporte.remolque_1, 'R-1')
        self.assertEqual(reporte.remolque_2, 'R-2')

    def test_la_cita_sale_de_fecha_pis_y_horario(self):
        """En la hora de operacion, no en UTC: si no, el reporte que abre el
        servidor y el que abre la pantalla dirian horas distintas."""
        m = self.maniobra(fecha_pis='2026-09-10', horario='14:00')

        self.poner_folio(m.id)

        self.assertEqual(self.reporte().cita,
                         datetime(2026, 9, 10, 14, 0, tzinfo=ZONA))

    def test_sin_hora_no_se_inventa_una_cita(self):
        """Un '00:00' en el papel se lee como una cita a medianoche, no como un
        hueco."""
        m = self.maniobra(fecha_pis='2026-09-10', horario='')
        self.poner_folio(m.id)
        self.assertIsNone(self.reporte().cita)

    def test_un_full_repartido_abre_dos_reportes_uno_por_folio(self):
        m = self.maniobra(asignacion_operador_status='JUAN PEREZ',
                          unidad='93-AF-2K', remolque='R-1', remolque_2='R-2',
                          operador_2='LUIS GOMEZ',
                          unidad_2='11-BB-3C', remolque_3='R-3', remolque_4='R-4')

        self.patch(m.id, folio='F-2279', folio_2='R-2280')

        self.assertEqual(ReporteViaje.objects.count(), 2)
        uno = self.reporte('F-2279')
        dos = self.reporte('R-2280')
        self.assertEqual((uno.operador, uno.unidad, uno.remolque_1, uno.remolque_2),
                         ('JUAN PEREZ', '93-AF-2K', 'R-1', 'R-2'))
        self.assertEqual((dos.operador, dos.unidad, dos.remolque_1, dos.remolque_2),
                         ('LUIS GOMEZ', '11-BB-3C', 'R-3', 'R-4'))

    def test_el_folio_del_segundo_operador_que_llega_despues_abre_el_suyo(self):
        """El reparto de un Full se decide dias despues del primer folio."""
        m = self.maniobra()
        self.poner_folio(m.id)
        self.assertEqual(ReporteViaje.objects.count(), 1)

        self.patch(m.id, folio_2='R-2280')

        self.assertEqual(ReporteViaje.objects.count(), 2)

    def test_un_folio_que_ya_tiene_reporte_no_lo_duplica(self):
        """Lo abrio alguien a mano antes de que la maniobra tuviera folio."""
        self.cliente.post(REPORTES, {'folio': 'F-2279', 'coordinador': 'YA ESTABA'},
                          format='json')
        m = self.maniobra()

        self.poner_folio(m.id)

        self.assertEqual(ReporteViaje.objects.count(), 1)
        self.assertEqual(self.reporte().coordinador, 'YA ESTABA')

    def test_editar_otra_cosa_de_una_maniobra_vieja_no_abre_nada(self):
        """Acotado a la transicion de vacio a lleno, como los vacios: si no, una
        correccion cualquiera resucitaria reportes de viajes ya cerrados."""
        m = self.maniobra()
        self.poner_folio(m.id)
        self.reporte().delete()

        self.patch(m.id, cliente='YAZAKI')

        self.assertEqual(ReporteViaje.objects.count(), 0)


class NoSeAbreElReporteTests(BaseReporteAutomatico):
    """Los dos criterios, y por que hacen falta los dos."""

    def test_un_transportista_tercero_no_abre_reporte(self):
        m = self.maniobra(transportista='BSH')
        self.poner_folio(m.id)
        self.assertEqual(ReporteViaje.objects.count(), 0)

    def test_la_marca_tercero_tampoco_aunque_el_transportista_sea_fraba(self):
        m = self.maniobra(transportista='FRABA CONTAINER', tercero='tercero')
        self.poner_folio(m.id)
        self.assertEqual(ReporteViaje.objects.count(), 0)

    def test_el_transportista_manda_aunque_se_olvide_marcar_tercero(self):
        """El caso que obliga a mirar los DOS (usuario, 2026-09-03): un servicio
        de BSH sin la casilla marcada sigue siendo de un tercero."""
        m = self.maniobra(transportista='BSH', tercero=None)
        self.poner_folio(m.id)
        self.assertEqual(ReporteViaje.objects.count(), 0)

    def test_sin_transportista_si_se_abre(self):
        """La mayoria de las maniobras lo tienen vacio; si vacio no contara, la
        regla estaria dormida casi siempre. Mismo criterio que el gasto."""
        m = self.maniobra(transportista='')
        self.poner_folio(m.id)
        self.assertEqual(ReporteViaje.objects.count(), 1)


class RecoleccionEnPuertoTests(BaseReporteAutomatico):
    """La dicta `placas_pis` contra el catalogo de tractos, NO la marca TERCERO."""

    def test_placas_del_catalogo_de_tractos_son_propio(self):
        self.tracto_propio('93-AF-2K')
        m = self.maniobra(placas_pis='93-AF-2K')

        self.poner_folio(m.id)

        self.assertEqual(self.reporte().recoleccion, 'propio')

    def test_placas_que_no_estan_en_tractos_son_tercero(self):
        self.tracto_propio('93-AF-2K')
        m = self.maniobra(placas_pis='ZZ-99-XX')

        self.poner_folio(m.id)

        self.assertEqual(self.reporte().recoleccion, 'tercero')

    def test_sin_placas_queda_en_blanco_y_no_dice_tercero(self):
        """Vacio es "todavia no se sabe". Decir 'tercero' seria afirmar algo que
        nadie ha capturado."""
        m = self.maniobra(placas_pis='')
        self.poner_folio(m.id)
        self.assertEqual(self.reporte().recoleccion, '')

    def test_capturar_las_placas_despues_la_rellena(self):
        """El caso normal: el folio va primero (usuario, 2026-09-03)."""
        self.tracto_propio('93-AF-2K')
        m = self.maniobra()
        self.poner_folio(m.id)
        self.assertEqual(self.reporte().recoleccion, '')

        self.patch(m.id, placas_pis='93-AF-2K')

        self.assertEqual(self.reporte().recoleccion, 'propio')

    def test_no_pisa_la_que_eligio_el_coordinador(self):
        """El reporte se FIRMA: lo que hay escrito ahi manda sobre lo que diga
        la maniobra despues."""
        self.tracto_propio('93-AF-2K')
        m = self.maniobra()
        self.poner_folio(m.id)
        self.cliente.patch(f'{REPORTES}{self.reporte().id}/',
                           {'recoleccion': 'tercero'}, format='json')

        self.patch(m.id, placas_pis='93-AF-2K')

        self.assertEqual(self.reporte().recoleccion, 'tercero')


class CoordinadorDelChoferTests(BaseReporteAutomatico):
    """Para esto existe la columna COORDINADOR en el catalogo de Choferes."""

    def test_el_coordinador_sale_del_chofer_del_viaje(self):
        self.chofer('JUAN PEREZ', coordinador='ANA LOPEZ')
        m = self.maniobra(asignacion_operador_status='JUAN PEREZ')

        self.poner_folio(m.id)

        self.assertEqual(self.reporte().coordinador, 'ANA LOPEZ')

    def test_un_chofer_sin_coordinador_deja_el_campo_vacio(self):
        self.chofer('JUAN PEREZ', coordinador=None)
        m = self.maniobra(asignacion_operador_status='JUAN PEREZ')
        self.poner_folio(m.id)
        self.assertEqual(self.reporte().coordinador, '')

    def test_un_operador_que_no_esta_en_el_catalogo_no_revienta(self):
        """`asignacion_operador_status` admite tambien operadores de tercero,
        que no estan en `choferes`."""
        m = self.maniobra(asignacion_operador_status='NO ESTA EN EL CATALOGO')
        self.poner_folio(m.id)
        self.assertEqual(self.reporte().coordinador, '')

    def test_capturar_el_operador_despues_rellena_el_coordinador(self):
        """El folio suele ponerse antes de saber quien lo llevara."""
        self.chofer('JUAN PEREZ', coordinador='ANA LOPEZ')
        m = self.maniobra()
        self.poner_folio(m.id)
        self.assertEqual(self.reporte().coordinador, '')

        self.patch(m.id, asignacion_operador_status='JUAN PEREZ')

        reporte = self.reporte()
        self.assertEqual(reporte.operador,    'JUAN PEREZ')
        self.assertEqual(reporte.coordinador, 'ANA LOPEZ')

    def test_no_pisa_el_coordinador_que_ya_estaba_escrito(self):
        self.chofer('JUAN PEREZ', coordinador='ANA LOPEZ')
        m = self.maniobra()
        self.poner_folio(m.id)
        self.cliente.patch(f'{REPORTES}{self.reporte().id}/',
                           {'coordinador': 'OTRO'}, format='json')

        self.patch(m.id, asignacion_operador_status='JUAN PEREZ')

        self.assertEqual(self.reporte().coordinador, 'OTRO')

    def test_cada_folio_lleva_el_coordinador_de_su_operador(self):
        """Un Full repartido puede llevar dos coordinadores distintos."""
        self.chofer('JUAN PEREZ', coordinador='ANA LOPEZ')
        self.chofer('LUIS GOMEZ', coordinador='PEDRO RUIZ')
        m = self.maniobra(asignacion_operador_status='JUAN PEREZ',
                          operador_2='LUIS GOMEZ')

        self.patch(m.id, folio='F-2279', folio_2='R-2280')

        self.assertEqual(self.reporte('F-2279').coordinador, 'ANA LOPEZ')
        self.assertEqual(self.reporte('R-2280').coordinador, 'PEDRO RUIZ')


class PrecargaAlAbrirloAManoTests(BaseReporteAutomatico):
    """El reporte que se abre A MANO precarga lo mismo que el automatico.

    Los folios viejos —y los de un viaje de tercero, que no abre reporte solo—
    se siguen capturando eligiendo el folio en la pantalla de Reportes de viaje.
    Ese modal lee /maniobras/folios-recientes/, asi que RECOLECCION y COORDINADOR
    viajan ya resueltos desde ahi: si se calcularan en el navegador serian una
    segunda copia de la regla, y dos copias se separan.
    """
    FOLIOS = '/api/maniobras/folios-recientes/'

    def ofrecidos(self):
        r = self.cliente.get(self.FOLIOS)
        self.assertEqual(r.status_code, 200, r.data)
        return {f['folio']: f for f in r.data}

    def test_manda_el_coordinador_del_chofer_de_cada_folio(self):
        self.chofer('JUAN PEREZ', coordinador='ANA LOPEZ')
        self.chofer('LUIS GOMEZ', coordinador='PEDRO RUIZ')
        self.maniobra(folio='F-2279', asignacion_operador_status='JUAN PEREZ',
                      folio_2='R-2280', operador_2='LUIS GOMEZ')

        folios = self.ofrecidos()

        self.assertEqual(folios['F-2279']['coordinador'], 'ANA LOPEZ')
        self.assertEqual(folios['R-2280']['coordinador'], 'PEDRO RUIZ')

    def test_manda_la_recoleccion_del_puerto(self):
        self.tracto_propio('93-AF-2K')
        self.maniobra(folio='F-2279', placas_pis='93-AF-2K')
        self.maniobra(folio='F-3000', placas_pis='ZZ-99-XX')

        folios = self.ofrecidos()

        self.assertEqual(folios['F-2279']['recoleccion'], 'propio')
        self.assertEqual(folios['F-3000']['recoleccion'], 'tercero')

    def test_lo_que_no_se_sabe_viaja_vacio_y_no_a_medias(self):
        """Sin placas y con un operador que no esta en el catalogo, los dos
        campos llegan en blanco para elegirlos a mano."""
        self.maniobra(folio='F-2279', asignacion_operador_status='DE UN TERCERO')

        folio = self.ofrecidos()['F-2279']

        self.assertEqual(folio['recoleccion'], '')
        self.assertEqual(folio['coordinador'], '')

    def test_un_viaje_de_tercero_tambien_los_trae(self):
        """No abre reporte solo, pero cuando alguien lo abre a mano el modal
        tiene que precargar igual."""
        self.tracto_propio('93-AF-2K')
        self.chofer('JUAN PEREZ', coordinador='ANA LOPEZ')
        self.maniobra(folio='F-2279', transportista='BSH', tercero='tercero',
                      placas_pis='93-AF-2K',
                      asignacion_operador_status='JUAN PEREZ')

        folio = self.ofrecidos()['F-2279']

        self.assertEqual(ReporteViaje.objects.count(), 0)   # no se abrio solo
        self.assertEqual(folio['recoleccion'], 'propio')
        self.assertEqual(folio['coordinador'], 'ANA LOPEZ')

    def test_manda_el_dia_de_ruta_inicio_ya_resuelto(self):
        """El modal precarga la FECHA con esto. Viaja calculado en la hora de
        operacion para que el reporte abierto a mano y el que abre solo el folio
        digan el mismo dia — 18:00 de aqui es del dia siguiente en UTC."""
        self.maniobra(folio='F-2279',
                      ruta_inicio=datetime(2026, 1, 13, 0, 0, tzinfo=tz.utc))

        folio = self.ofrecidos()['F-2279']

        self.assertEqual(folio['fecha_ruta_inicio'], '2026-01-12')

    def test_sin_ruta_inicio_el_dia_viaja_vacio(self):
        self.maniobra(folio='F-2279')
        self.assertEqual(self.ofrecidos()['F-2279']['fecha_ruta_inicio'], '')

    def test_una_sola_consulta_para_todos_los_coordinadores(self):
        """El selector ofrece hasta 50 folios: resolver el chofer folio a folio
        seria una consulta por fila cada vez que se abre el desplegable."""
        for numero in range(1, 21):
            self.chofer('CHOFER %s' % numero, coordinador='COORD %s' % numero)
            self.maniobra(folio='F-%s' % numero, placas_pis='ZZ-99-XX',
                          asignacion_operador_status='CHOFER %s' % numero)

        # Tres y solo tres, suban los folios a los que suban: las maniobras, el
        # catalogo de tractos y el de choferes, cada uno de una tacada.
        with self.assertNumQueries(3, using='standard'):
            self.cliente.get(self.FOLIOS)


class FechaDelViajeTests(BaseReporteAutomatico):
    """La FECHA del reporte sale de RUTA INICIO, y la hora real vuelve alli.

    El capturista anota el dia de salida sin saber la hora, asi que RUTA INICIO
    queda a las 00:00. Dias despues el coordinador escribe en su reporte la hora
    real, y esa vuelve a la maniobra: sin el viaje de vuelta las dos fechas se
    quedan distintas para siempre (usuario, 2026-09-03).
    """
    REPORTES = '/api/reportes-viaje/'

    def test_la_fecha_del_reporte_es_el_dia_de_ruta_inicio(self):
        m = self.maniobra(ruta_inicio=datetime(2026, 1, 12, 6, 0, tzinfo=tz.utc))

        self.poner_folio(m.id)

        self.assertEqual(str(self.reporte().fecha), '2026-01-12')

    def test_el_dia_se_lee_en_la_hora_de_operacion_no_en_utc(self):
        """Una salida de las 18:00 de aqui ya es del dia siguiente en UTC.
        Recortando la fecha sobre el ISO, TODA salida de tarde saldria con el dia
        equivocado — y nadie lo notaria hasta ver el papel."""
        # 2026-01-13 00:00 UTC == 2026-01-12 18:00 en Manzanillo.
        m = self.maniobra(ruta_inicio=datetime(2026, 1, 13, 0, 0, tzinfo=tz.utc))

        self.poner_folio(m.id)

        self.assertEqual(str(self.reporte().fecha), '2026-01-12')

    def test_sin_ruta_inicio_la_fecha_queda_vacia(self):
        m = self.maniobra()
        self.poner_folio(m.id)
        self.assertIsNone(self.reporte().fecha)

    def test_capturar_ruta_inicio_despues_rellena_la_fecha(self):
        """El folio se asigna antes de saber cuando sale, como todo lo demas."""
        m = self.maniobra()
        self.poner_folio(m.id)
        self.assertIsNone(self.reporte().fecha)

        self.patch(m.id, ruta_inicio='2026-01-12T06:00:00Z')

        self.assertEqual(str(self.reporte().fecha), '2026-01-12')

    def test_no_pisa_la_fecha_que_ya_escribio_el_coordinador(self):
        m = self.maniobra()
        self.poner_folio(m.id)
        self.cliente.patch(f'{self.REPORTES}{self.reporte().id}/',
                           {'fecha': '2026-02-02'}, format='json')

        self.patch(m.id, ruta_inicio='2026-01-12T06:00:00Z')

        self.assertEqual(str(self.reporte().fecha), '2026-02-02')

    # ── El viaje de vuelta ───────────────────────────────────────────────
    def test_la_salida_real_vuelve_a_ruta_inicio(self):
        """El caso que motiva la regla: 12/01 00:00 pasa a 12/01 13:37."""
        m = self.maniobra(ruta_inicio=datetime(2026, 1, 12, 6, 0, tzinfo=tz.utc))
        self.poner_folio(m.id)
        salida = '2026-01-12T19:37:00Z'      # 13:37 en Manzanillo

        self.cliente.patch(f'{self.REPORTES}{self.reporte().id}/',
                           {'salida_real': salida}, format='json')

        m.refresh_from_db()
        self.assertEqual(m.ruta_inicio, datetime(2026, 1, 12, 19, 37, tzinfo=tz.utc))

    def test_pisa_aunque_ya_hubiera_una_hora_puesta(self):
        """Siempre, decision del usuario: el reporte es lo que paso de verdad."""
        m = self.maniobra(ruta_inicio=datetime(2026, 1, 12, 15, 0, tzinfo=tz.utc))
        self.poner_folio(m.id)

        self.cliente.patch(f'{self.REPORTES}{self.reporte().id}/',
                           {'salida_real': '2026-01-12T19:37:00Z'}, format='json')

        m.refresh_from_db()
        self.assertEqual(m.ruta_inicio.hour, 19)

    def test_una_salida_de_otro_dia_mueve_la_maniobra_de_dia(self):
        """Se copia ENTERA, dia incluido (usuario, 2026-09-03). Se fija aqui
        porque `ruta_inicio` alimenta la torre de control: la consecuencia es que
        la maniobra tambien se mueve alli."""
        m = self.maniobra(ruta_inicio=datetime(2026, 1, 12, 6, 0, tzinfo=tz.utc))
        self.poner_folio(m.id)

        self.cliente.patch(f'{self.REPORTES}{self.reporte().id}/',
                           {'salida_real': '2026-01-13T15:00:00Z'}, format='json')

        m.refresh_from_db()
        self.assertEqual(m.ruta_inicio, datetime(2026, 1, 13, 15, 0, tzinfo=tz.utc))

    def test_sin_salida_real_no_toca_la_maniobra(self):
        m = self.maniobra(ruta_inicio=datetime(2026, 1, 12, 6, 0, tzinfo=tz.utc))
        self.poner_folio(m.id)

        self.cliente.patch(f'{self.REPORTES}{self.reporte().id}/',
                           {'comentarios': 'algo'}, format='json')

        m.refresh_from_db()
        self.assertEqual(m.ruta_inicio, datetime(2026, 1, 12, 6, 0, tzinfo=tz.utc))

    def test_un_reporte_sin_maniobra_no_revienta(self):
        """Un folio viejo, capturado a mano, sin maniobra que le corresponda."""
        r = self.cliente.post(self.REPORTES, {
            'folio': 'SIN-MANIOBRA', 'salida_real': '2026-01-12T19:37:00Z',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)


class FechaDeRutaInicioNaiveTests(SimpleTestCase):
    """`maniobras.ruta_inicio` es `timestamp WITHOUT time zone` en la base de
    verdad, aunque el modelo diga DateTimeField: la tabla es managed=False.

    Django devuelve entonces un datetime NAIVE y localtime() revienta con uno.
    Esto costo un 500 en la primera lectura contra la base real, y las pruebas de
    arriba no lo ven porque settings_test crea la columna DESDE el modelo, o sea
    con zona. De ahi que esta prueba llame al helper con un naive a mano.
    """

    def dia(self, instante):
        return _fecha_de_ruta_inicio(Maniobra(ruta_inicio=instante))

    def test_un_naive_se_lee_como_UTC(self):
        # Lo guardado es UTC: settings.TIME_ZONE es 'UTC' y por eso la API
        # devuelve estos valores con la Z. 06:00Z son las 00:00 en Manzanillo.
        self.assertEqual(self.dia(datetime(2026, 1, 12, 6, 0)), date(2026, 1, 12))

    def test_un_naive_de_tarde_no_se_va_al_dia_siguiente(self):
        # 2026-01-13 00:00 UTC son las 18:00 del 12 aqui.
        self.assertEqual(self.dia(datetime(2026, 1, 13, 0, 0)), date(2026, 1, 12))

    def test_un_aware_sigue_funcionando(self):
        self.assertEqual(self.dia(datetime(2026, 1, 13, 0, 0, tzinfo=tz.utc)),
                         date(2026, 1, 12))

    def test_sin_fecha_no_hay_dia(self):
        self.assertIsNone(self.dia(None))
