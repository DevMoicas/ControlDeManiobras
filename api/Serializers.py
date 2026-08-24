import re
from decimal import Decimal, ROUND_HALF_UP
from rest_framework import serializers
from .models import Tracto, Remolque, Chofer, Maniobra, Gasto, Vacio, Empleado, Patio, Cliente, Origen, Destino, MovimientoLocal, Transportista, Cargo, UnidadTercero, OperadorTercero, DispositivoConfianza, Folio, CostoExtra, ManiobraCostoExtra, Pendiente, TorreControl, TorreFolio, BOLITAS_POR_UNIDAD, ReporteViaje, CargaCombustible, CARGAS_POR_REPORTE
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import Token
from django.core.validators import RegexValidator, MinLengthValidator, MaxLengthValidator
from django.db import transaction, models
from django.db.models import Q
from django_otp import devices_for_user, match_token
from .db_context import get_db_alias
from . import confianza

class TractoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tracto
        fields = '__all__'

    def validate_no_eco(self, value):
        MinLengthValidator(1)(value)
        MaxLengthValidator(20)(value)
        return value

    def validate_placas(self, value):
        MinLengthValidator(6)(value)
        MaxLengthValidator(8)(value)
        RegexValidator(
            regex=r'^[A-Z0-9\-]+$',
            message='Las placas solo pueden contener letras mayúsculas, números y guiones.'
        )(value)
        return value

class RemolqueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Remolque
        fields = '__all__'

class ChoferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chofer
        fields = '__all__'

    def validate_rfc(self, value):
        if not value:   # opcional: '' o None pasan sin validar formato
            return value
        MinLengthValidator(13)(value)
        MaxLengthValidator(13)(value)
        RegexValidator(
            regex=r'^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$',
            message='El RFC no tiene un formato válido.'
        )(value)
        return value

    def validate_licencia(self, value):
        if not value:   # opcional: '' o None pasan sin validar longitud
            return value
        MinLengthValidator(6)(value)
        MaxLengthValidator(20)(value)
        return value

class EmpleadoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empleado
        fields = '__all__'

class PendienteSerializer(serializers.ModelSerializer):
    # `expira_en` sale calculado del servidor para que la regla de las 28 horas
    # tenga UN solo dueño. El front no la conoce: solo compara esta fecha con su
    # reloj para ocultar lo caducado en una pestaña que lleve horas abierta.
    expira_en = serializers.DateTimeField(read_only=True)

    class Meta:
        model  = Pendiente
        fields = ('id', 'tablero', 'texto', 'hecho', 'creado_en', 'expira_en')
        read_only_fields = ('creado_en', 'expira_en')


class CostoExtraSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CostoExtra
        fields = '__all__'


class ManiobraCostoExtraSerializer(serializers.ModelSerializer):
    """Lo que ve el frontend de un costo extra ya asignado a una maniobra.

    `id` es el del CATÁLOGO, no el del enlace: es lo que el desplegable de
    Maniobras necesita para marcar las casillas. `movimiento` y `costo` salen
    del enlace (tarifa congelada), no del catálogo, que puede haber cambiado.
    """
    id = serializers.IntegerField(source='costo_extra_id', read_only=True)

    class Meta:
        model  = ManiobraCostoExtra
        fields = ('id', 'movimiento', 'costo')


def validar_color_de_fila(valor):
    """Color de relleno de una fila: solo "#rrggbb", o vacío para no pintar.

    Compartido por Maniobras y Vacíos: es una comprobación de seguridad y
    duplicarla es pedir que las dos copias se separen con el tiempo.

    Se valida en el servidor y no solo en la paleta del frontend porque este
    valor acaba dentro del CSS de la tabla: lo que llegue aquí es lo que se pinta
    para todos los usuarios, y la interfaz no es una defensa.
    """
    if not valor:
        return None
    if not re.fullmatch(r'#[0-9a-fA-F]{6}', valor):
        raise serializers.ValidationError('Color inválido: se espera "#rrggbb".')
    return valor.lower()


