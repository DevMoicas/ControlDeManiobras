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