from rest_framework import serializers
from .models import Tracto, Remolque, Chofer, Maniobra, Gasto, Vacio, Empleado, Patio, Cliente, Origen, Destino, MovimientoLocal, Transportista, Cargo, UnidadTercero, OperadorTercero
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import Token
from django.core.validators import RegexValidator, MinLengthValidator, MaxLengthValidator

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

    class Meta:
        model = Maniobra
        fields = '__all__'

    # ponytail: codigo_pis acepta cualquier texto; el max_length=100 del modelo evita error de columna.

    def validate(self, data):
        # Longitud máxima por campo para evitar payloads enormes
        limites = {
            "solicita": 30, "agencia": 30,
            "terminal": 30, "placas_pis": 20,
            "horario": 50, "cliente": 30, 
            "origen": 20, "destino": 20, 
            "asignacion_operador": 20,
        }
        for campo, limite in limites.items():
            if campo in data and len(str(data[campo])) > limite:
                raise serializers.ValidationError(
                    {campo: f"Máximo {limite} caracteres permitidos."}
                )
        return data
    
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Inyecta el rol del usuario dentro del payload del JWT.
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
        security_logger.info(
            "login OK user=%s rol=%s ip=%s",
            self.user.username,
            "admin" if self.user.is_staff else "standard",
            client_ip(self.context.get('request')),
        )
        return data

class GastoSerializer(serializers.ModelSerializer):
    folio = serializers.CharField(source='maniobra.folio', read_only=True)

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