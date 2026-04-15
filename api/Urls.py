from django.urls import path, include
from rest_framework.routers import DefaultRouter
# Agregamos ManiobraViewSet al final de esta línea:
from .Views import TractoViewSet, RemolqueViewSet, ChoferViewSet, ManiobraViewSet

router = DefaultRouter()
router.register(r'tractos', TractoViewSet, basename='tractos')
router.register(r'remolques', RemolqueViewSet, basename='remolques')
router.register(r'choferes', ChoferViewSet, basename='choferes')
# Aquí puedes agregar el basename para mantener la consistencia
router.register(r'maniobras', ManiobraViewSet, basename='maniobras')

urlpatterns = [
    path('', include(router.urls)),
]
