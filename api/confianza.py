"""Helpers del equipo de confianza (9.1 fase 3).

Puro y sin ORM: la parte con base de datos vive en el modelo DispositivoConfianza
y en el serializer. Aquí solo el token, su hash, la etiqueta y el nombre de la
cookie — cosas que se prueban sin levantar nada.
"""
import hashlib
import ipaddress
import secrets

# La cookie va marcada con path=/api/login/ (decisión 15): el navegador solo la
# manda al iniciar sesión, el único sitio que la lee. httpOnly + Secure +
# SameSite=Strict los pone la vista al emitirla.
COOKIE_CONFIANZA = 'cdm_confianza'


def generar_token():
    """Secreto de 256 bits. Va EN CLARO en la cookie; en la BD solo su hash."""
    return secrets.token_urlsafe(32)


def hash_token(token):
    """SHA-256 hex. El token tiene 256 bits de entropía, así que un hash simple
    basta para buscar: no es una contraseña débil que necesite bcrypt."""
    return hashlib.sha256((token or '').encode()).hexdigest()


def quiere_recordar(valor):
    """La casilla llega como bool JSON, o como "true"/"false" si pasó por el
    saneador del frontend (que convierte todo a string). Se aceptan ambos."""
    return str(valor).strip().lower() in ('true', '1', 'on', 'yes')


def ip_valida(ip):
    """El log de seguridad usa '-' cuando no resuelve la IP; eso no cabe en un
    GenericIPAddressField y reventaría el INSERT. Devuelve la IP o None."""
    try:
        ipaddress.ip_address(ip)
        return ip
    except (ValueError, TypeError):
        return None


# Orden importante: el UA de Edge contiene "chrome", y el de Chrome contiene
# "safari". Se comprueba de más específico a menos.
_NAVEGADORES = [('edg', 'Edge'), ('opr', 'Opera'), ('chrome', 'Chrome'),
                ('firefox', 'Firefox'), ('safari', 'Safari')]
_SISTEMAS = [('windows', 'Windows'), ('android', 'Android'), ('iphone', 'iPhone'),
             ('ipad', 'iPad'), ('mac', 'Mac'), ('linux', 'Linux')]


def etiqueta_desde_ua(ua):
    """Nombre legible para la lista del perfil, sin dependencia de parseo.
    'Chrome en Windows', 'Safari en iPhone'… o 'Equipo' si no se reconoce."""
    ua = (ua or '').lower()
    nav = next((n for k, n in _NAVEGADORES if k in ua), '')
    so  = next((s for k, s in _SISTEMAS if k in ua), '')
    if nav and so:
        return f"{nav} en {so}"
    return nav or so or 'Equipo'
