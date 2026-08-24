"""Pruebas de la asignación de folio a una unidad en la torre de control.

El folio es el ÚNICO vínculo entre la torre y Maniobras, así que lo que se cubre
es lo que rompería ese vínculo en silencio:

  · Un folio asignado queda BLOQUEADO para las demás unidades. Sin esto, dos
    Ecos aparecerían haciendo el mismo viaje y nadie sabría cuál es el bueno.
  · Reasignar sustituye, no acumula: una unidad lleva un folio a la vez.
  · La información de la maniobra se LEE del folio cada vez y no se copia, así
    que editar la maniobra se refleja en la torre sola.
  · Un Full repartido gasta un folio por operador: el folio puede estar en
    `folio` o en `folio_2`, y de eso depende cuál de los dos operadores sale.

Solo corre con:  Manage.py test api --settings=config.settings_test
"""
from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Tracto, Maniobra, TorreFolio, Folio

URL = '/api/torre-folios/'


class BaseFolios(TestCase):
    # Obligatorio en toda prueba con BD de este proyecto: RoleBasedRouter enruta
    # por el alias del hilo. Ver test_infra_bd.py.
    databases = {'default', 'standard'}

    @classmethod
    def setUpClass(cls):
        # `tractos` y `maniobras` son managed=False y settings_test no las crea.
        super().setUpClass()
        with connections['standard'].schema_editor() as editor:
            editor.create_model(Tracto)
            editor.create_model(Maniobra)

    @classmethod
    def tearDownClass(cls):
        with connections['standard'].schema_editor() as editor:
            editor.delete_model(Maniobra)
            editor.delete_model(Tracto)
        super().tearDownClass()

    def setUp(self):
        self.usuario = get_user_model().objects.create_user('folio_user', password='x')
        self.cliente = APIClient()
        self.cliente.force_authenticate(user=self.usuario)
        self.uno = Tracto.objects.create(no_eco='NO. 01', unidad='CASCADIA',
                                         anio=2014, placas='21AX4Y', tipo='trailer')
        self.dos = Tracto.objects.create(no_eco='NO. 02', unidad='INTERNATIONAL',
                                         anio=2006, placas='38AV7C', tipo='trailer')

    def asignar(self, tracto, folio):
        return self.cliente.post(URL, {'tracto': tracto.id, 'folio': folio}, format='json')


class BloqueoDelFolioTests(BaseFolios):

    def test_un_folio_asignado_queda_bloqueado_para_las_demas_unidades(self):
        self.assertEqual(self.asignar(self.uno, '592-1').status_code, 201)

        respuesta = self.asignar(self.dos, '592-1')

        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(TorreFolio.objects.count(), 1)

    def test_el_error_dice_que_unidad_lo_tiene(self):
        """Decir solo "ya está asignado" obliga a ir a buscar cuál lo tiene."""
        self.asignar(self.uno, '592-1')

        respuesta = self.asignar(self.dos, '592-1')

        self.assertIn('NO. 01', respuesta.data['detail'])

    def test_reasignar_el_mismo_folio_a_la_misma_unidad_no_molesta(self):
        self.asignar(self.uno, '592-1')
        self.assertEqual(self.asignar(self.uno, '592-1').status_code, 201)
        self.assertEqual(TorreFolio.objects.count(), 1)


class UnFolioPorUnidadTests(BaseFolios):

    def test_asignar_otro_folio_sustituye_al_anterior(self):
        self.asignar(self.uno, '592-1')
        self.asignar(self.uno, '604')

        self.assertEqual(TorreFolio.objects.count(), 1)
        self.assertEqual(TorreFolio.objects.get().folio, '604')

    def test_el_folio_anterior_vuelve_a_estar_libre_para_otra_unidad(self):
        self.asignar(self.uno, '592-1')
        self.asignar(self.uno, '604')

        self.assertEqual(self.asignar(self.dos, '592-1').status_code, 201)

    def test_quitar_el_folio_libera_la_unidad_de_ese_viaje(self):
        asignacion = self.asignar(self.uno, '592-1').data['id']

        self.assertEqual(self.cliente.delete(URL + str(asignacion) + '/').status_code, 204)
        self.assertEqual(TorreFolio.objects.count(), 0)
        # Y el folio queda libre otra vez.
        self.assertEqual(self.asignar(self.dos, '592-1').status_code, 201)


class DatosInvalidosTests(BaseFolios):

    def test_sin_folio_o_sin_unidad_se_rechaza(self):
        self.assertEqual(
            self.cliente.post(URL, {'tracto': self.uno.id}, format='json').status_code, 400)
        self.assertEqual(
            self.cliente.post(URL, {'folio': '592-1'}, format='json').status_code, 400)

    def test_una_unidad_que_no_existe_se_rechaza(self):
        respuesta = self.cliente.post(URL, {'tracto': 99999, 'folio': '592-1'}, format='json')
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(TorreFolio.objects.count(), 0)

    def test_un_anonimo_no_asigna_nada(self):
        respuesta = APIClient().post(URL, {'tracto': self.uno.id, 'folio': '592-1'},
                                     format='json')
        self.assertEqual(respuesta.status_code, 401)
        self.assertEqual(TorreFolio.objects.count(), 0)


