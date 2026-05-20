from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer
import logging

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    # Llama primero al gestor de excepciones por defecto de DRF para obtener la respuesta estándar.
    response = exception_handler(exc, context)

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
