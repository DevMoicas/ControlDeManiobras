from rest_framework import serializers
from .models import Tracto, Remolque, Chofer

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