class ServicioLeidoDelFolioTests(BaseFolios):

    def servicio(self):
        return self.cliente.get(URL).data[0]['servicio']

    def test_trae_ruta_cliente_y_operador_de_la_maniobra(self):
        Maniobra.objects.create(
            solicita='PRUEBA', folio='592-1', origen='MANZANILLO', destino='MONTERREY',
            cliente='KARCHER', asignacion_operador_status='ANTONIO FRANCO',
        )
        self.asignar(self.uno, '592-1')

        servicio = self.servicio()

        self.assertEqual(servicio['origen'], 'MANZANILLO')
        self.assertEqual(servicio['destino'], 'MONTERREY')
        self.assertEqual(servicio['cliente'], 'KARCHER')
        self.assertEqual(servicio['operador'], 'ANTONIO FRANCO')

    def test_un_folio_sin_maniobra_no_inventa_nada(self):
        self.asignar(self.uno, 'INEXISTENTE')
        self.assertIsNone(self.servicio())

    def test_editar_la_maniobra_se_refleja_sin_sincronizar_nada(self):
        """La torre no copia: lee. Es el motivo de que el folio sea el vínculo."""
        maniobra = Maniobra.objects.create(solicita='PRUEBA', folio='592-1',
                                           destino='MONTERREY')
        self.asignar(self.uno, '592-1')
        self.assertEqual(self.servicio()['destino'], 'MONTERREY')

        maniobra.destino = 'GUADALAJARA'
        maniobra.save(update_fields=['destino'])

        self.assertEqual(self.servicio()['destino'], 'GUADALAJARA')

    def test_el_folio_del_segundo_operador_trae_al_segundo_operador(self):
        """Un Full repartido gasta un folio por operador. Si se ignorara
        `folio_2`, el segundo viaje saldría con el nombre del primero."""
        Maniobra.objects.create(
            solicita='PRUEBA', folio='592-1', folio_2='592-2',
            asignacion_operador_status='ANTONIO FRANCO', operador_2='FIDEL',
            destino='MONTERREY',
        )
        self.asignar(self.uno, '592-2')

        self.assertEqual(self.servicio()['operador'], 'FIDEL')


class FoliosDeUnaUnidadTests(BaseFolios):
    """`?placas=` acota los folios a los de esa unidad.

    Sin el parámetro el endpoint sigue devolviendo todos: es el que usan los
    documentos y no puede cambiar de comportamiento.
    """
    RECIENTES = '/api/maniobras/folios-recientes/'

    def folios(self, placas=None):
        url = self.RECIENTES + (f'?placas={placas}' if placas else '')
        return [f['folio'] for f in self.cliente.get(url).data]

    def test_solo_salen_los_folios_de_esa_unidad(self):
        Maniobra.objects.create(solicita='P', folio='A-1', unidad='21AX4Y')
        Maniobra.objects.create(solicita='P', folio='B-1', unidad='38AV7C')

        self.assertEqual(self.folios('21AX4Y'), ['A-1'])
        self.assertEqual(self.folios('38AV7C'), ['B-1'])

    def test_sin_el_parametro_salen_todos(self):
        Maniobra.objects.create(solicita='P', folio='A-1', unidad='21AX4Y')
        Maniobra.objects.create(solicita='P', folio='B-1', unidad='38AV7C')

        self.assertEqual(sorted(self.folios()), ['A-1', 'B-1'])

    def test_en_un_full_cada_unidad_ve_solo_su_folio(self):
        """Dos operadores, dos folios, dos tractos: filtrando por uno no puede
        salir el folio del otro, o se le asignaría a la unidad equivocada."""
        Maniobra.objects.create(
            solicita='P', folio='592-1', unidad='21AX4Y',
            folio_2='592-2', unidad_2='38AV7C',
        )

        self.assertEqual(self.folios('21AX4Y'), ['592-1'])
        self.assertEqual(self.folios('38AV7C'), ['592-2'])

    def test_una_unidad_sin_folios_devuelve_lista_vacia(self):
        Maniobra.objects.create(solicita='P', folio='A-1', unidad='21AX4Y')
        self.assertEqual(self.folios('XX0000X'), [])

    # ── La cita del reporte de viaje ─────────────────────────────────────
    def test_el_endpoint_manda_fecha_pis_y_horario_por_separado(self):
        """El reporte de viaje arma su CITA con los dos juntos. Se mandan
        separados porque unirlos exige decidir la zona horaria, y `horario` es
        la hora LOCAL a la que se capturo: eso lo resuelve el navegador."""
        Maniobra.objects.create(solicita='P', folio='A-1', unidad='21AX4Y',
                                fecha_pis='2026-08-24', horario='9:00')
        fila = self.cliente.get(self.RECIENTES).data[0]
        self.assertEqual(fila['fecha_pis'], '2026-08-24')
        self.assertEqual(fila['horario'], '9:00')

    def test_una_maniobra_sin_cita_los_manda_vacios_y_no_revienta(self):
        """str() y no isoformat(): `maniobras` es managed=False y ya hubo una
        columna declarada DateField que en la base era TEXT."""
        Maniobra.objects.create(solicita='P', folio='A-1', unidad='21AX4Y')
        fila = self.cliente.get(self.RECIENTES).data[0]
        self.assertEqual(fila['fecha_pis'], '')
        self.assertEqual(fila['horario'], '')


