from rest_framework import serializers
from .Models import Tracto, Remolque, Chofer, Maniobra

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
            "horario": 50,
        }
        for campo, limite in limites.items():
            if campo in data and len(str(data[campo])) > limite:
                raise serializers.ValidationError(
                    {campo: f"Máximo {limite} caracteres permitidos."}
                )
        return data