class ManiobraSerializer(serializers.ModelSerializer):
    # Único campo obligatorio para registrar una maniobra.
    solicita = serializers.CharField(required=True, allow_blank=False, allow_null=False, max_length=30)
    # El modelo llama al FK `cliente_fk` (el nombre `cliente` ya lo ocupa el texto
    # libre histórico), pero hacia el front el contrato es `cliente_id`: es la
    # columna real y lo que manda el ClienteSelector. El `exclude` evita exponer
    # el mismo dato dos veces con dos nombres.
    cliente_id = serializers.PrimaryKeyRelatedField(
        source='cliente_fk', queryset=Cliente.objects.all(),
        required=False, allow_null=True,
    )

    # Costos extra de la maniobra. Contrato asimétrico a propósito: se LEE la
    # lista con importe congelado (`costos_extra`) y se ESCRIBE solo la lista de
    # ids elegidos (`costos_extra_ids`). Mandar importes desde el cliente
    # significaría dejar que el navegador fije el precio; aquí lo pone siempre
    # el catálogo del servidor.
    costos_extra = ManiobraCostoExtraSerializer(
        source='costos_extra_links', many=True, read_only=True,
    )
    costos_extra_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        write_only=True, required=False, allow_empty=True,
    )

    class Meta:
        model = Maniobra
        exclude = ('cliente_fk',)

    # ponytail: codigo_pis acepta cualquier texto; el max_length=100 del modelo evita error de columna.

    def validate_color(self, valor):
        return validar_color_de_fila(valor)

    def validate(self, data):
        # Longitud máxima por campo para evitar payloads enormes
        limites = {
            "solicita": 30, "agencia": 30,
            "terminal": 30, "placas_pis": 20,
            "horario": 50, "cliente": 40,
            "origen": 30, "destino": 30,
            "asignacion_operador": 20,
        }
        for campo, limite in limites.items():
            if campo in data and len(str(data[campo])) > limite:
                raise serializers.ValidationError(
                    {campo: f"Máximo {limite} caracteres permitidos."}
                )

        # Un folio no puede quedar en dos maniobras. El desplegable ya solo ofrece
        # los libres; esto cierra la ventana de dos usuarios eligiendo el mismo a la
        # vez. Solo se comprueba cuando el folio CAMBIA: los registros viejos de la
        # época del campo de texto libre pueden venir duplicados y editarles otra
        # cosa no debe fallar por eso. El error va bajo 'detail' porque es la única
        # clave que lee el apiClient del frontend.
        #
        # Desde el segundo operador hay DOS columnas de folio y cada una se compara
        # contra las dos de las demás filas: sin esto un folio puesto como folio_2
        # se ofrecería otra vez como libre (ver FolioViewSet.disponibles).
        def _folio_efectivo(campo):
            # En un PATCH parcial el campo que no viene se toma de la fila, o el
            # folio_2 nuevo podría chocar con el folio que ya tiene guardado.
            if campo in data:
                return (data.get(campo) or '').strip()
            return (getattr(self.instance, campo, None) or '').strip() if self.instance else ''

        folio   = _folio_efectivo('folio')
        folio_2 = _folio_efectivo('folio_2')

        if folio and folio == folio_2:
            raise serializers.ValidationError(
                {'detail': f'El folio "{folio}" no puede estar en los dos operadores.'}
            )

        for campo, valor in (('folio', folio), ('folio_2', folio_2)):
            if not valor:
                continue
            anterior = (getattr(self.instance, campo, None) or '').strip() if self.instance else ''
            if valor == anterior:
                continue
            otras = Maniobra.objects.filter(Q(folio=valor) | Q(folio_2=valor))
            if self.instance is not None:
                otras = otras.exclude(pk=self.instance.pk)
            if otras.exists():
                raise serializers.ValidationError(
                    {'detail': f'El folio "{valor}" ya está usado en otra maniobra.'}
                )
        return data

    # ── Costos extra ──────────────────────────────────────────────────

    @staticmethod
    def _sincronizar_costos_extra(maniobra, ids):
        """Deja los enlaces de la maniobra exactamente en `ids`.

        Los que YA estaban no se tocan: ahí está la tarifa congelada, y
        reescribirla al reguardar la maniobra sería justo lo que se quiere
        evitar. Solo se borran los que sobran y se crean los que faltan, estos
        con el importe VIGENTE del catálogo.
        """
        ids = list(dict.fromkeys(ids))  # sin duplicados, conservando el orden

        catalogo = {c.id: c for c in CostoExtra.objects.filter(id__in=ids)}
        faltan = [i for i in ids if i not in catalogo]
        if faltan:
            raise serializers.ValidationError(
                {'detail': f'Costo extra inexistente: {faltan}'}
            )

        # Todo dentro de una transacción: un fallo a mitad dejaría la maniobra
        # con los enlaces viejos borrados y los nuevos sin crear.
        with transaction.atomic(using=get_db_alias()):
            enlaces = ManiobraCostoExtra.objects.filter(maniobra=maniobra)
            enlaces.exclude(costo_extra_id__in=ids).delete()
            ya = set(enlaces.values_list('costo_extra_id', flat=True))
            ManiobraCostoExtra.objects.bulk_create([
                ManiobraCostoExtra(
                    maniobra=maniobra,
                    costo_extra=catalogo[i],
                    movimiento=catalogo[i].movimiento,
                    costo=catalogo[i].costo,
                )
                for i in ids if i not in ya
            ])

    def create(self, validated_data):
        ids = validated_data.pop('costos_extra_ids', None)
        maniobra = super().create(validated_data)
        if ids:
            self._sincronizar_costos_extra(maniobra, ids)
        return maniobra

    def update(self, instance, validated_data):
        # `is not None` y no truthy: una lista vacía significa "quita todos",
        # que es distinto de "no vino el campo" (PATCH parcial, no tocar nada).
        ids = validated_data.pop('costos_extra_ids', None)
        maniobra = super().update(instance, validated_data)
        if ids is not None:
            self._sincronizar_costos_extra(maniobra, ids)
        return maniobra


