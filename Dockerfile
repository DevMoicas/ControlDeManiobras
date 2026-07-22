# Backend Django + DRF con LibreOffice headless para convertir los formatos
# Excel de Carta Porte a PDF. Destino: Azure Container Apps (1 vCPU / 2 GB,
# 1 réplica siempre encendida — arrancar LibreOffice en frío es lento).
#
# Misma versión menor de Python que el entorno de desarrollo (3.14) para no
# encontrarnos diferencias de comportamiento solo en producción.
FROM python:3.14-slim

# ── Sistema ───────────────────────────────────────────────────────────────────
# libreoffice-calc: SOLO el módulo de hojas de cálculo. El paquete completo
# (libreoffice) añade Writer, Impress, Draw y Base — cientos de MB que esta
# aplicación nunca usa: solo convierte .xlsx a PDF.
# fonts-dejavu-core: sin fuentes, el PDF sale con cuadros en vez de texto.
# ponytail: sin default-jre a propósito. La conversión xlsx→pdf no lo necesita
# y añade ~180 MB. Si algún día falla una fórmula que sí lo requiera, se añade.
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        libreoffice-calc \
        fonts-dejavu-core \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Python ────────────────────────────────────────────────────────────────────
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Las dependencias en su propia capa: solo se reinstalan si cambia el archivo.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# ── Usuario no-root ───────────────────────────────────────────────────────────
# LibreOffice necesita un HOME donde escribir su perfil. La aplicación además
# le pasa un HOME temporal por conversión (ver _xlsx_a_pdf), pero el usuario
# necesita uno propio y con permisos para que el primer arranque no falle.
RUN useradd --create-home --home-dir /home/app --shell /usr/sbin/nologin app
ENV HOME=/home/app

# collectstatic corre en el build, no en el arranque: así la imagen ya trae los
# estáticos y el contenedor levanta más rápido. Necesita que los settings
# carguen, y settings.py aborta sin DJANGO_SECRET_KEY — se le pasa una de
# usar y tirar SOLO para este paso. La real llega por variable de entorno en
# tiempo de ejecución (secretos de plataforma, decisión F4).
RUN DJANGO_SECRET_KEY=solo-para-el-build \
    DJANGO_DEBUG=False \
    python Manage.py collectstatic --noinput \
    && chown -R app:app /app /home/app

USER app

EXPOSE 8000

# 3 workers para 1 vCPU y ~6 usuarios concurrentes (decisión A2). El timeout
# alto es deliberado: una conversión de LibreOffice puede tardar varios
# segundos y la aplicación ya la corta a los 60 s por su cuenta.
#
# gthread + 4 hilos: los workers 'sync' (el defecto) atienden UNA petición cada
# uno, así que la API entera soportaba 3 peticiones a la vez. Con la Carta Porte
# tardando ~9 s, tres a la vez dejaban la aplicación bloqueada para todos.
# La carga es de espera, no de cálculo —consultas a la BD y el subproceso de
# LibreOffice—, que es justo donde los hilos rinden: 3x4 = 12 concurrentes sin
# gastar un peso ni tocar la arquitectura.
CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--worker-class", "gthread", \
     "--threads", "4", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
