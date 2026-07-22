from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer
import logging
import re

logger = logging.getLogger(__name__)

# Canal aparte para eventos de seguridad (login, lockouts, accesos denegados).
# Va a INFO mientras que 'api' se queda en ERROR: son eventos esperados, no fallos.
security_logger = logging.getLogger('api.security')


def client_ip(request):
    """IP del cliente resuelta igual que la resuelve django-axes, para que el log
    de seguridad y el lockout hablen siempre de la misma IP.

    ponytail: hereda la confianza en X-Forwarded-For que tenga configurada axes;
    endurecerla depende de cuántos proxies mete Azure delante (Fase 5 del plan
    de despliegue, tareas 3.1.5/3.1.6).
    """
    if request is None:
        return '-'
    from axes.helpers import get_client_ip_address
    return get_client_ip_address(request) or '-'


def usuario_de(request):
    """Username autenticado, o 'anonimo'. Nunca lanza."""
    return getattr(getattr(request, 'user', None), 'username', '') or 'anonimo'


def _es_login(context):
    """True si la petición es al endpoint de login (url_name='login' en api/urls.py).
    Se compara por nombre de ruta, no por path, para que mover la URL no lo rompa."""
    match = getattr(context.get('request'), 'resolver_match', None)
    return getattr(match, 'url_name', None) == 'login'


def _build_validation_response(detail):
    return Response(
        {
            "error": "No se pudo crear el registro",
            "detail": detail,
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def _parse_integrity_error(exc):
    message = str(exc)

    match = re.search(r'Key \((?P<field>[^)]+)\)=\((?P<value>[^)]*)\) already exists\.', message)
    if match:
        field = match.group('field')
        value = match.group('value')
        return {
            field: [f'Ya existe un registro con el valor "{value}".']
        }

    match = re.search(r'null value in column "(?P<column>[^"]+)" violates not-null constraint', message)
    if match:
        column = match.group('column')
        return {
            column: ['Este campo es requerido.']
        }

    match = re.search(r'violates foreign key constraint "(?P<constraint>[^"]+)"', message)
    if match:
        constraint = match.group('constraint')
        field = constraint.split('_')[1] if '_' in constraint else 'detail'
        return {
            field: ['La referencia indicada no existe.']
        }

    return {
        'detail': ['No se pudo crear el registro por una restricción de la base de datos.']
    }

def custom_exception_handler(exc, context):
    # Llama primero al gestor de excepciones por defecto de DRF para obtener la respuesta estándar.
    response = exception_handler(exc, context)

    # 401/403: único punto por el que pasan todos los accesos denegados de DRF.
    # El login se excluye: su fallo ya lo registra la señal user_login_failed con
    # el usuario que se intentó, y aquí saldría siempre "anonimo POST /api/login/".
    if response is not None and response.status_code in (401, 403) and not _es_login(context):
        request = context.get('request')
        security_logger.warning(
            "acceso denegado %s user=%s ip=%s %s %s",
            response.status_code,
            usuario_de(request),
            client_ip(request),
            getattr(request, 'method', '-'),
            getattr(request, 'path', '-'),
        )
        # ── SONDA TEMPORAL — QUITAR TRAS MEDIR (tareas 3.1.5/3.1.6) ──────────
        # Mide cuántos proxies mete Azure delante y si alguno aporta una
        # cabecera de IP propia que el cliente no pueda falsificar. Sin este
        # dato, elegir el índice del X-Forwarded-For es adivinar: quedarse
        # corto significa leer el valor del atacante y pasarse significa
        # bloquear por la IP del proxy, o sea a todos a la vez.
        # Se excluye cualquier cabecera con pinta de credencial.
        if request is not None:
            sonda = {
                k: v for k, v in request.META.items()
                if (k.startswith('HTTP_X_') or k in ('REMOTE_ADDR', 'HTTP_HOST'))
                and not any(s in k for s in ('PRINCIPAL', 'TOKEN', 'KEY', 'SECRET', 'AUTH'))
            }
            security_logger.warning("SONDA-PROXY %r", sonda)

    if response is None and isinstance(exc, DjangoValidationError):
        if hasattr(exc, 'message_dict'):
            return _build_validation_response(exc.message_dict)
        return _build_validation_response(exc.messages)

    if response is None and isinstance(exc, IntegrityError):
        return _build_validation_response(_parse_integrity_error(exc))

    # Si la respuesta es None, significa que DRF no manejó la excepción (ej: errores de base de datos, KeyError, etc.)
    if response is None:
        # Registramos los detalles reales del error en los logs del servidor para diagnóstico.
        logger.exception("Unhandled server exception: %s", exc)
        
        # Devolvemos una respuesta 500 genérica y segura al navegador/cliente.
        # Incluye 'error' para cumplir con los criterios de Jira y 'detail' para compatibilidad con el cliente frontend.
        response = Response(
            {
                "error": "Ha ocurrido un error inesperado",
                "detail": "Ha ocurrido un error inesperado"
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    # En caso de un error 500, nos aseguramos de devolver la respuesta estrictamente como JSON puro,
    # ignorando el renderizador de DRF para HTML/Browsable API.
    if response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR:
        response.accepted_renderer = JSONRenderer()
        response.accepted_media_type = "application/json"
        response.renderer_context = {}

    return response
