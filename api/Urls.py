from django.urls import path, include
from rest_framework.routers import DefaultRouter
# Agregamos ManiobraViewSet al final de esta línea:
from .Views import TractoViewSet, RemolqueViewSet, ChoferViewSet, ManiobraViewSet
from rest_framework_simplejwt.views import TokenRefreshView


from .Views import (
    TractoViewSet,
    RemolqueViewSet,
    ChoferViewSet,
    ManiobraViewSet,
    CustomTokenObtainPairView,   # ← nueva, del mismo Views.py
)
 
router = DefaultRouter()
router.register(r'tractos',   TractoViewSet,   basename='tractos')
router.register(r'remolques', RemolqueViewSet, basename='remolques')
router.register(r'choferes',  ChoferViewSet,   basename='choferes')
router.register(r'maniobras', ManiobraViewSet, basename='maniobras')
 
urlpatterns = [
    path('', include(router.urls)),
 
    # Login → access + refresh token con role en el payload
    path('login/', CustomTokenObtainPairView.as_view(), name='login'),
 
    # Refresh → el frontend lo llama automáticamente cuando expira el access
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
 