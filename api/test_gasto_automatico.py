"""Al asignar un folio a una maniobra de FRABA se crea su gasto solo.

Lo que se cubre es lo que decidiria mal en silencio: a quien se le crea, cuando,
y sobre todo CUANDO NO — un gasto de mas en un viaje de tercero, o un duplicado
sobre uno que ya tiene importes capturados, se descubriria tarde y a mano.

El hueco que esto cierra es real: 372 maniobras con folio y 9 gastos.

Ver docs/planes/PLAN_GASTO_AUTOMATICO.md (rama main).

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Gasto, Maniobra, ReporteViaje, Vacio

URL = '/api/maniobras/'


class BaseGastoAutomatico(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # `maniobras` y `gastos` son managed=False y settings_test no las crea.
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Maniobra)
            editor.create_model(Gasto)
            # `vacios` tambien: desde la 0061 la maniobra lee de ahi sus fechas y su
            # patio al serializarse, asi que sin esta tabla cualquier lectura revienta.
            editor.create_model(Vacio)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Vacio)
            editor.delete_model(Gasto)
            editor.delete_model(Maniobra)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('capturista', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)

    def crear_maniobra(self, **campos):
        campos.setdefault('solicita', 'PRUEBA')
        return self.cliente.post(URL, campos, format='json')

    def poner_folio(self, maniobra_id, folio='F-2279'):
        return self.cliente.patch(f'{URL}{maniobra_id}/', {'folio': folio}, format='json')


class SeCreaElGastoTests(BaseGastoAutomatico):

    def test_al_asignar_folio_a_una_maniobra_de_fraba_se_crea_el_gasto(self):
        m = Maniobra.objects.create(solicita='PRUEBA', transportista='FRABA CONTAINER')
        self.assertEqual(Gasto.objects.count(), 0)

        r = self.poner_folio(m.id)

        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(Gasto.objects.count(), 1)
        self.assertEqual(Gasto.objects.get().maniobra_id, m.id)

    def test_sin_transportista_tambien_cuenta_como_fraba(self):
        """367 de 409 maniobras lo tienen vacio. Si vacio no contara, el
        automatismo estaria dormido en el 90% de los casos."""
        m = Maniobra.objects.create(solicita='PRUEBA', transportista='')
        self.poner_folio(m.id)
        self.assertEqual(Gasto.objects.count(), 1)

    def test_el_transportista_se_compara_sin_mayusculas_ni_espacios(self):
        """Es texto escrito a mano."""
        m = Maniobra.objects.create(solicita='PRUEBA', transportista='  fraba container ')
        self.poner_folio(m.id)
        self.assertEqual(Gasto.objects.count(), 1)

    def test_crear_la_maniobra_ya_con_folio_tambien_lo_crea(self):
        """El folio se puede elegir en la fila nueva, antes de guardar."""
        r = self.crear_maniobra(folio='F-2279')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Gasto.objects.count(), 1)

    def test_el_gasto_nace_en_ceros_y_con_la_fecha_de_entrega(self):
        m = Maniobra.objects.create(solicita='PRUEBA',
                                    fecha_entrega_mercancia='2026-08-24')
        self.poner_folio(m.id)

        gasto = Gasto.objects.get()
        self.assertEqual(gasto.fecha_entrega_mercancia, '2026-08-24')
        self.assertIsNone(gasto.gasto_diesel)
        self.assertIsNone(gasto.casetas_ida)

    def test_una_maniobra_sin_fecha_de_entrega_no_revienta(self):
        """El modelo dice DateField pero la columna real es TEXT: str() la deja
        igual venga como venga, isoformat() reventaria sobre una cadena."""
        m = Maniobra.objects.create(solicita='PRUEBA')
        self.poner_folio(m.id)
        self.assertEqual(Gasto.objects.get().fecha_entrega_mercancia, '')

    def test_queda_registrado_quien_asigno_el_folio(self):
        m = Maniobra.objects.create(solicita='PRUEBA')
        self.poner_folio(m.id)
        self.assertEqual(Gasto.objects.get().created_by, 'capturista')

    def test_el_gasto_lee_el_folio_de_la_maniobra_no_una_copia(self):
        """Por eso cambiar el folio despues no necesita tocar el gasto."""
        m = Maniobra.objects.create(solicita='PRUEBA')
        self.poner_folio(m.id, 'F-2279')

        self.cliente.patch(f'{URL}{m.id}/', {'folio': 'R-2280'}, format='json')

        gasto = self.cliente.get(f'/api/gastos/{Gasto.objects.get().id}/').data
        self.assertEqual(gasto['folio'], 'R-2280')


class NoSeCreaElGastoTests(BaseGastoAutomatico):
    """La mitad que importa: cuando NO debe crearse."""

    def test_un_viaje_de_tercero_no_genera_gasto(self):
        m = Maniobra.objects.create(solicita='PRUEBA', transportista='BSH')

        self.poner_folio(m.id)

        self.assertEqual(Gasto.objects.count(), 0)

    def test_si_la_maniobra_ya_tiene_gasto_no_se_crea_otro(self):
        """gastos.maniobra_id es UNIQUE: un duplicado seria un IntegrityError, y
        pisar el que hay borraria importes ya capturados."""
        m = Maniobra.objects.create(solicita='PRUEBA')
        Gasto.objects.create(maniobra=m, gasto_diesel=1500)

        self.poner_folio(m.id)

        self.assertEqual(Gasto.objects.count(), 1)
        self.assertEqual(Gasto.objects.get().gasto_diesel, 1500)

    def test_cambiar_un_folio_por_otro_no_crea_un_segundo_gasto(self):
        m = Maniobra.objects.create(solicita='PRUEBA')
        self.poner_folio(m.id, 'F-2279')

        self.poner_folio(m.id, 'R-2280')

        self.assertEqual(Gasto.objects.count(), 1)

    def test_editar_cualquier_otra_cosa_no_crea_gasto(self):
        m = Maniobra.objects.create(solicita='PRUEBA', folio='F-2279')

        self.cliente.patch(f'{URL}{m.id}/', {'cliente': 'YAZAKI'}, format='json')

        self.assertEqual(Gasto.objects.count(), 0)

    def test_el_folio_del_segundo_operador_no_dispara_nada(self):
        """Un Full repartido es UNA maniobra con dos folios, y la base solo
        admite un gasto por maniobra. El segundo se anade a mano."""
        m = Maniobra.objects.create(solicita='PRUEBA')

        self.cliente.patch(f'{URL}{m.id}/', {'folio_2': 'R-2280'}, format='json')

        self.assertEqual(Gasto.objects.count(), 0)

    def test_en_un_full_solo_el_primer_folio_crea_gasto(self):
        m = Maniobra.objects.create(solicita='PRUEBA')

        self.poner_folio(m.id, 'F-2279')
        self.cliente.patch(f'{URL}{m.id}/', {'folio_2': 'R-2280'}, format='json')

        self.assertEqual(Gasto.objects.count(), 1)

    def test_quitar_el_folio_no_borra_el_gasto(self):
        """Borrar destruiria importes capturados, y destroy en gastos esta
        reservado a admin."""
        m = Maniobra.objects.create(solicita='PRUEBA')
        self.poner_folio(m.id)

        self.cliente.patch(f'{URL}{m.id}/', {'folio': ''}, format='json')

        self.assertEqual(Gasto.objects.count(), 1)

    def test_crear_una_maniobra_sin_folio_no_crea_gasto(self):
        r = self.crear_maniobra(cliente='YAZAKI')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Gasto.objects.count(), 0)

    def test_los_folios_ya_asignados_siguen_siendo_manuales(self):
        """Sin relleno masivo: una maniobra que ya traia folio de antes no gana
        gasto por el hecho de editarla."""
        m = Maniobra.objects.create(solicita='PRUEBA', folio='F-2279')

        self.cliente.patch(f'{URL}{m.id}/', {'destino': 'GUADALAJARA'}, format='json')

        self.assertEqual(Gasto.objects.count(), 0)


class DieselDelReporteAlGastoTests(BaseGastoAutomatico):
    """El total del diesel del reporte de viaje se vuelca al gasto de ese folio.

    El reporte trae el detalle por parada (litros x precio de hasta cinco cargas);
    el gasto lleva una sola cifra. Como el reporte se captura por etapas, tiene
    que poder pisar lo que hubiera: si respetara lo anterior, la primera carga
    fijaria el valor y las cuatro siguientes nunca llegarian.
    """
    REPORTES = '/api/reportes-viaje/'

    def crear_reporte(self, folio, cargas=None, **extra):
        """Guarda el reporte de ese folio: PATCH si ya existe, POST si no.

        Desde el 2026-09-03 el reporte lo abre solo el automatismo al asignar el
        folio (_crear_reportes_del_folio), asi que en casi todas estas pruebas ya
        esta creado y un POST chocaria contra el UNIQUE de `folio`. Los folios
        que NO pasan por ahi —el de una maniobra creada por ORM, o uno sin
        maniobra— se siguen abriendo con POST, que es justo lo que prueban.

        El volcado del diesel se dispara por igual en las dos vias, que es lo que
        miran estas pruebas.
        """
        cuerpo = {'cargas': cargas or []}
        cuerpo.update(extra)
        reporte = ReporteViaje.objects.filter(folio=folio).first()
        if reporte is None:
            return self.cliente.post(self.REPORTES, {'folio': folio, **cuerpo},
                                     format='json')
        return self.cliente.patch('%s%s/' % (self.REPORTES, reporte.id),
                                  cuerpo, format='json')

    def maniobra_con_gasto(self, folio='F-2279', **campos):
        """Una maniobra de FRABA a la que se le asigna folio: el gasto lo crea
        el automatismo, igual que en produccion."""
        m = Maniobra.objects.create(solicita='PRUEBA', **campos)
        self.poner_folio(m.id, folio)
        return m, Gasto.objects.get(maniobra=m)

    # -- Se vuelca --------------------------------------------------------
    def test_el_total_del_diesel_llega_al_gasto(self):
        m, gasto = self.maniobra_con_gasto()

        r = self.crear_reporte('F-2279', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'}])

        # 200 y no 201: el reporte ya lo abrio el folio, aqui solo se rellena.
        self.assertEqual(r.status_code, 200, r.data)
        gasto.refresh_from_db()
        self.assertEqual(gasto.gasto_diesel, Decimal('7440.00'))

    def test_suma_todas_las_cargas_y_no_solo_una(self):
        m, gasto = self.maniobra_con_gasto()

        self.crear_reporte('F-2279', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'},
            {'orden': 2, 'litros_diesel': '100', 'precio_litro': '24.50'}])

        gasto.refresh_from_db()
        self.assertEqual(gasto.gasto_diesel, Decimal('9890.00'))   # 7440 + 2450

    def test_recalcula_el_total_del_gasto(self):
        """gastos_totales se calcula en Gasto.save(): un UPDATE directo lo
        habria dejado desfasado del diesel que acaba de entrar."""
        m, gasto = self.maniobra_con_gasto()
        gasto.casetas_ida = Decimal('500')
        gasto.save()

        self.crear_reporte('F-2279', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'}])

        gasto.refresh_from_db()
        self.assertEqual(gasto.gastos_totales, Decimal('7940.00'))  # 7440 + 500

    def test_NO_pisa_el_diesel_capturado_a_mano(self):
        """El caso que motivo la regla (usuario, 2026-08-27): alguien anota el
        diesel en Gastos hoy y el coordinador guarda su reporte pasado manana.
        Antes, lo del reporte se llevaba por delante ese trabajo sin avisar."""
        m, gasto = self.maniobra_con_gasto()
        gasto.gasto_diesel = Decimal('10000')
        gasto.save()

        self.crear_reporte('F-2279', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'}])

        gasto.refresh_from_db()
        self.assertEqual(gasto.gasto_diesel, Decimal('10000.00'))

    def test_el_descuadre_se_ve_en_la_lista_de_reportes(self):
        """No basta con no pisar: si nadie se entera, las dos cifras se quedan
        distintas para siempre. El aviso viaja en el propio reporte."""
        m, gasto = self.maniobra_con_gasto()
        gasto.gasto_diesel = Decimal('10000')
        gasto.save()

        r = self.crear_reporte('F-2279', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'}])

        self.assertIs(r.data['diesel_coincide'], False)
        self.assertEqual(Decimal(r.data['diesel_reporte']), Decimal('7440.00'))
        self.assertEqual(Decimal(r.data['diesel_gasto']),   Decimal('10000.00'))

    def test_si_coinciden_no_se_avisa_de_nada(self):
        m, gasto = self.maniobra_con_gasto()
        gasto.gasto_diesel = Decimal('7440')
        gasto.save()

        r = self.crear_reporte('F-2279', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'}])

        self.assertIs(r.data['diesel_coincide'], True)

    def test_sin_diesel_en_el_gasto_no_hay_descuadre_que_avisar(self):
        """El gasto vacio no es un desacuerdo: es justo lo que el reporte viene
        a rellenar."""
        m, gasto = self.maniobra_con_gasto()

        r = self.crear_reporte('F-2279', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'}])

        self.assertIs(r.data['diesel_coincide'], True)   # ya lo acaba de escribir
        gasto.refresh_from_db()
        self.assertEqual(gasto.gasto_diesel, Decimal('7440.00'))

    def test_cuadrarlo_a_mano_devuelve_el_mando_al_reporte(self):
        """Una persona resuelve el descuadre poniendo en Gastos lo que dice el
        reporte. A partir de ahi el importe vuelve a ser del reporte, o su
        siguiente carga se leeria como un descuadre nuevo y no volcaria jamas."""
        m, gasto = self.maniobra_con_gasto()
        gasto.gasto_diesel = Decimal('10000')
        gasto.save()
        rid = self.crear_reporte('F-2279', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'}]).data['id']

        # Se cuadra a mano en Gastos y se vuelve a guardar el reporte.
        self.cliente.patch('/api/gastos/%s/' % gasto.id,
                           {'gasto_diesel': '7440'}, format='json')
        self.cliente.patch('%s%s/' % (self.REPORTES, rid), {'coordinador': 'Ali'},
                           format='json')

        # Y ahora una carga mas: ya puede volcar.
        self.cliente.patch('%s%s/' % (self.REPORTES, rid), {'cargas': [
            {'orden': 2, 'litros_diesel': '100', 'precio_litro': '24.50'}]}, format='json')

        gasto.refresh_from_db()
        self.assertEqual(gasto.gasto_diesel, Decimal('9890.00'))

    def test_anadir_una_carga_despues_actualiza_el_gasto(self):
        """La razon de que pise: el reporte se llena por etapas."""
        m, gasto = self.maniobra_con_gasto()
        rid = self.crear_reporte('F-2279', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'}]).data['id']

        self.cliente.patch('%s%s/' % (self.REPORTES, rid), {'cargas': [
            {'orden': 2, 'litros_diesel': '100', 'precio_litro': '24.50'}]}, format='json')

        gasto.refresh_from_db()
        self.assertEqual(gasto.gasto_diesel, Decimal('9890.00'))

    def test_el_folio_del_segundo_operador_tambien_encuentra_su_gasto(self):
        m = Maniobra.objects.create(solicita='PRUEBA', folio_2='R-2280')
        self.poner_folio(m.id, 'F-2279')
        gasto = Gasto.objects.get(maniobra=m)

        self.crear_reporte('R-2280', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'}])

        gasto.refresh_from_db()
        self.assertEqual(gasto.gasto_diesel, Decimal('7440.00'))

    def test_el_campo_sigue_siendo_editable_a_mano(self):
        """Lo que se escriba en Gastos aguanta hasta que alguien vuelva a guardar
        el reporte (decision del usuario, 2026-08-24)."""
        from api.Serializers import GastoSerializer
        self.assertFalse(GastoSerializer().fields['gasto_diesel'].read_only)

        m, gasto = self.maniobra_con_gasto()
        self.crear_reporte('F-2279', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'}])

        r = self.cliente.patch('/api/gastos/%s/' % gasto.id,
                               {'gasto_diesel': '8000'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        gasto.refresh_from_db()
        self.assertEqual(gasto.gasto_diesel, Decimal('8000.00'))

    # -- No se vuelca -----------------------------------------------------
    def test_sin_gasto_el_reporte_se_guarda_igual(self):
        """Folio antiguo o de tercero: no hay gasto donde volcar y no se crea."""
        Maniobra.objects.create(solicita='PRUEBA', folio='F-9999')

        r = self.crear_reporte('F-9999', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'}])

        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Gasto.objects.count(), 0)

    def test_un_folio_sin_maniobra_no_revienta(self):
        r = self.crear_reporte('INEXISTENTE', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80'}])
        self.assertEqual(r.status_code, 201, r.data)

    def test_una_carga_sin_precio_no_escribe_nada(self):
        """Sin los dos datos no hay importe que volcar, y cero no es lo mismo
        que "todavia no se sabe"."""
        m, gasto = self.maniobra_con_gasto()

        self.crear_reporte('F-2279', [{'orden': 1, 'litros_diesel': '300'}])

        gasto.refresh_from_db()
        self.assertIsNone(gasto.gasto_diesel)

    def test_un_reporte_sin_cargas_no_toca_el_gasto(self):
        m, gasto = self.maniobra_con_gasto()
        gasto.gasto_diesel = Decimal('10000')
        gasto.save()

        self.crear_reporte('F-2279', [], coordinador='Ali')

        gasto.refresh_from_db()
        self.assertEqual(gasto.gasto_diesel, Decimal('10000.00'))

    def test_la_urea_no_entra_en_el_importe(self):
        m, gasto = self.maniobra_con_gasto()

        self.crear_reporte('F-2279', [
            {'orden': 1, 'litros_diesel': '300', 'precio_litro': '24.80',
             'litros_urea': '20', 'total_urea': '496'}])

        gasto.refresh_from_db()
        self.assertEqual(gasto.gasto_diesel, Decimal('7440.00'))


class FechaEntregaSincronizadaTests(BaseGastoAutomatico):
    """La FECHA DE ENTREGA del gasto la manda la maniobra.

    El gasto nace con la que hubiera al asignar el folio, y el caso normal es
    justo el malo: el folio se pone ANTES de saber la fecha, asi que el gasto
    nacia vacio y habia que teclearla otra vez en Gastos.
    """

    def maniobra_con_gasto(self, **campos):
        respuesta = self.crear_maniobra(**campos)
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        maniobra_id = respuesta.data['id']
        self.poner_folio(maniobra_id)
        return maniobra_id

    def fecha_del_gasto(self, maniobra_id):
        return Gasto.objects.get(maniobra_id=maniobra_id).fecha_entrega_mercancia

    def test_ponerla_en_la_maniobra_la_baja_al_gasto_que_nacio_sin_ella(self):
        maniobra_id = self.maniobra_con_gasto()
        self.assertEqual(self.fecha_del_gasto(maniobra_id), '')

        self.cliente.patch(f'{URL}{maniobra_id}/',
                           {'fecha_entrega_mercancia': '2026-08-29'}, format='json')
        self.assertEqual(self.fecha_del_gasto(maniobra_id), '2026-08-29')

    def test_corregirla_en_la_maniobra_la_corrige_en_el_gasto(self):
        maniobra_id = self.maniobra_con_gasto(fecha_entrega_mercancia='2026-08-29')
        self.assertEqual(self.fecha_del_gasto(maniobra_id), '2026-08-29')

        self.cliente.patch(f'{URL}{maniobra_id}/',
                           {'fecha_entrega_mercancia': '2026-09-02'}, format='json')
        self.assertEqual(self.fecha_del_gasto(maniobra_id), '2026-09-02')

    def test_borrarla_en_la_maniobra_la_borra_en_el_gasto(self):
        # Son el mismo dato: dejar la del gasto seria dar por buena una fecha que
        # la maniobra ya dice que no sabe.
        maniobra_id = self.maniobra_con_gasto(fecha_entrega_mercancia='2026-08-29')
        self.cliente.patch(f'{URL}{maniobra_id}/',
                           {'fecha_entrega_mercancia': None}, format='json')
        self.assertEqual(self.fecha_del_gasto(maniobra_id), '')

    def test_editar_otra_cosa_no_toca_la_fecha_del_gasto(self):
        # Lo que se capturo a mano en Gastos sobrevive mientras nadie cambie la
        # fecha en la maniobra.
        maniobra_id = self.maniobra_con_gasto()
        gasto = Gasto.objects.get(maniobra_id=maniobra_id)
        gasto.fecha_entrega_mercancia = '13/05/2026'
        gasto.save()

        self.cliente.patch(f'{URL}{maniobra_id}/', {'destino': 'MANZANILLO'}, format='json')
        self.assertEqual(self.fecha_del_gasto(maniobra_id), '13/05/2026')

    def test_una_maniobra_sin_gasto_no_revienta(self):
        # Tercero: no se le crea gasto (ver _es_de_fraba). Cambiarle la fecha no
        # debe fallar por no encontrar a quien copiarsela.
        respuesta = self.crear_maniobra(transportista='OTRA LINEA', tercero='SI')
        maniobra_id = respuesta.data['id']
        salida = self.cliente.patch(f'{URL}{maniobra_id}/',
                                    {'fecha_entrega_mercancia': '2026-08-29'}, format='json')
        self.assertEqual(salida.status_code, 200, salida.data)
