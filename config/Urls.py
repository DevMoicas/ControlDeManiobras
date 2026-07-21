"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django_otp.admin import OTPAdminSite

# MFA obligatorio en /admin (decisión A4). Se intercambia la clase del sitio ya
# existente en vez de instanciar uno nuevo: así se conservan todos los modelos
# ya registrados y el namespace de URLs sigue siendo 'admin:'. A partir de aquí
# has_permission() exige además request.user.is_verified(), o sea un dispositivo
# OTP confirmado; sin él, un is_staff se trata como si no lo fuera.
#
# Rescate si se pierde el dispositivo: entrar con uno de los códigos de respaldo
# (StaticToken). Si tampoco hay, revertir esta línea o borrar el device por
# consola — ver "MFA admin" en PLAN_DESPLIEGUE_PRODUCCION.md.
admin.site.__class__ = OTPAdminSite

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
]