class RenombrarUnFolioArrastraLaTorreTests(BaseFolios):
    """Renombrar un folio en el catalogo tiene que mover tambien la torre.

    `TorreFolio.folio` guarda la CADENA, y es el unico vinculo entre el tablero y
    Maniobras. Si el catalogo cambia y la torre no, get_servicio() ya no encuentra
    la maniobra: la unidad sale con su folio y sin viaje, sin error visible.

    Antes era raro porque renombrar era una accion manual. Con el "-2" automatico
    de los Full pasa en cada maniobra que se marca.
    """

    def crear_folio(self, codigo='F-2279'):
        return Folio.objects.create(tabla='manzanillo', numero=2279,
                                    letra='F', codigo=codigo)

    def renombrar(self, folio, nuevo):
        return self.cliente.patch(f'/api/folios/{folio.id}/',
                                  {'codigo': nuevo}, format='json')

    def test_renombrar_arrastra_la_asignacion_de_la_torre(self):
        folio = self.crear_folio()
        asignacion = TorreFolio.objects.create(tracto=self.uno, folio='F-2279')

        r = self.renombrar(folio, 'F-2279-2')

        self.assertEqual(r.status_code, 200, r.data)
        asignacion.refresh_from_db()
        self.assertEqual(asignacion.folio, 'F-2279-2')

    def test_la_unidad_sigue_viendo_su_viaje_despues_del_renombrado(self):
        """Lo que de verdad importa: que get_servicio() siga encontrando la
        maniobra. Sin el arrastre, la unidad sale con folio y sin viaje."""
        folio = self.crear_folio()
        Maniobra.objects.create(solicita='P', folio='F-2279', destino='MONTERREY')
        TorreFolio.objects.create(tracto=self.uno, folio='F-2279')

        self.renombrar(folio, 'F-2279-2')

        servicio = self.cliente.get(URL).data[0]['servicio']
        self.assertIsNotNone(servicio, 'la torre perdio el viaje al renombrar')
        self.assertEqual(servicio['destino'], 'MONTERREY')

    def test_no_toca_las_asignaciones_de_otras_unidades(self):
        folio = self.crear_folio()
        otra = TorreFolio.objects.create(tracto=self.dos, folio='R-2280')

        self.renombrar(folio, 'F-2279-2')

        otra.refresh_from_db()
        self.assertEqual(otra.folio, 'R-2280')

    def test_si_el_codigo_nuevo_ya_esta_en_la_torre_se_rechaza_con_mensaje(self):
        """`TorreFolio.folio` es unique: sin esta comprobacion el UPDATE saldria
        con un IntegrityError, que el usuario ve como un 500 sin motivo."""
        folio = self.crear_folio()
        TorreFolio.objects.create(tracto=self.uno, folio='F-2279')
        TorreFolio.objects.create(tracto=self.dos, folio='F-2279-2')

        r = self.renombrar(folio, 'F-2279-2')

        self.assertEqual(r.status_code, 400, r.data)
        # El mensaje dice CUAL unidad lo tiene, o hay que ir a buscarla a mano.
        self.assertIn('NO. 02', str(r.data.get('detail', '')))

    def test_al_rechazarse_no_se_renombra_nada(self):
        """El atomic() deshace el save() del folio: si el rechazo dejara el
        codigo cambiado, el catalogo y la torre quedarian peor que antes."""
        folio = self.crear_folio()
        Maniobra.objects.create(solicita='P', folio='F-2279')
        TorreFolio.objects.create(tracto=self.dos, folio='F-2279-2')

        self.renombrar(folio, 'F-2279-2')

        folio.refresh_from_db()
        self.assertEqual(folio.codigo, 'F-2279')
        self.assertEqual(Maniobra.objects.get().folio, 'F-2279')

    def test_sin_nada_en_la_torre_el_renombrado_sigue_funcionando(self):
        folio = self.crear_folio()

        r = self.renombrar(folio, 'F-2279-2')

        self.assertEqual(r.status_code, 200, r.data)
        folio.refresh_from_db()
        self.assertEqual(folio.codigo, 'F-2279-2')
