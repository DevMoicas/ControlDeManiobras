from rest_framework import serializers
from .models import Tracto, Remolque, Chofer, Maniobra, Gasto, Vacio, Empleado, Patio, Cliente, Origen, Destino, MovimientoLocal, Transportista, Cargo, UnidadTercero, OperadorTercero, DispositivoConfianza, Folio
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import Token
from django.core.validators import RegexValidator, MinLengthValidator, MaxLengthValidator
from django.db import transaction
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

    class Meta:
        model = Maniobra
        exclude = ('cliente_fk',)

    # ponytail: codigo_pis acepta cualquier texto; el max_length=100 del modelo evita error de columna.

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