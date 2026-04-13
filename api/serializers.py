from rest_framework import serializers
from .models import Tracto, Remolque, Chofer, Maniobra

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

# --- NUEVO SERIALIZER ---
class ManiobraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Maniobra
        fields = ['id', 'solicita', 'agencia', 'codigo_pis', 'terminal', 'placas_pis', 'fecha_pis', 'horario']