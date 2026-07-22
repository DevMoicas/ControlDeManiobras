# IPRateLimitMiddleware ELIMINADO (tarea 3.1.5 del plan de despliegue).
#
# Tenía tres defectos y ninguno se arreglaba configurándolo:
#
# 1. Leía X-Forwarded-For[0], que es la posición que ESCRIBE EL CLIENTE. Los
#    proxies añaden por la derecha, así que ese índice es siempre el valor del
#    atacante. Se saltaba rotando una cabecera.
# 2. Su diccionario _hits usaba esa cadena arbitraria como clave y NUNCA
#    borraba entradas. Con el límite de cabecera de gunicorn en 8 KB, unas
#    130.000 peticiones bastaban para agotar 1 GB en una máquina de 1,75 GB:
#    el middleware anti-DoS era, él mismo, el vector de DoS más practicable.
# 3. Estado en memoria por proceso: con 3 workers el límite real era el triple
#    y dependía de qué worker atendiera cada petición.
#
# Lo sustituye el throttle de DRF, que ya estaba activo (30/min anónimo,
# 200/min autenticado) y ahora identifica bien al cliente vía api/client_ip.py.
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