from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TractoViewSet, RemolqueViewSet, ChoferViewSet

router = DefaultRouter()
router.register(r'tractos', TractoViewSet, basename='tractos')
router.register(r'remolques', RemolqueViewSet, basename='remolques')
router.register(r'choferes', ChoferViewSet, basename='choferes')

urlpatterns = [
    path('', include(router.urls)),
]
