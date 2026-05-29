from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer
import logging
import re

logger = logging.getLogger(__name__)


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
