import time
from collections import deque
from threading import Lock
from django.http import HttpResponse

# ── Configuración ─────────────────────────────────────────────────────────────
MAX_REQUESTS   = 200          # máximo de requests permitidos
WINDOW_SECONDS = 60           # ventana de tiempo en segundos
BLOCK_SECONDS  = 3600         # duración del bloqueo (1 hora)

# ── Estado en memoria ─────────────────────────────────────────────────────────
_lock      = Lock()
_hits      = {}    # { ip: deque([timestamp, ...]) }
_bloqueadas = {}   # { ip: timestamp_de_bloqueo }


def _get_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


class IPRateLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        ip  = _get_ip(request)
        now = time.time()

        with _lock:
            # ── Verificar si la IP está bloqueada ─────────────────────────
            if ip in _bloqueadas:
                if now - _bloqueadas[ip] < BLOCK_SECONDS:
                    return HttpResponse(status=503)
                else:
                    # Bloqueo expirado — limpiar
                    del _bloqueadas[ip]
                    _hits.pop(ip, None)

            # ── Registrar hit y limpiar hits fuera de la ventana ──────────
            if ip not in _hits:
                _hits[ip] = deque()

            ventana = _hits[ip]
            while ventana and now - ventana[0] > WINDOW_SECONDS:
                ventana.popleft()

            ventana.append(now)

            # ── Verificar si supera el límite ─────────────────────────────
            if len(ventana) > MAX_REQUESTS:
                _bloqueadas[ip] = now
                _hits.pop(ip, None)
                return HttpResponse(status=503)

        return self.get_response(request)


import jwt
from django.conf import settings
from api.db_context import set_db_alias


class RoleRoutingMiddleware:
    """
    Se ejecuta en cada petición ANTES de que Django procese la vista.

    Lee el JWT del header Authorization, extrae el claim 'role', y establece
    el alias de BD en thread-local storage:
      - role == 'admin'  → alias 'default'  (superuser, acceso total)
      - role != 'admin'  → alias 'standard' (solo SELECT/INSERT/UPDATE)
      - sin JWT válido   → alias 'standard' (mínimo privilegio, fail-safe)

    El bloque finally garantiza que el alias siempre se resetea a 'standard'
    al terminar la petición, evitando filtraciones entre requests en el mismo hilo.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Las rutas /admin/ usan sesión Django, no JWT.
        # Siempre van contra 'default' (superuser) para que funcionen correctamente.
        if request.path.startswith('/admin/'):
            set_db_alias('default')
            try:
                response = self.get_response(request)
            finally:
                set_db_alias('standard')
            return response

        alias = 'standard'  # Mínimo privilegio por defecto

        auth_header = request.META.get('HTTP_AUTHORIZATION', '')

        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1].strip()
            try:
                payload = jwt.decode(
                    token,
                    settings.SECRET_KEY,
                    algorithms=['HS256'],
                )
                if payload.get('role') == 'admin':
                    alias = 'default'
            except (jwt.InvalidTokenError, jwt.DecodeError, jwt.ExpiredSignatureError):
                alias = 'standard'  # Token inválido → mínimo privilegio

        set_db_alias(alias)

        try:
            response = self.get_response(request)
        finally:
            # Reset SIEMPRE al terminar, independientemente de errores
            set_db_alias('standard')

        return response


class SecurityHeadersMiddleware:
    """
    Agrega security headers a todas las respuestas de la API Django.

    Notas:
    - HSTS está comentado intencionalmente: activar solo cuando HTTPS esté
      configurado en producción.
    - CSP para la API es restrictivo ('none') porque la API solo devuelve JSON.
      El CSP del frontend React se configura en vite.config.js (dev) y en
      el servidor web (producción).
    - El header Server se sobreescribe para no revelar tecnología utilizada.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Previene que el navegador "sniffee" el MIME type
        response['X-Content-Type-Options'] = 'nosniff'

        # Previene clickjacking: esta página no puede ser embebida en iframes
        response['X-Frame-Options'] = 'DENY'

        # Deshabilitar el filtro XSS legacy del navegador (recomendación moderna:
        # desactivarlo y confiar en CSP en su lugar)
        response['X-XSS-Protection'] = '0'

        # Control de información de referrer
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'

        # Restricción de APIs del navegador no utilizadas por esta aplicación
        response['Permissions-Policy'] = (
            'camera=(), '
            'microphone=(), '
            'geolocation=(), '
            'payment=(), '
            'usb=(), '
            'bluetooth=()'
        )

        # CSP. La API devuelve JSON y no debe cargar ningún recurso: 'none'.
        # /admin/ NO es la API: es HTML de Django con su propio CSS, JS e
        # imágenes servidos del mismo origen. Con 'none' el panel se renderiza
        # sin estilos y el navegador bloquea imágenes como el QR de alta del
        # dispositivo TOTP (el fallback del template lo confunde con "falta el
        # paquete qrcode"). Se le da la política mínima que lo deja funcionar.
        if request.path.startswith('/admin/'):
            response['Content-Security-Policy'] = (
                "default-src 'self'; "
                "img-src 'self' data:; "          # iconos del admin y el QR (SVG)
                "style-src 'self' 'unsafe-inline'; "  # el admin usa atributos style=
                "frame-ancestors 'none';"
            )
        else:
            response['Content-Security-Policy'] = (
                "default-src 'none'; "
                "frame-ancestors 'none';"
            )

        # Ocultar información del servidor
        response['Server'] = 'Server'

        # HSTS — DESACTIVADO INTENCIONALMENTE
        # Activar ÚNICAMENTE cuando HTTPS esté configurado en producción.
        # Una vez activado con preload, es muy difícil de revertir.
        # Descomentar cuando esté listo:
        # response['Strict-Transport-Security'] = (
        #     'max-age=31536000; includeSubDomains; preload'
        # )

        return response