"""Smoke test del contenedor: genera una Carta Porte real en PDF.

Es la única prueba que valida de verdad el punto más frágil del despliegue —
LibreOffice headless convirtiendo el .xlsx a PDF dentro de la imagen. No toca
la base de datos: `_generar_pdf_cta_port` es una función pura sobre el template.

Uso:  docker run --rm -e DJANGO_SECRET_KEY=x <imagen> python smoke_pdf.py
"""
import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ.setdefault('DJANGO_SECRET_KEY', 'solo-para-el-smoke-test')

import django

django.setup()

from api.views import _generar_pdf_cta_port, _TEMPLATE_PATH

# Un full con dos contenedores: ejercita el camino nuevo de A17/A18/A19 además
# de la conversión en sí.
DATOS = {
    'folio': 'SMOKE-1',
    'formato': 'pdf',
    'tipo_servicio': 'full',
    'tipo': '20 - 40 / DC - HC',
    'peso': '8376 - 12117',
    'contenedor': 'CBHU4284545 - TLLU3548653',
    'origen': 'MANZANILLO',
    'destino': 'QUERETARO',
    'cliente_nombre': 'CLIENTE DE PRUEBA',
    'operador': 'OPERADOR DE PRUEBA',
    'placas': 'ABC-123',
}

resp = _generar_pdf_cta_port(DATOS, _TEMPLATE_PATH, 'smoke.pdf', formato='pdf')

status = getattr(resp, 'status_code', None)
if status != 200:
    detalle = getattr(resp, 'data', None)
    print(f'FALLO: la vista devolvio HTTP {status} -- {detalle}', file=sys.stderr)
    sys.exit(1)

contenido = resp.content
if not contenido.startswith(b'%PDF'):
    print(f'FALLO: la respuesta no es un PDF (empieza por {contenido[:20]!r})', file=sys.stderr)
    sys.exit(1)

# Un PDF de una hoja con contenido pesa bastante más que esto; por debajo
# significa que LibreOffice devolvio algo vacio o truncado.
if len(contenido) < 5000:
    print(f'FALLO: el PDF pesa solo {len(contenido)} bytes, parece vacio', file=sys.stderr)
    sys.exit(1)

print(f'OK: Carta Porte generada -- {len(contenido)} bytes, cabecera {contenido[:8]!r}')