class MFARequerida(AuthenticationFailed):
    """Credenciales correctas, falta el código. El front lo distingue por `codigo`
    para pasar al segundo paso en vez de decir 'usuario o contraseña incorrectos'."""
    def __init__(self):
        super().__init__({
            'detail': 'Introduce el código de verificación.',
            'codigo': 'mfa_requerida',
        })


class MFAInvalida(AuthenticationFailed):
    """Código incorrecto, caducado o ya usado."""
    def __init__(self):
        super().__init__({
            'detail': 'El código de verificación no es válido.',
            'codigo': 'mfa_invalida',
        })


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Inyecta el rol del usuario dentro del payload del JWT y exige el segundo
    factor a los usuarios que tengan un dispositivo TOTP confirmado.
    """
 
    @classmethod
    def get_token(cls, user) -> Token:
        token = super().get_token(user)
 
        # Solo claims no sensibles
        token["username"] = user.username
        token["role"] = "admin" if user.is_staff else "standard"

        return token

    def validate(self, attrs):
        # El login por JWT no pasa por django.contrib.auth.login(), así que la
        # señal user_logged_in nunca se dispara: este es el único punto que se
        # ejecuta solo cuando las credenciales fueron correctas.
        data = super().validate(attrs)
        from .utils import client_ip, security_logger

        request = self.context.get('request')
        ip = client_ip(request)

        # Señal para la vista: el token en claro a emitir en la cookie, o None.
        # La vista es quien puede tocar la respuesta HTTP; el serializer decide.
        self.cookie_confianza_a_emitir = None

        # ── Segundo factor (9.1, fase 1) ────────────────────────────────────
        # Solo se exige a quien YA tiene un dispositivo confirmado. Quien no lo
        # tenga entra como hasta ahora: así esto se puede desplegar sin dejar a
        # nadie fuera y dar de alta al equipo poco a poco. El interruptor que
        # lo hace obligatorio para todos es la fase 5, y no está aquí.
        if list(devices_for_user(self.user, confirmed=True)):
            # ── Equipo de confianza (fase 3): salta el código, NUNCA la
            # contraseña (que ya validó super().validate() arriba). ───────────
            cookie = request.COOKIES.get(confianza.COOKIE_CONFIANZA) if request else None
            if cookie and DispositivoConfianza.buscar_vigente(
                self.user, confianza.hash_token(cookie)
            ):
                security_logger.info(
                    "login OK (equipo de confianza) user=%s ip=%s",
                    self.user.username, ip,
                )
                return data
            # Una cookie caducada/revocada se ignora sin más: buscar_vigente ya la
            # rechazó y es inerte. No se borra —exigiría atrapar el 401 en la
            # vista— porque su Max-Age caduca sola a la par que el dispositivo.

            codigo = str(self.initial_data.get('otp_token') or '').strip()

            if not codigo:
                raise MFARequerida()

            # match_token bloquea las filas del dispositivo con select_for_update
            # para que dos peticiones simultáneas no puedan gastar el mismo código.
            # Ese bloqueo exige una transacción abierta y Django corre en
            # autocommit: sin este `atomic` el login devuelve 500 (pasó en
            # producción el 2026-07-23). El alias sale del router, no es 'default':
            # una petición a /api/login/ va contra django_standard_role.
            with transaction.atomic(using=get_db_alias()):
                dispositivo = match_token(self.user, codigo)

            if dispositivo is None:
                # Contraseña correcta + código incorrecto es la señal MÁS valiosa
                # de todo el log: dice exactamente qué cuenta tiene la contraseña
                # comprometida, mientras el atacante sigue fuera.
                security_logger.warning(
                    "login MFA FALLIDO (contrasena correcta) user=%s ip=%s",
                    self.user.username, ip,
                )
                raise MFAInvalida()

            # Código correcto. Si pidió recordar el equipo, se crea la confianza
            # y la vista emitirá la cookie. Solo aquí, tras verificar el segundo
            # factor: un atacante que solo tenga la contraseña nunca llega.
            if confianza.quiere_recordar(self.initial_data.get('recordar_equipo')):
                token = confianza.generar_token()
                ua = (request.META.get('HTTP_USER_AGENT', '') if request else '')[:400]
                DispositivoConfianza.objects.create(
                    usuario=self.user,
                    token_hash=confianza.hash_token(token),
                    ip_alta=confianza.ip_valida(ip),
                    user_agent_alta=ua,
                    etiqueta=confianza.etiqueta_desde_ua(ua),
                )
                self.cookie_confianza_a_emitir = token

        security_logger.info(
            "login OK user=%s rol=%s ip=%s",
            self.user.username,
            "admin" if self.user.is_staff else "standard",
            ip,
        )
        return data


class DispositivoConfianzaSerializer(serializers.ModelSerializer):
    """Solo lectura para la lista del perfil. NUNCA expone token_hash ni ip."""
    class Meta:
        model = DispositivoConfianza
        fields = ('id', 'etiqueta', 'creado_en', 'expira_en')
        read_only_fields = fields


class GastoSerializer(serializers.ModelSerializer):
    folio = serializers.CharField(source='maniobra.folio', read_only=True)
    # Operador y destino del folio elegido. Se leen de la maniobra enlazada en vez
    # de copiarse a `gastos`: así no se desincronizan si la maniobra cambia y no
    # hacen falta columnas nuevas. read_only → un PUT que los traiga los ignora.
    # El N+1 ya lo cubre el select_related('maniobra') del GastoViewSet.
    operador = serializers.CharField(source='maniobra.asignacion_operador_status', read_only=True)
    destino = serializers.CharField(source='maniobra.destino', read_only=True)

    class Meta:
        model = Gasto
        fields = '__all__'
        # gastos_totales es calculado en Gasto.save() (suma de los campos). Se marca
        # read_only para que el valor del cliente nunca lo sobrescriba: el servidor es
        # la única fuente de verdad. Se sigue devolviendo en la respuesta (solo lectura).
        read_only_fields = ('gastos_totales',)
        extra_kwargs = {
            'maniobra': {'required': False}  # para que PUT no lo exija
        }

    def get_maniobra_info(self, obj):
        return {
            "id": obj.maniobra.id if obj.maniobra else None,
            "cliente": obj.maniobra.cliente if obj.maniobra else None,
            "origen": obj.maniobra.origen if obj.maniobra else None,
            "destino": obj.maniobra.destino if obj.maniobra else None,
        }

class VacioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vacio
        fields = '__all__'

    def validate_color(self, valor):
        return validar_color_de_fila(valor)

class PatioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patio
        fields = '__all__'


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = '__all__'


class OrigenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Origen
        fields = '__all__'


class DestinoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Destino
        fields = '__all__'


class MovimientoLocalSerializer(serializers.ModelSerializer):
    class Meta:
        model  = MovimientoLocal
        fields = '__all__'


class TransportistaSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Transportista
        fields = '__all__'


class CargoSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Cargo
        fields = '__all__'


class UnidadTerceroSerializer(serializers.ModelSerializer):
    class Meta:
        model  = UnidadTercero
        fields = '__all__'


class OperadorTerceroSerializer(serializers.ModelSerializer):
    class Meta:
        model  = OperadorTercero
        fields = '__all__'


class FolioSerializer(serializers.ModelSerializer):
    # allow_null porque sanitizarPayload() del apiClient manda null (no "") al
    # vaciar una celda; validate_asignacion lo normaliza de vuelta a "" para no
    # tener dos estados de "vacío" en la columna (NULL y '').
    asignacion = serializers.CharField(
        max_length=40, required=False, allow_blank=True, allow_null=True
    )

    # `codigo` lo siembra el generador, pero es editable a mano: a veces hay que
    # añadirle algo que no sale automático. Se declara explícito con
    # validators=[] para quitar el UniqueValidator que DRF añade solo — así el
    # choque de duplicados se responde en validate(), bajo la clave 'detail',
    # que es la ÚNICA que lee el apiClient del frontend (un error de campo le
    # llegaría como un inútil "HTTP 400").
    codigo = serializers.CharField(
        max_length=30, required=False, allow_blank=True, allow_null=True, validators=[]
    )

    class Meta:
        model  = Folio
        fields = '__all__'
        # `numero` sigue siendo de solo lectura aunque `codigo` ya no lo sea: es
        # el contador real del que sale el siguiente lote. Renombrar un folio no
        # debe poder mover la secuencia.
        read_only_fields = ['tabla', 'numero', 'letra']

    def validate_asignacion(self, value):
        return value or ''

    def validate(self, attrs):
        if 'codigo' not in attrs:
            return attrs

        codigo = (attrs['codigo'] or '').strip()
        if not codigo:
            raise serializers.ValidationError({'detail': 'El folio no puede quedar vacío.'})

        duplicados = Folio.objects.filter(codigo=codigo)
        if self.instance is not None:
            duplicados = duplicados.exclude(pk=self.instance.pk)
        if duplicados.exists():
            raise serializers.ValidationError({'detail': f'El folio "{codigo}" ya existe.'})

        attrs['codigo'] = codigo
        return attrs


class TorreFolioSerializer(serializers.ModelSerializer):
    """La unidad, su folio y lo que dice la maniobra de ese folio."""
    no_eco   = serializers.CharField(source='tracto.no_eco', read_only=True)
    servicio = serializers.SerializerMethodField()

    class Meta:
        model  = TorreFolio
        fields = ('id', 'tracto', 'folio', 'no_eco', 'servicio')

    def get_servicio(self, asignacion):
        """Lo que dice la maniobra de ese folio. Se LEE cada vez, nunca se copia.

        Por eso editar el destino o el operador en Maniobras se refleja aquí sin
        que nadie sincronice nada: no hay una segunda copia que pueda quedarse
        vieja.

        Un Full repartido gasta un folio por operador, así que el folio puede
        estar en `folio` o en `folio_2` — y de eso depende cuál de los dos
        operadores lo lleva.

        ponytail: una consulta por unidad asignada, acotado al número de tractos
        (11 hoy). Si algún día pesa, resolverlas todas de golpe en el list().
        """
        folio = asignacion.folio
        maniobra = (
            Maniobra.objects
            .filter(Q(folio=folio) | Q(folio_2=folio))
            .order_by('-id')
            .first()
        )
        if maniobra is None:
            return None

        es_segundo = maniobra.folio_2 == folio
        return {
            'id':          maniobra.id,
            'origen':      maniobra.origen or '',
            'destino':     maniobra.destino or '',
            'cliente':     maniobra.cliente or '',
            'operador':    (maniobra.operador_2 if es_segundo
                            else maniobra.asignacion_operador_status) or '',
            # Se mandan tal cual: el frontend decide si las pinta y si acomoda
            # las bolitas con ellas. Vacías, no muestra nada.
            'ruta_inicio': maniobra.ruta_inicio,
            'ruta_fin':    maniobra.ruta_fin,
        }


class TorreControlSerializer(serializers.ModelSerializer):
    # La bolita se pinta con su No. Eco. Va aquí para que el frontend no tenga
    # que cruzar esta lista con la de tractos en cada render.
    no_eco = serializers.CharField(source='tracto.no_eco', read_only=True)

    class Meta:
        model  = TorreControl
        fields = ('id', 'tracto', 'indice', 'fecha', 'no_eco')

    def validate_indice(self, valor):
        """El CHECK de la base admite 1 y 2; cuántas se ofrecen HOY lo dice la
        constante. Sin esto, un cliente podría crear la segunda bolita antes de
        que exista en la interfaz — la interfaz no es una defensa."""
        if not 1 <= valor <= BOLITAS_POR_UNIDAD:
            raise serializers.ValidationError(
                f"Solo hay {BOLITAS_POR_UNIDAD} bolita(s) por unidad."
            )
        return valor

class CargaCombustibleSerializer(serializers.ModelSerializer):
    """Un renglón del bloque EN TRAYECTO.

    `total` es el del diésel y sale calculado (litros × precio). El de la urea NO:
    el papel no trae precio por litro para ella, así que `total_urea` se captura.
    """
    total = serializers.SerializerMethodField()

    class Meta:
        model  = CargaCombustible
        fields = ('orden', 'litros_diesel', 'precio_litro',
                  'litros_urea', 'total_urea', 'total')
        # `reporte` no viaja: las cargas siempre entran anidadas dentro de su
        # reporte, que es quien las asigna. Sin esto DRF montaría el validador de
        # UNIQUE(reporte, orden) sobre un campo que el cliente no manda.
        validators = []

    def get_total(self, carga):
        if carga.litros_diesel is None or carga.precio_litro is None:
            return None
        # str y no Decimal: los demás decimales del payload viajan como cadena
        # (COERCE_DECIMAL_TO_STRING, el valor por defecto de DRF, que settings no
        # toca). Devolver un número aquí mezclaría los dos tipos en el mismo JSON,
        # que es justo lo que se descubre tarde y en el navegador.
        return str((carga.litros_diesel * carga.precio_litro)
                   .quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

    def validate_orden(self, value):
        """El CHECK de la base rechaza esto igual, pero con un IntegrityError que
        el usuario ve como un 500. Aquí sale un 400 que dice qué pasó."""
        if not 1 <= value <= CARGAS_POR_REPORTE:
            raise serializers.ValidationError(
                f'El renglón debe estar entre 1 y {CARGAS_POR_REPORTE}.'
            )
        return value


class ReporteViajeSerializer(serializers.ModelSerializer):
    """El reporte de viaje del coordinador, con sus cargas de combustible.

    Las cargas viajan anidadas: el frontend manda el reporte entero (o un PATCH
    parcial con `cargas`) en UNA escritura, y aquí se hace upsert por `orden`.
    Sin esto haría falta una petición por renglón y una pantalla a medio guardar
    dejaría el reporte descuadrado.
    """
    cargas      = CargaCombustibleSerializer(many=True, required=False)
    km_totales  = serializers.SerializerMethodField()
    # rendimiento NO es un SerializerMethodField: es una columna de verdad, que
    # el modelo recalcula en cada escritura. read_only para que nadie la mande
    # desde fuera — el frontend manda el reporte entero y ahí viaja su copia
    # calculada en vivo, que aquí se ignora.
    # validators=[] desactiva el UniqueValidator automático de `folio`: su mensaje
    # viaja bajo la clave del campo y el apiClient del frontend solo lee 'detail'.
    # La comprobación se hace en validate(), con un mensaje legible. Mismo motivo
    # que en FolioSerializer.codigo.
    # allow_blank: sin esto DRF rechaza la cadena vacia a nivel de campo y el
    # mensaje sale bajo la clave 'folio', que el frontend no lee. Se deja pasar
    # para que validate() la rechace con un 'detail' legible.
    folio = serializers.CharField(max_length=100, allow_blank=True, validators=[])

    class Meta:
        model  = ReporteViaje
        fields = '__all__'
        read_only_fields = ('creado_en', 'actualizado_en', 'rendimiento')

    # Los CharField/TextField del modelo son blank=True, default='': NOT NULL en
    # la base. Se derivan del modelo y no se listan a mano para que añadir un
    # campo de texto mañana no obligue a acordarse de esta lista.
    _TEXTOS = tuple(
        f.name for f in ReporteViaje._meta.get_fields()
        if isinstance(f, (models.CharField, models.TextField))
    )

    def to_internal_value(self, data):
        """Un null en un campo de texto es vacío, no un error.

        Ninguno de estos campos es obligatorio: hay viajes que no los usan y hay
        datos que no se saben hasta días después, así que el reporte se guarda a
        medias y se completa luego (usuario, 2026-08-24). Además el apiClient del
        frontend convierte "" en null al escribir, así que limpiar un campo llega
        aquí como null. Mismo criterio que Folio.asignacion.
        """
        if isinstance(data, dict):
            data = {clave: ('' if clave in self._TEXTOS and valor is None else valor)
                    for clave, valor in data.items()}
        return super().to_internal_value(data)

    # ── Calculados. No se guardan: ver el docstring del modelo ──────────────
    def get_km_totales(self, reporte):
        # Este sí se calcula al vuelo: es una resta de dos columnas de la misma
        # fila, así que no puede quedarse desfasado de sus operandos.
        return reporte.km_totales()

    # ── Un reporte por folio ────────────────────────────────────────────────
    def validate(self, attrs):
        if 'folio' not in attrs:
            return attrs
        folio = (attrs['folio'] or '').strip()
        if not folio:
            raise serializers.ValidationError({'detail': 'El folio no puede quedar vacío.'})
        otros = ReporteViaje.objects.filter(folio=folio)
        if self.instance is not None:
            otros = otros.exclude(pk=self.instance.pk)
        if otros.exists():
            raise serializers.ValidationError(
                {'detail': f'El folio "{folio}" ya tiene un reporte de viaje.'}
            )
        attrs['folio'] = folio
        return attrs

    # ── Escritura anidada ───────────────────────────────────────────────────
    @staticmethod
    def _guardar_cargas(reporte, cargas):
        """Upsert por `orden`: mandar el renglón 2 lo crea o lo pisa, y no toca
        los otros cuatro. Es lo que necesita una pantalla que se llena por etapas
        —el coordinador captura una parada hoy y otra pasado mañana."""
        for carga in cargas:
            datos = dict(carga)
            CargaCombustible.objects.update_or_create(
                reporte=reporte, orden=datos.pop('orden'), defaults=datos,
            )

    def create(self, validated_data):
        cargas = validated_data.pop('cargas', [])
        # atomic con el alias del router: el reporte y sus cargas son una sola
        # escritura, como en FolioViewSet.perform_update.
        with transaction.atomic(using=get_db_alias()):
            reporte = ReporteViaje.objects.create(**validated_data)
            self._guardar_cargas(reporte, cargas)
            # Después de las cargas: el rendimiento las necesita.
            reporte.refrescar_rendimiento()
        return reporte

    def update(self, instance, validated_data):
        # pop con None y no con []: "no mandó cargas" (PATCH de otro campo) no es
        # lo mismo que "mandó una lista vacía".
        cargas = validated_data.pop('cargas', None)
        with transaction.atomic(using=get_db_alias()):
            for campo, valor in validated_data.items():
                setattr(instance, campo, valor)
            instance.save()
            if cargas is not None:
                self._guardar_cargas(instance, cargas)
            # En CADA escritura, vengan cargas o no: el rendimiento también
            # cambia al tocar el kilometraje.
            instance.refrescar_rendimiento()
        return instance
