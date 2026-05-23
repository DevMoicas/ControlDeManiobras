from rest_framework import viewsets
from .models import Tracto, Remolque, Chofer, Maniobra, Gasto, Vacio, Empleado
from .Serializers import TractoSerializer, RemolqueSerializer, ChoferSerializer, ManiobraSerializer, GastoSerializer, VacioSerializer, EmpleadoSerializer
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView
from .Serializers import CustomTokenObtainPairSerializer
from rest_framework.filters import OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend


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
    queryset = Maniobra.objects.all().order_by("-id")
    serializer_class = ManiobraSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["status"]
    ordering_fields = ["id", "fecha_pis", "fecha_entrega_mercancia"]
    ordering = ["-id"]

     
class CustomTokenObtainPairView(TokenObtainPairView):
    
    # Devuelve access + refresh con 'role' y 'username' en el payload.
    serializer_class = CustomTokenObtainPairSerializer
class GastoViewSet(viewsets.ModelViewSet):
    queryset = Gasto.objects.all()
    serializer_class = GastoSerializer

    def perform_create(self, serializer):
        maniobra_id = self.request.data.get('maniobra')
        if not maniobra_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'maniobra': 'Este campo es requerido.'})
        try:
            maniobra = Maniobra.objects.get(id=maniobra_id)
        except Maniobra.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'maniobra': f'No existe una maniobra con id {maniobra_id}.'})
        serializer.save(maniobra=maniobra)  

    def perform_update(self, serializer):
        # En update no tocamos la maniobra, solo los campos del gasto
        serializer.save()

class VacioViewSet(viewsets.ModelViewSet):
    queryset = Vacio.objects.all().order_by("-id")
    serializer_class = VacioSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]
    filter_backends = [OrderingFilter]
    ordering_fields = ["id"]
    ordering = ["-id"]

class EmpleadoViewSet(viewsets.ModelViewSet):
    queryset = Empleado.objects.all().order_by("-id")
    serializer_class = EmpleadoSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]
    filter_backends = [OrderingFilter]
    ordering_fields = ["id"]
    ordering = ["id"]