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


class ApiConfig(AppConfig):
    name = 'api'

    def ready(self):
        # Se conectan aquí y no a nivel de módulo porque axes tiene que estar ya
        # en el registro de apps para poder importar sus señales.
        from axes.signals import user_locked_out

        user_login_failed.connect(_log_login_fallido, dispatch_uid='api_login_fallido')
        user_locked_out.connect(_log_lockout, dispatch_uid='api_lockout')
