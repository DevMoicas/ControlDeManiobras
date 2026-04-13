from rest_framework import viewsets
from .models import Tracto, Remolque, Chofer, Maniobra
from .serializers import TractoSerializer, RemolqueSerializer, ChoferSerializer, ManiobraSerializer

class TractoViewSet(viewsets.ModelViewSet):
    queryset = Tracto.objects.all()
    serializer_class = TractoSerializer

class RemolqueViewSet(viewsets.ModelViewSet):
    queryset = Remolque.objects.all()
    serializer_class = RemolqueSerializer

class ChoferViewSet(viewsets.ModelViewSet):
    queryset = Chofer.objects.all()
    serializer_class = ChoferSerializer

# --- NUEVA VISTA ---
class ManiobraViewSet(viewsets.ModelViewSet):
    queryset = Maniobra.objects.all()
    serializer_class = ManiobraSerializer