from rest_framework import viewsets
from .Models import Tracto, Remolque, Chofer, Maniobra
from .Serializers import TractoSerializer, RemolqueSerializer, ChoferSerializer, ManiobraSerializer
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle


class TractoViewSet(viewsets.ModelViewSet):
    queryset = Tracto.objects.all()
    serializer_class = TractoSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]

class RemolqueViewSet(viewsets.ModelViewSet):
    queryset = Remolque.objects.all()
    serializer_class = RemolqueSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]

class ChoferViewSet(viewsets.ModelViewSet):
    queryset = Chofer.objects.all()
    serializer_class = ChoferSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]

# --- NUEVA VISTA ---
class ManiobraViewSet(viewsets.ModelViewSet):
    queryset = Maniobra.objects.all().order_by('-id')
    serializer_class = ManiobraSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]