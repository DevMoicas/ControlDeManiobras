from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView


from .views import (
    TractoViewSet,
    RemolqueViewSet,
    ChoferViewSet,
    EmpleadoViewSet,
    ManiobraViewSet,
    GastoViewSet,
    VacioViewSet,
    PatioViewSet,
    ClienteViewSet,
    OrigenViewSet,
    DestinoViewSet,
    FotoRegistroViewSet,
    DocumentoBitacoraSuenoView,
    DocumentoCtaPortView,
    DocumentoCtaPortTercerosView,
    DocumentoBitacoraGastosView,
    CustomTokenObtainPairView,   # ← nueva, del mismo Views.py
    MovimientoLocalViewSet,
    AlertasVencimientoView,
    TransportistaViewSet,
    CargoViewSet,
    UnidadTerceroViewSet,
    OperadorTerceroViewSet,
)
 
router = DefaultRouter()
router.register(r'tractos',   TractoViewSet,   basename='tractos')
router.register(r'remolques', RemolqueViewSet, basename='remolques')
router.register(r'choferes',  ChoferViewSet,   basename='choferes')
router.register(r'maniobras', ManiobraViewSet, basename='maniobras')
router.register(r'gastos', GastoViewSet, basename='gastos')
router.register(r'vacios', VacioViewSet, basename='vacios')
router.register(r'empleados', EmpleadoViewSet, basename='empleados')
router.register(r'patios', PatioViewSet, basename='patios')
router.register(r'clientes',  ClienteViewSet,  basename='clientes')
router.register(r'origenes',  OrigenViewSet,   basename='origenes')
router.register(r'destinos',  DestinoViewSet,  basename='destinos')
router.register(r'fotos',     FotoRegistroViewSet, basename='fotos')
router.register(r'movimientos-locales', MovimientoLocalViewSet, basename='movimientos-locales')
router.register(r'transportistas', TransportistaViewSet, basename='transportistas')
router.register(r'cargos',         CargoViewSet,         basename='cargos')
router.register(r'unidades-terceros',  UnidadTerceroViewSet,   basename='unidades-terceros')
router.register(r'operadores-terceros', OperadorTerceroViewSet, basename='operadores-terceros')

urlpatterns = [
    path('', include(router.urls)),

    # Documentos de viaje (generan PDF vía LibreOffice)
    path('documentos/bitacora-sueno/', DocumentoBitacoraSuenoView.as_view(), name='bitacora-sueno'),
    path('documentos/cta-port/',       DocumentoCtaPortView.as_view(),       name='cta-port'),
    path('documentos/cta-port-terceros/', DocumentoCtaPortTercerosView.as_view(), name='cta-port-terceros'),
    path('documentos/bitacora-gastos/', DocumentoBitacoraGastosView.as_view(), name='bitacora-gastos'),

    # Alertas de vencimiento (licencias / pólizas) para el Home
    path('alertas-vencimiento/', AlertasVencimientoView.as_view(), name='alertas-vencimiento'),

    # Login → access + refresh token con role en el payload
    path('login/', CustomTokenObtainPairView.as_view(), name='login'),
 
    # Refresh → el frontend lo llama automáticamente cuando expira el access
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Logout → invalida el refresh token en el servidor (blacklist)
    path('logout/', TokenBlacklistView.as_view(), name='logout'),
]
