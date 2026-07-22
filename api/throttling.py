"""Throttles que identifican al cliente por su IP real.

DRF resuelve la identidad así (rest_framework/throttling.py):

    if num_proxies is not None:
        ...
        return addrs[-min(num_proxies, len(addrs))].strip()
    return ''.join(xff.split()) if xff else remote_addr

Con NUM_PROXIES sin definir —el caso de este proyecto hasta ahora— usa la
CADENA XFF ENTERA como clave. No hace falta ni falsificar una IP creíble:
cualquier valor distinto abre un cubo nuevo y el límite deja de existir.

Y configurar NUM_PROXIES tampoco bastaba: Azure incluye el puerto de origen
("187.192.198.73:64197"), que cambia en cada conexión TCP, así que la clave
seguiría siendo distinta cada vez. DRF no lo recorta.

Por eso se sobrescribe get_ident con la función medida de api/client_ip.py, la
misma que usan axes y el log de seguridad.
"""
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from api.client_ip import client_ip


class _IpRealMixin:
    def get_ident(self, request):
        return client_ip(request) or super().get_ident(request)


class AnonIpRealThrottle(_IpRealMixin, AnonRateThrottle):
    pass


class UserIpRealThrottle(_IpRealMixin, UserRateThrottle):
    pass
