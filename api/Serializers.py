from rest_framework import serializers
from .models import Tracto, Remolque, Chofer, Maniobra, Gasto
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import Token
import re

class TractoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tracto
        fields = '__all__'

class RemolqueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Remolque
        fields = '__all__'

class ChoferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chofer
        fields = '__all__'

class ManiobraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Maniobra
        fields = '__all__'

    def validate_codigo_pis(self, value):
        # Solo permite alfanuméricos y guiones
        if not re.match(r'^[a-zA-Z0-9\-]+$', value):
            raise serializers.ValidationError("Código PIS inválido.")
        return value

    def validate(self, data):
        # Longitud máxima por campo para evitar payloads enormes
        limites = {
            "solicita": 100, "agencia": 100,
            "terminal": 100, "placas_pis": 20,
            "horario": 50, "cliente": 100, 
            "origen": 100, "destino": 100, 
            "asignacion_operador": 100,
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
    
class GastoSerializer(serializers.ModelSerializer):

    class Meta:
        model = Gasto
        fields = '__all__'

    def get_maniobra_info(self, obj):
        return {
            "id": obj.maniobra.id if obj.maniobra else None,
            "cliente": obj.maniobra.cliente if obj.maniobra else None,
            "origen": obj.maniobra.origen if obj.maniobra else None,
            "destino": obj.maniobra.destino if obj.maniobra else None,
        }