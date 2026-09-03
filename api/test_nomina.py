"""La tabla de Nomina y su calendario de vacaciones.

Lo que se cubre es lo que decidiria mal en silencio, que aqui es casi todo
porque son numeros que nadie recalcula a mano:

  · la escalera de dias de vacaciones y, sobre todo, sus BORDES — el dia del
    aniversario, que es cuando cambian los dias y con ellos la prima;
  · que `empleados.fecha_ingreso` es texto libre (varchar, no date): un registro
    viejo con cualquier cosa escrita no puede acabar dando una antiguedad
    inventada, tiene que dar cero;
  · la prima vacacional, que es la unica formula de dinero de la pantalla;
  · que la nomina lista el CATALOGO y no su propia tabla, o un empleado sin
    sueldo capturado no tendria fila donde escribirselo;
  · que es admin-only. Son sueldos: si el candado se cae, se cae en silencio.
  · que dos empleados no pueden salir de vacaciones el mismo dia, que es la
    razon de ser del calendario.

Decisiones del usuario (2026-09-03): el sueldo es SEMANAL (de ahi el /7), los
dias tomados se capturan a mano y el calendario va aparte, y un empleado con
fecha de salida sigue saliendo en la tabla para poder cerrarle el finiquito.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from api.models import (Empleado, NominaEmpleado, VacacionDia,
                        anios_cumplidos, dias_de_vacaciones, fecha_de_ingreso)

NOMINA = '/api/nomina/'
VACACIONES = '/api/vacaciones/'


def hace_anios(n, dias=0):
    """La misma fecha de hoy hace `n` años (menos `dias`), sin reventar en bisiesto."""
    hoy = date.today()
    try:
        fecha = hoy.replace(year=hoy.year - n)
    except ValueError:          # 29 de febrero en un año que no lo tiene
        fecha = hoy.replace(year=hoy.year - n, day=28)
    return fecha - timedelta(days=dias)


class EscaleraDeVacacionesTests(SimpleTestCase):
    """La tabla que dicto el usuario, tramo a tramo. Sin BD: es aritmetica."""

    def test_cada_tramo_da_los_dias_que_toca(self):
        esperado = {
            0: 0,
            1: 12, 2: 14, 3: 16, 4: 18, 5: 20,
            6: 22, 8: 22, 10: 22,
            11: 24, 13: 24, 15: 24,
            16: 26, 18: 26, 20: 26,
            21: 28, 23: 28, 25: 28,
            26: 30, 28: 30, 30: 30,
        }
        for anios, dias in esperado.items():
            self.assertEqual(dias_de_vacaciones(anios), dias, f'{anios} años')

    def test_por_debajo_del_año_no_hay_dias(self):
        """El primer tramo es el unico que da cero, y es el que mas gente tiene."""
        self.assertEqual(dias_de_vacaciones(0), 0)

    def test_pasados_los_30_se_queda_en_30(self):
        """No se dijo que pasa a partir de ahi (ver el comentario del modelo):
        se queda en el ultimo tramo conocido en vez de inventar."""
        self.assertEqual(dias_de_vacaciones(31), 30)
        self.assertEqual(dias_de_vacaciones(45), 30)


class AntiguedadTests(SimpleTestCase):
    """Años CUMPLIDOS. El borde es el aniversario, y es el que mueve la prima."""

    def test_la_vispera_del_aniversario_todavia_no_cuenta(self):
        # Entro el 30/01/2022; el 29/01/2027 lleva 4 años, no 5.
        self.assertEqual(anios_cumplidos(date(2022, 1, 30), date(2027, 1, 29)), 4)

    def test_el_dia_del_aniversario_ya_cuenta(self):
        self.assertEqual(anios_cumplidos(date(2022, 1, 30), date(2027, 1, 30)), 5)

    def test_el_ejemplo_del_usuario(self):
        """Entro el 30/01/2022: a dia de hoy (2026) lleva 4 años."""
        self.assertEqual(anios_cumplidos(date(2022, 1, 30), date(2026, 9, 3)), 4)

    def test_sin_fecha_de_ingreso_es_cero_y_no_revienta(self):
        self.assertEqual(anios_cumplidos(None), 0)

    def test_una_fecha_futura_no_da_antiguedad_negativa(self):
        self.assertEqual(anios_cumplidos(date(2030, 1, 1), date(2026, 9, 3)), 0)


class FechaDeIngresoTests(SimpleTestCase):
    """`empleados.fecha_ingreso` es varchar: admite cualquier cosa."""

    def leer(self, texto):
        return fecha_de_ingreso(Empleado(nombre_trabajador='X', fecha_ingreso=texto))

    def test_lee_el_formato_que_escribe_el_formulario(self):
        self.assertEqual(self.leer('2022-01-30'), date(2022, 1, 30))

    def test_lo_que_no_sea_una_fecha_cuenta_como_sin_fecha(self):
        """Un registro viejo con texto tecleado a mano no puede acabar dando una
        antiguedad inventada: mejor cero, que se ve, que un numero que miente."""
        for basura in ('30/01/2022', 'ENERO 2022', '', None, '2022', 'ayer'):
            self.assertIsNone(self.leer(basura), repr(basura))

    def test_una_fecha_que_no_existe_tampoco_pasa(self):
        self.assertIsNone(self.leer('2026-02-31'))

    def test_un_date_de_verdad_se_acepta_tal_cual(self):
        """La columna REAL es `date` aunque el modelo diga CharField: Django
        devuelve un objeto date. Esto costo un 500 en la primera lectura contra
        la base de verdad, y esta prueba no lo habria visto sola —settings_test
        crea la tabla desde el modelo— asi que se fija aqui explicitamente."""
        self.assertEqual(self.leer(date(2022, 1, 30)), date(2022, 1, 30))


class BaseNomina(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # `empleados` es managed=False y settings_test no la crea. Las dos tablas
        # de nomina si son managed, asi que salen solas de los modelos.
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Empleado)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Empleado)
        super().tearDownClass()

    def setUp(self):
        self.admin = get_user_model().objects.create_user(
            'jefa', password='x', is_staff=True)
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.admin)

    def empleado(self, nombre='ANA LOPEZ', cargo='Coordinador', ingreso=None, salida=None):
        return Empleado.objects.create(
            nombre_trabajador=nombre, cargo=cargo,
            fecha_ingreso=ingreso.isoformat() if isinstance(ingreso, date) else (ingreso or ''),
            fecha_salida=salida,
        )

    def filas(self):
        r = self.cliente.get(NOMINA)
        self.assertEqual(r.status_code, 200, r.data)
        return {f['nombre']: f for f in r.data}

    def guardar(self, empleado, **campos):
        return self.cliente.patch(f'{NOMINA}{empleado.id}/', campos, format='json')


class LaTablaListaElCatalogoTests(BaseNomina):

    def test_un_empleado_sin_nada_capturado_ya_tiene_fila(self):
        """Si la tabla listara la nomina y no el catalogo, no habria donde
        escribirle el primer sueldo."""
        self.empleado()

        fila = self.filas()['ANA LOPEZ']

        self.assertIsNone(fila['id'])           # todavia no hay fila guardada
        self.assertIsNone(fila['sueldo'])
        self.assertEqual(NominaEmpleado.objects.count(), 0)

    def test_el_nombre_y_el_puesto_salen_del_catalogo(self):
        self.empleado(nombre='LUIS GOMEZ', cargo='Operador')

        fila = self.filas()['LUIS GOMEZ']

        self.assertEqual(fila['puesto'], 'Operador')

    def test_el_nombre_y_el_puesto_no_se_pueden_cambiar_desde_nomina(self):
        """Son del catalogo: dos versiones del mismo nombre es justo lo que se
        evita leyendolos de alli."""
        empleado = self.empleado()

        self.guardar(empleado, nombre='OTRA', puesto='Gerente')

        empleado.refresh_from_db()
        self.assertEqual(empleado.nombre_trabajador, 'ANA LOPEZ')
        self.assertEqual(empleado.cargo, 'Coordinador')

    def test_la_fila_nace_en_la_primera_escritura(self):
        empleado = self.empleado()

        r = self.guardar(empleado, sueldo='7000')

        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(NominaEmpleado.objects.count(), 1)
        self.assertEqual(NominaEmpleado.objects.get().sueldo, Decimal('7000.00'))

    def test_escribir_dos_veces_no_crea_dos_filas(self):
        empleado = self.empleado()
        self.guardar(empleado, sueldo='7000')
        self.guardar(empleado, finiquito='1200')
        self.assertEqual(NominaEmpleado.objects.count(), 1)

    def test_un_empleado_dado_de_baja_sigue_saliendo(self):
        """Con fecha de salida se queda en la tabla, marcado, para poder cerrarle
        el finiquito despues de la baja (usuario, 2026-09-03)."""
        self.empleado(nombre='SE FUE', salida=date(2026, 8, 1))

        fila = self.filas()['SE FUE']

        self.assertEqual(fila['fecha_salida'], '2026-08-01')

    def test_un_empleado_inexistente_da_404_y_no_crea_nada(self):
        r = self.cliente.patch(f'{NOMINA}9999/', {'sueldo': '1'}, format='json')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(NominaEmpleado.objects.count(), 0)


class CalculosDeLaFilaTests(BaseNomina):

    def test_los_dias_de_vacaciones_salen_de_la_fecha_de_ingreso(self):
        self.empleado(ingreso=hace_anios(4))

        fila = self.filas()['ANA LOPEZ']

        self.assertEqual(fila['antiguedad_anios'], 4)
        self.assertEqual(fila['dias_vacaciones'], 18)

    def test_la_vispera_del_aniversario_todavia_no_sube(self):
        """El borde que mueve la prima de toda la plantilla."""
        self.empleado(ingreso=hace_anios(5, dias=-1))   # cumple 5 mañana

        fila = self.filas()['ANA LOPEZ']

        self.assertEqual(fila['antiguedad_anios'], 4)
        self.assertEqual(fila['dias_vacaciones'], 18)

    def test_menos_de_un_año_no_lleva_dias(self):
        self.empleado(ingreso=date.today() - timedelta(days=30))
        self.assertEqual(self.filas()['ANA LOPEZ']['dias_vacaciones'], 0)

    def test_una_fecha_de_ingreso_ilegible_no_inventa_antiguedad(self):
        self.empleado(ingreso='ENERO 2020')
        fila = self.filas()['ANA LOPEZ']
        self.assertEqual(fila['antiguedad_anios'], 0)
        self.assertEqual(fila['dias_vacaciones'], 0)

    def test_la_prima_es_el_salario_diario_por_los_dias_por_025(self):
        """Sueldo SEMANAL 7000 → diario 1000; 4 años → 18 dias.
        1000 × 18 × 0.25 = 4500."""
        empleado = self.empleado(ingreso=hace_anios(4))
        self.guardar(empleado, sueldo='7000')

        self.assertEqual(Decimal(self.filas()['ANA LOPEZ']['prima_vacacional']),
                         Decimal('4500.00'))

    def test_sin_sueldo_la_prima_esta_vacia_y_no_es_cero(self):
        """"Todavia no se ha capturado" no es "no le toca prima"."""
        self.empleado(ingreso=hace_anios(4))
        self.assertIsNone(self.filas()['ANA LOPEZ']['prima_vacacional'])

    def test_sin_antiguedad_la_prima_es_cero_aunque_haya_sueldo(self):
        empleado = self.empleado(ingreso=date.today())
        self.guardar(empleado, sueldo='7000')
        self.assertEqual(Decimal(self.filas()['ANA LOPEZ']['prima_vacacional']),
                         Decimal('0.00'))

    def test_la_prima_no_se_guarda_en_ninguna_columna(self):
        """Es lo que permite que cambie sola en el aniversario. Si estuviera
        guardada, ese dia se quedaria con el numero del año pasado."""
        empleado = self.empleado(ingreso=hace_anios(4))
        self.guardar(empleado, sueldo='7000')
        self.assertFalse(hasattr(NominaEmpleado.objects.get(), 'prima_vacacional_guardada'))
        self.assertNotIn('prima_vacacional',
                         [f.name for f in NominaEmpleado._meta.get_fields()])


class DiasTomadosTests(BaseNomina):
    """Se capturan a mano, con la misma suma desglosada que las celdas de Gastos.
    El calendario va aparte (usuario, 2026-09-03)."""

    def test_se_guarda_el_total_y_el_desglose_aparte(self):
        empleado = self.empleado()

        r = self.guardar(empleado, dias_tomados='8',
                         formulas={'dias_tomados': '=5+3'})

        self.assertEqual(r.status_code, 200, r.data)
        fila = NominaEmpleado.objects.get()
        self.assertEqual(fila.dias_tomados, Decimal('8.00'))
        self.assertEqual(fila.formulas, {'dias_tomados': '=5+3'})

    def test_una_formula_en_un_campo_que_no_la_admite_se_rechaza(self):
        """`formulas` es un jsonb abierto: el front no es una frontera de
        confianza."""
        empleado = self.empleado()
        r = self.guardar(empleado, formulas={'sueldo': '=1+1'})
        self.assertEqual(r.status_code, 400, r.data)

    def test_una_formula_que_no_es_una_suma_se_rechaza(self):
        empleado = self.empleado()
        r = self.guardar(empleado, formulas={'dias_tomados': '=__import__("os")'})
        self.assertEqual(r.status_code, 400, r.data)


class SoloAdminTests(BaseNomina):
    """Son sueldos. El candado tiene que fallar en ruidoso, no en silencio."""

    def setUp(self):
        super().setUp()
        self.raso = get_user_model().objects.create_user('capturista', password='x')
        self.suyo = APIClient()
        self.suyo.force_authenticate(user=self.raso)

    def test_un_usuario_no_admin_no_puede_leer_la_nomina(self):
        self.empleado()
        self.assertEqual(self.suyo.get(NOMINA).status_code, 403)

    def test_un_usuario_no_admin_no_puede_escribirla(self):
        empleado = self.empleado()
        r = self.suyo.patch(f'{NOMINA}{empleado.id}/', {'sueldo': '99999'}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(NominaEmpleado.objects.count(), 0)

    def test_tampoco_el_calendario(self):
        self.assertEqual(self.suyo.get(VACACIONES).status_code, 403)

    def test_sin_sesion_tampoco(self):
        self.assertIn(APIClient().get(NOMINA).status_code, (401, 403))


class CalendarioDeVacacionesTests(BaseNomina):

    def crear(self, empleado, desde, hasta=None, **extra):
        cuerpo = {'empleado': empleado.id, 'desde': desde}
        if hasta:
            cuerpo['hasta'] = hasta
        cuerpo.update(extra)
        return self.cliente.post(VACACIONES, cuerpo, format='json')

    def test_un_rango_crea_todos_sus_dias_de_una_vez(self):
        """Unas vacaciones son una semana, no una fecha: si hubiera que dar de
        alta dia a dia, serian cinco peticiones desde la pantalla."""
        empleado = self.empleado()

        r = self.crear(empleado, '2026-09-07', '2026-09-11', color='#ff0000')

        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(VacacionDia.objects.count(), 5)
        self.assertEqual(VacacionDia.objects.first().color, '#ff0000')

    def test_sin_fecha_final_es_un_solo_dia(self):
        empleado = self.empleado()
        self.crear(empleado, '2026-09-07')
        self.assertEqual(VacacionDia.objects.count(), 1)

    def test_dos_empleados_no_pueden_salir_el_mismo_dia(self):
        """Es la razon de ser del calendario."""
        ana = self.empleado(nombre='ANA')
        luis = self.empleado(nombre='LUIS')
        self.crear(ana, '2026-09-07')

        r = self.crear(luis, '2026-09-07')

        self.assertEqual(r.status_code, 400, r.data)
        self.assertEqual(VacacionDia.objects.count(), 1)

    def test_el_choque_dice_de_quien_es_el_dia(self):
        """"Ya esta ocupado" sin decir por quien obliga a ir a buscarlo."""
        ana = self.empleado(nombre='ANA')
        luis = self.empleado(nombre='LUIS')
        self.crear(ana, '2026-09-07')

        r = self.crear(luis, '2026-09-07')

        self.assertIn('ANA', str(r.data))

    def test_un_choque_a_mitad_del_rango_no_deja_media_semana_puesta(self):
        """Media alta hecha es peor que ninguna, porque nadie se entera."""
        ana = self.empleado(nombre='ANA')
        luis = self.empleado(nombre='LUIS')
        self.crear(ana, '2026-09-09')

        r = self.crear(luis, '2026-09-07', '2026-09-11')

        self.assertEqual(r.status_code, 400, r.data)
        self.assertEqual(VacacionDia.objects.count(), 1)   # solo el de ANA

    def test_el_rango_al_reves_se_rechaza(self):
        empleado = self.empleado()
        r = self.crear(empleado, '2026-09-11', '2026-09-07')
        self.assertEqual(r.status_code, 400)

    def test_un_rango_desmesurado_se_rechaza(self):
        """Llega del cliente: sin tope, un año 2999 intentaria crear cientos de
        miles de filas."""
        empleado = self.empleado()
        r = self.crear(empleado, '2026-01-01', '2030-12-31')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(VacacionDia.objects.count(), 0)

    def test_un_color_que_no_es_un_color_se_rechaza(self):
        """El valor acaba en el CSS del calendario."""
        empleado = self.empleado()
        r = self.crear(empleado, '2026-09-07', color='javascript:alert(1)')
        self.assertEqual(r.status_code, 400, r.data)

    def test_solo_llegan_los_dias_del_año_que_se_mira(self):
        empleado = self.empleado()
        self.crear(empleado, '2026-09-07')
        self.crear(empleado, '2027-03-02')

        r = self.cliente.get(VACACIONES, {'anio': 2026})

        self.assertEqual([d['fecha'] for d in r.data], ['2026-09-07'])

    def test_borrar_un_dia_lo_libera(self):
        ana = self.empleado(nombre='ANA')
        luis = self.empleado(nombre='LUIS')
        self.crear(ana, '2026-09-07')
        dia = VacacionDia.objects.get()

        self.cliente.delete(f'{VACACIONES}{dia.id}/')

        self.assertEqual(self.crear(luis, '2026-09-07').status_code, 201)

    def test_editar_un_dia_no_choca_consigo_mismo(self):
        empleado = self.empleado()
        self.crear(empleado, '2026-09-07')
        dia = VacacionDia.objects.get()

        r = self.cliente.patch(f'{VACACIONES}{dia.id}/',
                               {'nota': 'playa'}, format='json')

        self.assertEqual(r.status_code, 200, r.data)

    def test_sin_nota_ni_color_se_guarda_igual(self):
        """El apiClient del frontend manda null donde la pantalla dejo un campo
        vacio, y las dos columnas son NOT NULL. Sin esto, registrar unas
        vacaciones sin nota daria un 400 que solo se ve en el navegador."""
        empleado = self.empleado()

        r = self.cliente.post(VACACIONES, {
            'empleado': empleado.id, 'desde': '2026-09-07',
            'nota': None, 'color': None,
        }, format='json')

        self.assertEqual(r.status_code, 201, r.data)
        dia = VacacionDia.objects.get()
        self.assertEqual(dia.nota, '')
        self.assertEqual(dia.color, '')

    def test_un_dia_de_otro_año_se_puede_quitar(self):
        """El `?anio` acota la LISTA. Cuando acotaba tambien el detalle, borrar o
        editar un dia que no fuera del año en curso daba 404 en silencio — y el
        calendario se quedaba con un dia que ya nadie podia quitar."""
        empleado = self.empleado()
        self.crear(empleado, '2099-03-02')
        dia = VacacionDia.objects.get()

        r = self.cliente.delete(f'{VACACIONES}{dia.id}/')

        self.assertEqual(r.status_code, 204, r.data if hasattr(r, 'data') else r)
        self.assertEqual(VacacionDia.objects.count(), 0)
