from rest_framework import viewsets
from .Models import Tracto, Remolque, Chofer, Maniobra
from .Serializers import TractoSerializer, RemolqueSerializer, ChoferSerializer, ManiobraSerializer

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
    queryset = Maniobra.objects.all().order_by('-id')
    serializer_class = ManiobraSerializer