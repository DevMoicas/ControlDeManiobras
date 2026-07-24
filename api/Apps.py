import logging

from django.apps import AppConfig
from django.contrib.auth.signals import user_login_failed

security_logger = logging.getLogger('api.security')


# Los receptores viven a nivel de módulo a propósito: Django guarda los
# receptores con weakref, así que una función local dentro de ready() sería
# recolectada y la señal dejaría de loguear en silencio.

def _log_login_fallido(sender, credentials=None, request=None, **kwargs):
    from .utils import client_ip
    security_logger.warning(
        "login FALLIDO user=%s ip=%s",
        (credentials or {}).get('username') or '-',
        client_ip(request),
    )


def _log_lockout(sender, request=None, username=None, **kwargs):
    # axes solo manda request/username/ip_address en esta señal; el número de
    # intentos no viaja, así que no se intenta loguear.
    from .utils import client_ip
    security_logger.warning(
        "LOCKOUT axes user=%s ip=%s (limite AXES_FAILURE_LIMIT alcanzado)",
        username or '-',
        client_ip(request),
    )


def _totp_tolerance_por_defecto(sender, instance, **kwargs):
    # Los dispositivos TOTP nuevos nacen con tolerance=1 (default de django-otp) =
    # ventana de ±30s. Con OTP_TOTP_SYNC=False el servidor ya no auto-corrige el
    # reloj (ver config/settings.py), así que se fija un PISO de 2 (±60s) para
    # absorber el desfase modesto entre contenedores de Azure entre redeploys
    # (incidente del drift, 2026-07-23). Solo al crear y solo como piso: no baja
    # una tolerance mayor puesta a mano. Los dispositivos ya existentes se suben
    # con un UPDATE una sola vez (no los toca esta señal).
    if instance._state.adding and instance.tolerance < 2:
        instance.tolerance = 2


class ApiConfig(AppConfig):
    name = 'api'

    def ready(self):
        # Se conectan aquí y no a nivel de módulo porque axes tiene que estar ya
        # en el registro de apps para poder importar sus señales.
        from axes.signals import user_locked_out
        from django.db.models.signals import pre_save
        from django_otp.plugins.otp_totp.models import TOTPDevice

        user_login_failed.connect(_log_login_fallido, dispatch_uid='api_login_fallido')
        user_locked_out.connect(_log_lockout, dispatch_uid='api_lockout')
        pre_save.connect(
            _totp_tolerance_por_defecto, sender=TOTPDevice,
            dispatch_uid='api_totp_tolerance',
        )

        # El fichero es Admin.py (mayúscula), que el autodescubrimiento de Django
        # NO encuentra en Linux (busca admin.py). Sin este import explícito, el
        # panel de DispositivoConfianza no aparecería en producción.
        from . import Admin  # noqa: F401
