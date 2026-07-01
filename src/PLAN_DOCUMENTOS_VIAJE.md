# PLAN — DocumentosViajePage: Bitácora de Sueño y CTA Port Fraba Container

## Convenciones del plan

- Cada paso es secuencial y debe ejecutarse en el orden indicado.
- Nunca modificar nada fuera del alcance de cada paso.
- "AGREGAR" = añadir sin borrar lo existente, a menos que se indique lo contrario.
- "REEMPLAZAR" = sustituir exactamente el bloque señalado.
- Todos los paths son relativos a la raíz del proyecto Django (donde vive `manage.py`).
- Verificar cada paso antes de continuar con el siguiente.

---

## PRE-REQUISITO DE SISTEMA (ejecutar en el servidor, NO es código del proyecto)

### Instalar LibreOffice (si no está instalado)
```bash
sudo apt-get update && sudo apt-get install -y libreoffice
libreoffice --version   # verificar instalación, debe mostrar versión
```

### Instalar openpyxl (si no está instalado)
```bash
pip install openpyxl --break-system-packages
python -c "import openpyxl; print(openpyxl.__version__)"  # verificar
```

---

## PRE-REQUISITO DE ARCHIVO: Copiar template Excel al proyecto

Crear la siguiente estructura de directorios y copiar el archivo template:

```
api/
└── documentos/
    └── templates/
        └── CTA_PTE_FORMATO.xlsx   ← ESTE ES EL ARCHIVO TEMPLATE
```

**Instrucción exacta para Claude Code:**
1. Crear el directorio `api/documentos/templates/` (incluyendo padres).
2. Copiar el archivo `/mnt/user-data/uploads/CTA_PTE_FORMATO_PARA_CLAUDE.xlsx` a `api/documentos/templates/CTA_PTE_FORMATO.xlsx`.
3. NO se debe crear ningún `__init__.py` en `api/documentos/` ni en `api/documentos/templates/` porque son directorios de datos, no paquetes Python.

---

## FASE 1: BACKEND

---

### PASO 1 — SQL en pgAdmin (ejecutar ANTES de cualquier migración)

Ejecutar el siguiente SQL directamente en pgAdmin sobre la base de datos del proyecto.
Usar `IF NOT EXISTS` para que sea idempotente.

```sql
-- Columnas nuevas para la tabla maniobras (managed=False)
ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS tipo       VARCHAR(100)    NULL;
ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS peso       DECIMAL(10, 2)  NULL;
ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS referencia VARCHAR(255)     NULL;
```

**No tocar** la columna `tipo_y_peso` existente. Solo se agregan las tres nuevas.

---

### PASO 2 — `api/models.py`: Modificar modelos Maniobra y Cliente

#### 2a. En la clase `Maniobra`

Localizar el bloque de campos del modelo `Maniobra`. Después del campo `tipo_y_peso` (sin borrar `tipo_y_peso`), AGREGAR los tres campos siguientes en este orden exacto:

```python
tipo       = models.CharField(max_length=100, null=True, blank=True)
peso       = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
```

Localizar el campo `contenedor` en la clase `Maniobra`. Inmediatamente después de la declaración de `contenedor`, AGREGAR:

```python
referencia = models.CharField(max_length=255, null=True, blank=True)
```

**Resultado esperado del bloque relevante en Maniobra (orden de declaración):**
```python
tipo_y_peso  = models.CharField(max_length=255, null=True, blank=True)
tipo         = models.CharField(max_length=100, null=True, blank=True)
peso         = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
contenedor   = models.CharField(max_length=255, null=True, blank=True)
referencia   = models.CharField(max_length=255, null=True, blank=True)
pedimento    = models.CharField(max_length=255, null=True, blank=True)
```

(El orden de `pedimento` y campos posteriores NO cambia.)

#### 2b. En la clase `Cliente`

Localizar la clase `Cliente`. Después del campo `domicilio`, AGREGAR los dos campos siguientes:

```python
colonia = models.CharField(max_length=255, blank=True, default='')
ciudad  = models.CharField(max_length=255, blank=True, default='')
```

**Resultado esperado del bloque de campos en Cliente:**
```python
nombre_cliente = models.CharField(max_length=255)
domicilio      = models.TextField(blank=True, default='')
colonia        = models.CharField(max_length=255, blank=True, default='')
ciudad         = models.CharField(max_length=255, blank=True, default='')
```

---

### PASO 3 — Ejecutar la migración

```bash
python manage.py makemigrations api --name="add_tipo_peso_referencia_maniobra_colonia_ciudad_cliente"
python manage.py migrate
```

Verificar que la migración corre sin errores antes de continuar.

---

### PASO 4 — `api/Serializers.py`: Verificar ClienteSerializer

`ManiobraSerializer` ya usa `fields = '__all__'` y automáticamente incluirá `tipo`, `peso` y `referencia`. No requiere cambio.

Para `ClienteSerializer` (buscar la clase en el archivo):
- Si usa `fields = '__all__'`: no requiere cambio, ya incluirá `colonia` y `ciudad`.
- Si usa una lista explícita de campos en `fields`: AGREGAR `'colonia'` y `'ciudad'` a esa lista.

---

### PASO 5 — `api/views.py`: Agregar acción `folios_recientes` en `ManiobraViewSet`

Dentro de la clase `ManiobraViewSet`, AGREGAR el siguiente método de acción.
Colocarlo ANTES del método `destroy` existente en esa clase.

```python
from rest_framework.decorators import action   # asegurarse de que este import existe

@action(detail=False, methods=['get'], url_path='folios-recientes')
def folios_recientes(self, request):
    """Devuelve los últimos 20 registros de maniobras con folio no vacío."""
    maniobras = (
        Maniobra.objects
        .filter(folio__isnull=False)
        .exclude(folio='')
        .order_by('-id')[:20]
    )
    data = [
        {
            'id':         m.id,
            'folio':      m.folio or '',
            'origen':     m.origen or '',
            'destino':    m.destino or '',
            'contenedor': m.contenedor or '',
            'ccp':        m.ccp or '',
            'pedimento':  m.pedimento or '',
            'tipo':       m.tipo or '',
            'peso':       str(m.peso) if m.peso is not None else '',
            'referencia': m.referencia or '',
        }
        for m in maniobras
    ]
    return Response(data)
```

**Verificar que el import `from rest_framework.decorators import action` está presente** en los imports del archivo. Si no está, AGREGARLO a la sección de imports.

---

### PASO 6 — `api/views.py`: Agregar vistas de generación de documentos

#### 6a. Verificar/agregar imports necesarios al inicio de `views.py`

Buscar la sección de imports al inicio del archivo. AGREGAR los siguientes imports solo si no están ya presentes (no duplicar):

```python
import os
import subprocess
import tempfile
from django.conf import settings
from django.http import FileResponse, HttpResponse
from openpyxl import load_workbook
from rest_framework.views import APIView
```

#### 6b. Definir la ruta al template

Inmediatamente ANTES de la definición de la primera clase de vista (antes de cualquier `class ...ViewSet` o `class ...View`), AGREGAR la siguiente constante de módulo:

```python
# ── Documentos de viaje ──────────────────────────────────────────────────────
_TEMPLATE_PATH = (
    settings.BASE_DIR / 'api' / 'documentos' / 'templates' / 'CTA_PTE_FORMATO.xlsx'
)
```

#### 6c. Función auxiliar de conversión LibreOffice

AGREGAR la siguiente función auxiliar después de la constante `_TEMPLATE_PATH` y antes de los ViewSets existentes:

```python
def _xlsx_a_pdf(xlsx_path: str, output_dir: str) -> str:
    """
    Convierte un archivo .xlsx a PDF usando LibreOffice headless.
    Devuelve la ruta al PDF generado.
    Lanza Exception si LibreOffice retorna error.
    """
    env = os.environ.copy()
    env['HOME'] = output_dir   # LibreOffice necesita HOME para su perfil temporal

    result = subprocess.run(
        [
            'libreoffice',
            '--headless',
            '--norestore',
            '--convert-to', 'pdf',
            '--outdir', output_dir,
            xlsx_path,
        ],
        capture_output=True,
        timeout=60,
        env=env,
    )

    if result.returncode != 0:
        raise Exception(
            f"LibreOffice falló (código {result.returncode}): "
            f"{result.stderr.decode('utf-8', errors='replace')}"
        )

    pdf_name = os.path.splitext(os.path.basename(xlsx_path))[0] + '.pdf'
    pdf_path = os.path.join(output_dir, pdf_name)

    if not os.path.exists(pdf_path):
        raise Exception("LibreOffice no generó el archivo PDF esperado.")

    return pdf_path
```

#### 6d. Función auxiliar de concatenación de placas/remolques

AGREGAR inmediatamente después de `_xlsx_a_pdf`:

```python
def _concat_placas_remolques(placas: str, remolque_1: str, remolque_2: str) -> str:
    """
    Construye la cadena concatenada de placas y remolques.
    Formato:
      - Sin remolques:    "ABC-123"
      - Un remolque:      "ABC-123 / DEF-456"
      - Dos remolques:    "ABC-123 / DEF-456, GHI-789"
    """
    remolques = [r.strip() for r in [remolque_1, remolque_2] if r and r.strip()]
    if remolques:
        return f"{placas.strip()} / {', '.join(remolques)}"
    return placas.strip()
```

#### 6e. Vista para BITÁCORA DE SUEÑO

AGREGAR la siguiente clase al final de `views.py`, después del último ViewSet existente:

```python
class DocumentoBitacoraSuenoView(APIView):
    """
    POST /api/documentos/bitacora-sueno/
    Recibe datos del formulario, llena la hoja 'BITACORA DE SUEÑO'
    del template Excel y devuelve el PDF generado.
    Requiere autenticación JWT.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def post(self, request):
        # ── Leer datos del body ────────────────────────────────────────────────
        operador    = request.data.get('operador', '').strip()
        placas      = request.data.get('placas', '').strip()
        remolque_1  = request.data.get('remolque_1', '').strip()
        remolque_2  = request.data.get('remolque_2', '').strip()
        folio       = request.data.get('folio', '').strip()
        unidad      = request.data.get('unidad', '').strip()    # tracto.unidad (Tipo de Unidad)
        anio        = request.data.get('anio', '').strip()      # tracto.anio   (Modelo)
        origen      = request.data.get('origen', '').strip()
        destino     = request.data.get('destino', '').strip()
        fecha_salida  = request.data.get('fecha_salida', '').strip()   # DD/MM/YYYY
        fecha_llegada = request.data.get('fecha_llegada', '').strip()  # DD/MM/YYYY

        # ── Validación mínima ──────────────────────────────────────────────────
        if not placas:
            return Response({'detail': 'El campo placas es requerido.'}, status=400)

        # ── Construir valor concatenado (D9 y B11) ────────────────────────────
        concat_valor = _concat_placas_remolques(placas, remolque_1, remolque_2)

        # ── Abrir template y trabajar en directorio temporal ──────────────────
        try:
            with tempfile.TemporaryDirectory() as tmp_dir:
                wb = load_workbook(str(_TEMPLATE_PATH))  # data_only=False → preserva fórmulas
                ws = wb['BITACORA DE SUEÑO']

                # Escribir valores en las celdas objetivo
                ws['L7']  = operador       # Nombre del operador
                ws['D9']  = concat_valor   # Vehículo / remolques (concatenado)
                ws['U9']  = folio          # CTA Porte (folio)
                ws['B11'] = concat_valor   # Placas (mismo concatenado — vinculado a CTA PORT via fórmula existente)
                ws['O11'] = unidad         # Tipo de Unidad
                ws['X11'] = anio           # Modelo (año)
                ws['E13'] = origen         # Origen del viaje
                ws['P13'] = destino        # Destino del viaje
                ws['E15'] = fecha_salida   # Fecha de salida (DD/MM/YYYY)
                ws['O15'] = fecha_llegada  # Fecha de llegada (DD/MM/YYYY)
                # NOTA: D33 tiene la fórmula '=L7' — se deja intacta.
                # LibreOffice la evaluará al convertir y mostrará el valor de L7.

                # Eliminar las otras hojas para exportar solo BITÁCORA DE SUEÑO
                for nombre_hoja in [n for n in wb.sheetnames if n != 'BITACORA DE SUEÑO']:
                    del wb[nombre_hoja]

                # Guardar xlsx temporal
                xlsx_tmp = os.path.join(tmp_dir, 'bitacora_sueno.xlsx')
                wb.save(xlsx_tmp)

                # Convertir a PDF con LibreOffice
                pdf_path = _xlsx_a_pdf(xlsx_tmp, tmp_dir)

                # Leer PDF y retornar como respuesta binaria
                with open(pdf_path, 'rb') as f:
                    pdf_bytes = f.read()

            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = 'attachment; filename="bitacora_sueno.pdf"'
            return response

        except FileNotFoundError:
            return Response(
                {'detail': 'No se encontró el template Excel. Contacte al administrador.'},
                status=500,
            )
        except subprocess.TimeoutExpired:
            return Response(
                {'detail': 'La conversión a PDF tardó demasiado. Intente de nuevo.'},
                status=500,
            )
        except Exception as exc:
            return Response(
                {'detail': f'Error al generar el documento: {str(exc)}'},
                status=500,
            )
```

#### 6f. Vista para CTA PORT FRABA CONTAINER

AGREGAR la siguiente clase inmediatamente después de `DocumentoBitacoraSuenoView`:

```python
class DocumentoCtaPortView(APIView):
    """
    POST /api/documentos/cta-port/
    Recibe datos del formulario, llena la hoja 'CTA PORT FRABA CONTAINER'
    del template Excel y devuelve el PDF generado.
    Requiere autenticación JWT.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def post(self, request):
        # ── Leer datos del body ────────────────────────────────────────────────
        folio       = request.data.get('folio', '').strip()
        ccp         = request.data.get('ccp', '').strip()
        origen      = request.data.get('origen', '').strip()
        destino     = request.data.get('destino', '').strip()

        # Datos del cliente
        cliente_nombre   = request.data.get('cliente_nombre', '').strip()
        cliente_domicilio = request.data.get('cliente_domicilio', '').strip()
        cliente_colonia  = request.data.get('cliente_colonia', '').strip()
        cliente_ciudad   = request.data.get('cliente_ciudad', '').strip()

        # Datos de la carga (auto-llenados desde maniobra via folio)
        tipo       = request.data.get('tipo', '').strip()
        peso_raw   = request.data.get('peso', '')
        contenedor = request.data.get('contenedor', '').strip()
        pedimento  = request.data.get('pedimento', '').strip()
        referencia = request.data.get('referencia', '').strip()

        # Datos de texto libre
        descripcion = request.data.get('descripcion', '').strip()
        clave_sat   = request.data.get('clave_sat', '').strip()

        # Conductor y placas (independientes de BITÁCORA DE SUEÑO)
        operador   = request.data.get('operador', '').strip()
        placas     = request.data.get('placas', '').strip()
        remolque_1 = request.data.get('remolque_1', '').strip()
        remolque_2 = request.data.get('remolque_2', '').strip()

        # ── Validación mínima ──────────────────────────────────────────────────
        if not folio:
            return Response({'detail': 'El campo folio (Remisión) es requerido.'}, status=400)

        # ── Cálculos derivados ─────────────────────────────────────────────────
        # Valor de celda J2: "folio / ccp"
        remision_valor = f"{folio} / {ccp}" if ccp else folio

        # Lógica full / sencillo: contenedor.length > 12 → full
        es_full = len(contenedor) > 12
        cantidad_label = 2 if es_full else 1
        tipo_label     = 'contenedores' if es_full else 'Contenedor'

        # Clave SAT: "CLAVE SAT:" + valor
        clave_sat_celda = f"CLAVE SAT:{clave_sat}" if clave_sat else ''

        # Peso numérico
        try:
            peso_valor = float(peso_raw) if peso_raw else ''
        except (ValueError, TypeError):
            peso_valor = ''

        # Concatenado conductor/placas para celdas C23 y F23
        concat_placas = _concat_placas_remolques(placas, remolque_1, remolque_2)

        # ── Abrir template y trabajar en directorio temporal ──────────────────
        try:
            with tempfile.TemporaryDirectory() as tmp_dir:
                wb = load_workbook(str(_TEMPLATE_PATH))
                ws = wb['CTA PORT FRABA CONTAINER']

                # Remisión: J2 (celda superior del rango fusionado J2:J3)
                ws['J2'] = remision_valor

                # Origen y Destino
                ws['B6'] = origen
                ws['G6'] = destino

                # Datos del cliente
                ws['G7']  = cliente_nombre
                ws['G8']  = cliente_domicilio
                ws['G9']  = cliente_colonia
                ws['G10'] = cliente_ciudad

                # Tabla de bultos
                ws['A17'] = cantidad_label    # 1 o 2
                ws['B17'] = tipo_label        # 'Contenedor' o 'contenedores'
                ws['C16'] = referencia        # Referencia
                ws['C17'] = contenedor        # No. de contenedor
                ws['C18'] = pedimento         # Pedimento
                ws['A18'] = tipo              # Tipo (20 PIES, etc.)
                ws['F17'] = peso_valor        # Peso numérico

                # Descripción y Clave SAT
                ws['C20'] = descripcion
                ws['C21'] = clave_sat_celda

                # Conductor y Placas
                # Se sobreescriben las fórmulas cruzadas con valores directos
                # para que el PDF sea autónomo sin necesidad de la otra hoja.
                ws['C23'] = operador
                ws['F23'] = concat_placas

                # Eliminar las otras hojas para exportar solo CTA PORT
                for nombre_hoja in [n for n in wb.sheetnames if n != 'CTA PORT FRABA CONTAINER']:
                    del wb[nombre_hoja]

                # Guardar xlsx temporal
                xlsx_tmp = os.path.join(tmp_dir, 'cta_port.xlsx')
                wb.save(xlsx_tmp)

                # Convertir a PDF con LibreOffice
                pdf_path = _xlsx_a_pdf(xlsx_tmp, tmp_dir)

                # Leer PDF y retornar
                with open(pdf_path, 'rb') as f:
                    pdf_bytes = f.read()

            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = 'attachment; filename="cta_port.pdf"'
            return response

        except FileNotFoundError:
            return Response(
                {'detail': 'No se encontró el template Excel. Contacte al administrador.'},
                status=500,
            )
        except subprocess.TimeoutExpired:
            return Response(
                {'detail': 'La conversión a PDF tardó demasiado. Intente de nuevo.'},
                status=500,
            )
        except Exception as exc:
            return Response(
                {'detail': f'Error al generar el documento: {str(exc)}'},
                status=500,
            )
```

---

### PASO 7 — `api/urls.py`: Registrar las nuevas URLs

En `api/urls.py`, verificar que `DocumentoBitacoraSuenoView` y `DocumentoCtaPortView` están importadas desde `views.py`.

En la sección de imports, AGREGAR (si no está):
```python
from .views import (
    # ... imports existentes ...
    DocumentoBitacoraSuenoView,
    DocumentoCtaPortView,
)
```

En la lista `urlpatterns`, AGREGAR los dos paths siguientes DESPUÉS de los `router.urls` existentes y ANTES de cualquier path de token:

```python
path('documentos/bitacora-sueno/', DocumentoBitacoraSuenoView.as_view(), name='bitacora-sueno'),
path('documentos/cta-port/',       DocumentoCtaPortView.as_view(),        name='cta-port'),
```

**Resultado esperado del patrón `urlpatterns` (estructura, no literal):**
```python
urlpatterns = [
    path('', include(router.urls)),
    # ... paths de token existentes ...
    path('documentos/bitacora-sueno/', DocumentoBitacoraSuenoView.as_view(), name='bitacora-sueno'),
    path('documentos/cta-port/',       DocumentoCtaPortView.as_view(),        name='cta-port'),
]
```

---

## FASE 2: CAMBIOS EN FRONTEND EXISTENTE

---

### PASO 8 — `src/api/apiClient.js`: Agregar método `download`

El método `download` hace POST y devuelve un `Blob` (para descarga de archivos binarios como PDFs).
El método `request` existente siempre llama a `response.json()` al final; no lo modificamos.
En su lugar, agregamos una nueva función separada.

Al final del archivo, dentro del objeto `apiClient`, AGREGAR el siguiente método después de `upload`:

```js
download: async (endpoint, body) => {
  const token = localStorage.getItem("accessToken");
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    window.dispatchEvent(new Event("auth:expired"));
    throw new Error("Sesión expirada.");
  }
  if (!response.ok) {
    let mensaje = `Error ${response.status}`;
    try {
      const err = await response.json();
      mensaje = err.detail || mensaje;
    } catch (_) { /* ignorar */ }
    throw new Error(mensaje);
  }

  return response.blob();
},
```

**Nota:** El objeto `apiClient` exportado queda como:
```js
export const apiClient = {
  get:      ...,
  post:     ...,
  put:      ...,
  patch:    ...,
  delete:   ...,
  upload:   ...,
  download: ...,   ← nuevo
};
```

---

### PASO 9 — `src/pages/ManiobrasPage.jsx`: Actualizar columnas y lógica full/sencillo

#### 9a. Cambiar umbral full/sencillo

Buscar en ManiobrasPage.jsx la siguiente comparación (aparece en al menos dos lugares: FilaNueva y ModalEditar):

```js
(datos.contenedor || "").length <= 32
```

REEMPLAZAR TODAS las ocurrencias de este valor por:

```js
(datos.contenedor || "").length <= 12
```

Solo se debe cambiar el número `32` por `12`. No modificar nada más en esas líneas.

#### 9b. Actualizar el array `COLUMNAS`

Localizar el array `COLUMNAS` definido en ManiobrasPage.jsx.

**Cambios en COLUMNAS:**

1. ELIMINAR la entrada de `tipo_y_peso`:
```js
{ key: "tipo_y_peso", label: "Tipo y Peso" },
```

2. En su lugar, AGREGAR las dos entradas siguientes (en el mismo sitio donde estaba `tipo_y_peso`, entre `horario` y `contenedor`):
```js
{ key: "tipo",  label: "Tipo" },
{ key: "peso",  label: "Peso" },
```

3. Localizar la entrada de `contenedor`:
```js
{ key: "contenedor", label: "Contenedor" },
```
Inmediatamente DESPUÉS de esa entrada, AGREGAR:
```js
{ key: "referencia", label: "Referencia" },
```

**Resultado esperado del bloque afectado en COLUMNAS (orden):**
```js
{ key: "horario",    label: "Horario" },
{ key: "tipo",       label: "Tipo" },
{ key: "peso",       label: "Peso" },
{ key: "contenedor", label: "Contenedor" },
{ key: "referencia", label: "Referencia" },
{ key: "pedimento",  label: "Pedimento" },
```

#### 9c. Actualizar `MANIOBRA_VACIA`

Localizar el objeto `MANIOBRA_VACIA`.

1. ELIMINAR la propiedad `tipo_y_peso: ""`.
2. AGREGAR las siguientes propiedades (en el orden correspondiente a su posición en COLUMNAS):
```js
tipo: "",
peso: "",
referencia: "",
```

**Nota:** `tipo_y_peso` permanece en el modelo Django y en la base de datos. Solo se retira del objeto vacío del formulario de nueva maniobra para que los nuevos registros usen las nuevas columnas separadas. Los registros existentes conservan sus datos en `tipo_y_peso` en la base de datos; esos datos ya no se muestran en la tabla (comportamiento aceptado por el equipo).

---

### PASO 10 — `src/pages/CatalogosPage.jsx`: Agregar colonia y ciudad al formulario de clientes

#### 10a. Actualizar `configFormularios`

Localizar en `CatalogosPage.jsx` el objeto `configFormularios`. Buscar la entrada `clientes`:

```js
clientes: [
  { key: 'nombre_cliente', ... },
  { key: 'domicilio', ... },
]
```

AGREGAR al final del array `clientes`, después de `domicilio`:
```js
{ key: 'colonia', label: 'Colonia',        type: 'text' },
{ key: 'ciudad',  label: 'Ciudad',         type: 'text' },
```

Si los objetos de configuración no tienen propiedad `label` o `type` (ver cómo están definidos los campos existentes en esa sección), respetar el mismo formato que usa la sección `clientes` existente.

#### 10b. Actualizar `TRADUCCIONES_COLUMNAS`

Localizar el objeto `TRADUCCIONES_COLUMNAS`. AGREGAR las siguientes entradas:

```js
colonia: 'Colonia',
ciudad:  'Ciudad',
```

---

## FASE 3: NUEVOS COMPONENTES

---

### PASO 11 — Crear `src/components/FolioSelector/FolioSelector.jsx`

Crear el archivo con el siguiente contenido exacto:

```jsx
import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../api/apiClient";
import "./FolioSelector.css";

/**
 * FolioSelector
 * Muestra los últimos 20 folios de maniobras (con folio no vacío).
 * Al seleccionar, llama a onSelect(maniobraCompleta) con el objeto completo.
 *
 * Props:
 *   currentValue  string   — folio actualmente seleccionado (para mostrar en botón)
 *   onSelect      function — callback recibe el objeto maniobra completo
 *   disabled      boolean  — deshabilita el selector
 */
export default function FolioSelector({ currentValue, onSelect, disabled }) {
  const [abierto, setAbierto]     = useState(false);
  const [folios,  setFolios]      = useState([]);
  const [cargando, setCargando]   = useState(false);
  const [error,   setError]       = useState(null);
  const ref = useRef(null);

  // Cargar folios al montar
  useEffect(() => {
    setCargando(true);
    setError(null);
    apiClient
      .get("/maniobras/folios-recientes/")
      .then((data) => setFolios(data || []))
      .catch(() => setError("Error al cargar folios"))
      .finally(() => setCargando(false));
  }, []);

  // Cerrar con Escape o clic fuera
  useEffect(() => {
    if (!abierto) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setAbierto(false);
    };
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [abierto]);

  const handleSeleccionar = (maniobra) => {
    onSelect(maniobra);
    setAbierto(false);
  };

  return (
    <div className="fsl-wrapper" ref={ref}>
      <button
        type="button"
        className="fsl-btn"
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
      >
        {currentValue || "— Seleccionar folio —"}
      </button>

      {abierto && (
        <div className="fsl-dropdown">
          {cargando && <div className="fsl-msg">Cargando...</div>}
          {error && <div className="fsl-msg fsl-error">{error}</div>}
          {!cargando && !error && folios.length === 0 && (
            <div className="fsl-msg">Sin folios registrados</div>
          )}
          {folios.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`fsl-item ${m.folio === currentValue ? "fsl-item--selected" : ""}`}
              onClick={() => handleSeleccionar(m)}
            >
              <span className="fsl-folio">{m.folio}</span>
              {m.origen && m.destino && (
                <span className="fsl-ruta">{m.origen} → {m.destino}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### PASO 12 — Crear `src/components/FolioSelector/FolioSelector.css`

```css
.fsl-wrapper {
  position: relative;
  display: inline-block;
  width: 100%;
}

.fsl-btn {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  font-size: 0.875rem;
  color: var(--text, #1f2937);
  transition: border-color 0.15s;
}
.fsl-btn:hover:not(:disabled) {
  border-color: var(--primary, #2563eb);
}
.fsl-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fsl-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  min-width: 260px;
  max-height: 280px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}

.fsl-msg {
  padding: 10px 14px;
  font-size: 0.8rem;
  color: var(--text-light, #6b7280);
}
.fsl-error { color: #dc2626; }

.fsl-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.fsl-item:hover {
  background: var(--primary-light, #eaf1ff);
}
.fsl-item--selected {
  background: #dbeafe;
  font-weight: 600;
}

.fsl-folio {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text, #1f2937);
  font-family: monospace;
}
.fsl-ruta {
  font-size: 0.75rem;
  color: var(--text-light, #6b7280);
  margin-top: 1px;
}
```

---

### PASO 13 — Crear `src/components/ClienteSelector/ClienteSelector.jsx`

```jsx
import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../api/apiClient";
import "./ClienteSelector.css";

/**
 * ClienteSelector
 * Lista todos los clientes registrados. Al seleccionar, llama a onSelect(clienteCompleto).
 *
 * Props:
 *   currentValue  string   — nombre del cliente actualmente seleccionado
 *   onSelect      function — callback recibe el objeto cliente completo
 *   disabled      boolean
 */
export default function ClienteSelector({ currentValue, onSelect, disabled }) {
  const [abierto,  setAbierto]  = useState(false);
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error,    setError]    = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    apiClient
      .get("/clientes/")
      .then((data) => setClientes(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => setError("Error al cargar clientes"))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setAbierto(false);
    };
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [abierto]);

  const handleSeleccionar = (cliente) => {
    onSelect(cliente);
    setAbierto(false);
  };

  return (
    <div className="csl-wrapper" ref={ref}>
      <button
        type="button"
        className="csl-btn"
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
      >
        {currentValue || "— Seleccionar cliente —"}
      </button>

      {abierto && (
        <div className="csl-dropdown">
          {cargando && <div className="csl-msg">Cargando...</div>}
          {error && <div className="csl-msg csl-error">{error}</div>}
          {!cargando && !error && clientes.length === 0 && (
            <div className="csl-msg">Sin clientes registrados</div>
          )}
          {clientes.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`csl-item ${c.nombre_cliente === currentValue ? "csl-item--selected" : ""}`}
              onClick={() => handleSeleccionar(c)}
            >
              <span className="csl-nombre">{c.nombre_cliente}</span>
              {c.ciudad && <span className="csl-ciudad">{c.ciudad}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### PASO 14 — Crear `src/components/ClienteSelector/ClienteSelector.css`

```css
.csl-wrapper {
  position: relative;
  display: inline-block;
  width: 100%;
}

.csl-btn {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  font-size: 0.875rem;
  color: var(--text, #1f2937);
  transition: border-color 0.15s;
}
.csl-btn:hover:not(:disabled) {
  border-color: var(--primary, #2563eb);
}
.csl-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.csl-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  min-width: 260px;
  max-height: 300px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}

.csl-msg {
  padding: 10px 14px;
  font-size: 0.8rem;
  color: var(--text-light, #6b7280);
}
.csl-error { color: #dc2626; }

.csl-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.csl-item:hover {
  background: var(--primary-light, #eaf1ff);
}
.csl-item--selected {
  background: #dbeafe;
  font-weight: 600;
}

.csl-nombre {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text, #1f2937);
}
.csl-ciudad {
  font-size: 0.75rem;
  color: var(--text-light, #6b7280);
  margin-top: 1px;
}
```

---

### PASO 15 — Crear `src/components/BitacoraSuenoModal/BitacoraSuenoModal.jsx`

```jsx
import { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import { registerLocale } from "react-datepicker";
import { es } from "date-fns/locale";
import { format } from "date-fns";
import { X, Download, Loader } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import OperadorSelector from "../OperadorSelector/OperadorSelector";
import PlacasSelector from "../PlacasSelector/PlacasSelector";
import RemolqueSelector from "../RemolqueSelector/RemolqueSelector";
import FolioSelector from "../FolioSelector/FolioSelector";
import "react-datepicker/dist/react-datepicker.css";
import "./BitacoraSuenoModal.css";

registerLocale("es", es);

const ESTADO_INICIAL = {
  operador:     "",
  placas:       "",
  remolque_1:   "",
  remolque_2:   "",
  folio:        "",
  unidad:       "",   // auto desde tracto.unidad al elegir placas
  anio:         "",   // auto desde tracto.anio al elegir placas
  origen:       "",   // auto al elegir folio
  destino:      "",   // auto al elegir folio
  contenedor:   "",   // auto al elegir folio (para lógica full/sencillo)
  fecha_salida: null, // Date object
  fecha_llegada: null,
};

/**
 * BitacoraSuenoModal
 * Formulario para llenar la hoja "BITÁCORA DE SUEÑO" y descargar su PDF.
 *
 * Props:
 *   onCerrar  function — cierra el modal
 */
export default function BitacoraSuenoModal({ onCerrar }) {
  const [datos,      setDatos]      = useState(ESTADO_INICIAL);
  const [generando,  setGenerando]  = useState(false);
  const [error,      setError]      = useState(null);
  const [exito,      setExito]      = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCerrar]);

  // Auto-dismiss del mensaje de éxito
  useEffect(() => {
    if (!exito) return;
    const t = setTimeout(() => setExito(false), 3000);
    return () => clearTimeout(t);
  }, [exito]);

  // ── Handlers de selección ──────────────────────────────────────────────────

  const handleOperador = (nombre) => {
    setDatos((p) => ({ ...p, operador: nombre }));
  };

  const handlePlacas = (tracto) => {
    // tracto: { placas, no_eco, unidad, anio, ... } — usando el objeto completo del selector
    setDatos((p) => ({
      ...p,
      placas: tracto.placas || "",
      unidad: tracto.unidad || "",
      anio:   String(tracto.anio || ""),
    }));
  };

  const handleRemolque1 = (remolque) => {
    setDatos((p) => ({ ...p, remolque_1: remolque.placas || "" }));
  };

  const handleRemolque2 = (remolque) => {
    setDatos((p) => ({ ...p, remolque_2: remolque.placas || "" }));
  };

  const handleFolio = (maniobra) => {
    setDatos((p) => ({
      ...p,
      folio:      maniobra.folio     || "",
      origen:     maniobra.origen    || "",
      destino:    maniobra.destino   || "",
      contenedor: maniobra.contenedor || "",
    }));
  };

  // ── Lógica remolque 2: habilitado solo si hay folio Y contenedor > 12 chars ─
  const remolque2Habilitado = (datos.contenedor || "").length > 12;

  // ── Generar PDF ────────────────────────────────────────────────────────────

  const handleGenerar = async () => {
    setError(null);
    setGenerando(true);

    try {
      const payload = {
        operador:      datos.operador,
        placas:        datos.placas,
        remolque_1:    datos.remolque_1,
        remolque_2:    datos.remolque_2,
        folio:         datos.folio,
        unidad:        datos.unidad,
        anio:          datos.anio,
        origen:        datos.origen,
        destino:       datos.destino,
        fecha_salida:  datos.fecha_salida
          ? format(datos.fecha_salida, "dd/MM/yyyy")
          : "",
        fecha_llegada: datos.fecha_llegada
          ? format(datos.fecha_llegada, "dd/MM/yyyy")
          : "",
      };

      const blob = await apiClient.download("/documentos/bitacora-sueno/", payload);

      // Crear enlace de descarga temporal
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href     = url;
      link.download = "bitacora_sueno.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setExito(true);
    } catch (err) {
      setError(err.message || "Error al generar el PDF.");
    } finally {
      setGenerando(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bsm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="bsm-modal">
        {/* Header */}
        <div className="bsm-header">
          <h2 className="bsm-titulo">Bitácora de Sueño</h2>
          <button type="button" className="bsm-cerrar" onClick={onCerrar}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="bsm-body">

          {/* Operador */}
          <div className="bsm-campo">
            <label className="bsm-label">Nombre del Operador <span className="bsm-req">*</span></label>
            <OperadorSelector
              currentValue={datos.operador}
              onSelect={handleOperador}
              disabled={false}
            />
          </div>

          {/* Placas y Remolques */}
          <div className="bsm-campo">
            <label className="bsm-label">Placas y Remolques</label>
            <div className="bsm-fila-selectores">
              <div className="bsm-selector-item">
                <span className="bsm-sub-label">Placas</span>
                <PlacasSelector
                  currentValue={datos.placas}
                  onSelect={handlePlacas}
                  disabled={false}
                />
              </div>
              <div className="bsm-selector-item">
                <span className="bsm-sub-label">Remolque 1</span>
                <RemolqueSelector
                  currentValue={datos.remolque_1}
                  onSelect={handleRemolque1}
                  disabled={false}
                />
              </div>
              <div className="bsm-selector-item">
                <span className="bsm-sub-label">Remolque 2</span>
                <RemolqueSelector
                  currentValue={datos.remolque_2}
                  onSelect={handleRemolque2}
                  disabled={!remolque2Habilitado}
                />
              </div>
            </div>
            {datos.folio && !remolque2Habilitado && (
              <p className="bsm-hint">Remolque 2 disponible solo para viajes full (contenedor &gt; 12 chars).</p>
            )}
          </div>

          {/* CTA Porte (Folio) */}
          <div className="bsm-campo">
            <label className="bsm-label">CTA Porte (Folio)</label>
            <FolioSelector
              currentValue={datos.folio}
              onSelect={handleFolio}
              disabled={false}
            />
          </div>

          {/* Tipo de Unidad y Modelo — solo lectura, auto-llenados */}
          <div className="bsm-fila-dos">
            <div className="bsm-campo">
              <label className="bsm-label">Tipo de Unidad</label>
              <input
                type="text"
                className="bsm-input bsm-input--readonly"
                value={datos.unidad}
                readOnly
                placeholder="Se llena al elegir placas"
              />
            </div>
            <div className="bsm-campo">
              <label className="bsm-label">Modelo</label>
              <input
                type="text"
                className="bsm-input bsm-input--readonly"
                value={datos.anio}
                readOnly
                placeholder="Se llena al elegir placas"
              />
            </div>
          </div>

          {/* Origen y Destino — solo lectura, auto-llenados desde folio */}
          <div className="bsm-fila-dos">
            <div className="bsm-campo">
              <label className="bsm-label">Origen del Viaje</label>
              <input
                type="text"
                className="bsm-input bsm-input--readonly"
                value={datos.origen}
                readOnly
                placeholder="Se llena al elegir folio"
              />
            </div>
            <div className="bsm-campo">
              <label className="bsm-label">Destino</label>
              <input
                type="text"
                className="bsm-input bsm-input--readonly"
                value={datos.destino}
                readOnly
                placeholder="Se llena al elegir folio"
              />
            </div>
          </div>

          {/* Fechas */}
          <div className="bsm-fila-dos">
            <div className="bsm-campo">
              <label className="bsm-label">Fecha de Salida</label>
              <DatePicker
                selected={datos.fecha_salida}
                onChange={(date) => setDatos((p) => ({ ...p, fecha_salida: date }))}
                locale="es"
                dateFormat="dd/MM/yyyy"
                placeholderText="dd/MM/yyyy"
                className="bsm-input bsm-datepicker"
                isClearable
              />
            </div>
            <div className="bsm-campo">
              <label className="bsm-label">Fecha de Llegada</label>
              <DatePicker
                selected={datos.fecha_llegada}
                onChange={(date) => setDatos((p) => ({ ...p, fecha_llegada: date }))}
                locale="es"
                dateFormat="dd/MM/yyyy"
                placeholderText="dd/MM/yyyy"
                className="bsm-input bsm-datepicker"
                isClearable
              />
            </div>
          </div>

          {/* Mensajes de error / éxito */}
          {error && <p className="bsm-error">{error}</p>}
          {exito && <p className="bsm-exito">PDF generado y descargado correctamente.</p>}
        </div>

        {/* Footer */}
        <div className="bsm-footer">
          <button type="button" className="bsm-btn-cancelar" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="bsm-btn-generar"
            onClick={handleGenerar}
            disabled={generando || !datos.placas}
          >
            {generando
              ? <><Loader size={16} className="bsm-spin" /> Generando...</>
              : <><Download size={16} /> Generar PDF</>}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Nota crítica sobre `PlacasSelector`:** El callback `onSelect` existente en `PlacasSelector` actualmente recibe el valor de `placas` como string (o el objeto, dependiendo de la implementación). Si actualmente devuelve solo un string (la placa seleccionada), NO se pueden obtener `unidad` ni `anio` automáticamente. En ese caso, modificar el `onSelect` en `PlacasSelector` de la siguiente manera:

Verificar cómo `PlacasSelector` llama a `onSelect`:
- Si llama con `onSelect(tracto.placas)` → CAMBIAR a `onSelect(tracto)` (objeto completo).
- Si ya llama con el objeto completo → no cambiar nada.

Este cambio en PlacasSelector solo afecta a cómo se llama al callback. Las páginas existentes que usan `onSelect` deben actualizarse si usaban el string: revisar ManiobrasPage.jsx para ver si el inline onSelect de placas_pis y unidad necesita ajuste para manejar el objeto en lugar del string. Si usan `onSelect={(val) => actualizarCelda("placas_pis", val)}`, cambiar a `onSelect={(tracto) => actualizarCelda("placas_pis", tracto.placas)}`.

---

### PASO 16 — Crear `src/components/BitacoraSuenoModal/BitacoraSuenoModal.css`

```css
.bsm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.bsm-modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.bsm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 14px;
  border-bottom: 1px solid #e5e7eb;
}
.bsm-titulo {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text, #1f2937);
  margin: 0;
}
.bsm-cerrar {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-light, #6b7280);
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
}
.bsm-cerrar:hover { background: #f3f4f6; }

.bsm-body {
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bsm-campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bsm-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text, #1f2937);
}
.bsm-req { color: #dc2626; }
.bsm-sub-label {
  font-size: 0.75rem;
  color: var(--text-light, #6b7280);
  font-weight: 500;
}

.bsm-fila-dos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.bsm-fila-selectores {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
}
.bsm-selector-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bsm-input {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text, #1f2937);
  width: 100%;
  box-sizing: border-box;
}
.bsm-input--readonly {
  background: #f9fafb;
  color: var(--text-light, #6b7280);
  cursor: default;
}
.bsm-datepicker {
  width: 100% !important;
}

.bsm-hint {
  font-size: 0.75rem;
  color: var(--text-light, #6b7280);
  margin: 0;
}

.bsm-error {
  color: #dc2626;
  font-size: 0.82rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 0;
}
.bsm-exito {
  color: #16a34a;
  font-size: 0.82rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 0;
}

.bsm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px 18px;
  border-top: 1px solid #e5e7eb;
}

.bsm-btn-cancelar {
  padding: 8px 20px;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  background: #fff;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--text, #1f2937);
}
.bsm-btn-cancelar:hover { background: #f3f4f6; }

.bsm-btn-generar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: none;
  border-radius: 7px;
  background: var(--primary, #2563eb);
  color: #fff;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
}
.bsm-btn-generar:hover:not(:disabled) { background: #1d4ed8; }
.bsm-btn-generar:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
.bsm-spin {
  animation: spin 0.8s linear infinite;
}
```

---

### PASO 17 — Crear `src/components/CtaPortModal/CtaPortModal.jsx`

```jsx
import { useState, useEffect } from "react";
import { X, Download, Loader } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import OperadorSelector from "../OperadorSelector/OperadorSelector";
import PlacasSelector from "../PlacasSelector/PlacasSelector";
import RemolqueSelector from "../RemolqueSelector/RemolqueSelector";
import FolioSelector from "../FolioSelector/FolioSelector";
import ClienteSelector from "../ClienteSelector/ClienteSelector";
import "./CtaPortModal.css";

const ESTADO_INICIAL = {
  // Remisión
  folio:       "",
  ccp:         "",   // editable, auto desde folio

  // Origen / Destino — editables, auto desde folio
  origen:      "",
  destino:     "",

  // Datos del cliente
  cliente_nombre:    "",
  cliente_domicilio: "",
  cliente_colonia:   "",
  cliente_ciudad:    "",

  // Carga — solo lectura, auto desde folio
  tipo:        "",
  peso:        "",
  contenedor:  "",
  pedimento:   "",
  referencia:  "",

  // Texto libre
  descripcion: "",
  clave_sat:   "",

  // Conductor y placas — independientes
  operador:    "",
  placas:      "",
  remolque_1:  "",
  remolque_2:  "",
};

/**
 * CtaPortModal
 * Formulario para llenar la hoja "CTA PORT FRABA CONTAINER" y descargar su PDF.
 *
 * Props:
 *   onCerrar  function
 */
export default function CtaPortModal({ onCerrar }) {
  const [datos,     setDatos]     = useState(ESTADO_INICIAL);
  const [generando, setGenerando] = useState(false);
  const [error,     setError]     = useState(null);
  const [exito,     setExito]     = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCerrar]);

  // Auto-dismiss éxito
  useEffect(() => {
    if (!exito) return;
    const t = setTimeout(() => setExito(false), 3000);
    return () => clearTimeout(t);
  }, [exito]);

  // ── Lógica full/sencillo ───────────────────────────────────────────────────
  const esFullViaje        = (datos.contenedor || "").length > 12;
  const remolque2Habilitado = esFullViaje;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFolio = (maniobra) => {
    setDatos((p) => ({
      ...p,
      folio:      maniobra.folio      || "",
      ccp:        maniobra.ccp        || "",   // auto, editable
      origen:     maniobra.origen     || "",   // auto, editable
      destino:    maniobra.destino    || "",   // auto, editable
      tipo:       maniobra.tipo       || "",
      peso:       maniobra.peso       || "",
      contenedor: maniobra.contenedor || "",
      pedimento:  maniobra.pedimento  || "",
      referencia: maniobra.referencia || "",
      // Remolque 2: si el nuevo contenedor no es full, limpiar remolque 2
      remolque_2: (maniobra.contenedor || "").length > 12 ? p.remolque_2 : "",
    }));
  };

  const handleCliente = (cliente) => {
    setDatos((p) => ({
      ...p,
      cliente_nombre:    cliente.nombre_cliente || "",
      cliente_domicilio: cliente.domicilio      || "",
      cliente_colonia:   cliente.colonia        || "",
      cliente_ciudad:    cliente.ciudad         || "",
    }));
  };

  const handleOperador = (nombre) => {
    setDatos((p) => ({ ...p, operador: nombre }));
  };

  const handlePlacas = (tracto) => {
    setDatos((p) => ({ ...p, placas: tracto.placas || "" }));
  };

  const handleRemolque1 = (remolque) => {
    setDatos((p) => ({ ...p, remolque_1: remolque.placas || "" }));
  };

  const handleRemolque2 = (remolque) => {
    setDatos((p) => ({ ...p, remolque_2: remolque.placas || "" }));
  };

  const cambiarCampo = (campo, valor) => {
    setDatos((p) => ({ ...p, [campo]: valor }));
  };

  // ── Generar PDF ────────────────────────────────────────────────────────────

  const handleGenerar = async () => {
    setError(null);
    setGenerando(true);

    try {
      const payload = {
        folio:             datos.folio,
        ccp:               datos.ccp,
        origen:            datos.origen,
        destino:           datos.destino,
        cliente_nombre:    datos.cliente_nombre,
        cliente_domicilio: datos.cliente_domicilio,
        cliente_colonia:   datos.cliente_colonia,
        cliente_ciudad:    datos.cliente_ciudad,
        tipo:              datos.tipo,
        peso:              datos.peso,
        contenedor:        datos.contenedor,
        pedimento:         datos.pedimento,
        referencia:        datos.referencia,
        descripcion:       datos.descripcion,
        clave_sat:         datos.clave_sat,
        operador:          datos.operador,
        placas:            datos.placas,
        remolque_1:        datos.remolque_1,
        remolque_2:        datos.remolque_2,
      };

      const blob = await apiClient.download("/documentos/cta-port/", payload);

      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href     = url;
      link.download = "cta_port.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setExito(true);
    } catch (err) {
      setError(err.message || "Error al generar el PDF.");
    } finally {
      setGenerando(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="cpm-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div className="cpm-modal">
        {/* Header */}
        <div className="cpm-header">
          <h2 className="cpm-titulo">CTA Port Fraba Container</h2>
          <button type="button" className="cpm-cerrar" onClick={onCerrar}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="cpm-body">

          {/* Remisión: Folio + CCP */}
          <div className="cpm-seccion">
            <h3 className="cpm-seccion-titulo">Remisión</h3>
            <div className="cpm-fila-dos">
              <div className="cpm-campo">
                <label className="cpm-label">Folio <span className="cpm-req">*</span></label>
                <FolioSelector
                  currentValue={datos.folio}
                  onSelect={handleFolio}
                  disabled={false}
                />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">CCP (editable)</label>
                <input
                  type="text"
                  className="cpm-input"
                  value={datos.ccp}
                  onChange={(e) => cambiarCampo("ccp", e.target.value)}
                  placeholder="Auto desde folio"
                />
              </div>
            </div>
          </div>

          {/* Origen / Destino */}
          <div className="cpm-seccion">
            <h3 className="cpm-seccion-titulo">Origen y Destino</h3>
            <div className="cpm-fila-dos">
              <div className="cpm-campo">
                <label className="cpm-label">Origen (editable)</label>
                <input
                  type="text"
                  className="cpm-input"
                  value={datos.origen}
                  onChange={(e) => cambiarCampo("origen", e.target.value)}
                  placeholder="Auto desde folio"
                />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Destino (editable)</label>
                <input
                  type="text"
                  className="cpm-input"
                  value={datos.destino}
                  onChange={(e) => cambiarCampo("destino", e.target.value)}
                  placeholder="Auto desde folio"
                />
              </div>
            </div>
          </div>

          {/* Cliente */}
          <div className="cpm-seccion">
            <h3 className="cpm-seccion-titulo">Cliente</h3>
            <div className="cpm-campo">
              <label className="cpm-label">Seleccionar cliente</label>
              <ClienteSelector
                currentValue={datos.cliente_nombre}
                onSelect={handleCliente}
                disabled={false}
              />
            </div>
            {datos.cliente_nombre && (
              <div className="cpm-cliente-info">
                <p className="cpm-cliente-dato"><strong>Nombre:</strong> {datos.cliente_nombre}</p>
                {datos.cliente_domicilio && <p className="cpm-cliente-dato"><strong>Domicilio:</strong> {datos.cliente_domicilio}</p>}
                {datos.cliente_colonia  && <p className="cpm-cliente-dato"><strong>Colonia:</strong>  {datos.cliente_colonia}</p>}
                {datos.cliente_ciudad   && <p className="cpm-cliente-dato"><strong>Ciudad:</strong>   {datos.cliente_ciudad}</p>}
              </div>
            )}
          </div>

          {/* Carga (solo lectura) */}
          <div className="cpm-seccion">
            <h3 className="cpm-seccion-titulo">Carga (auto desde folio)</h3>
            <div className="cpm-grid-cuatro">
              <div className="cpm-campo">
                <label className="cpm-label">Tipo</label>
                <input type="text" className="cpm-input cpm-input--readonly" value={datos.tipo}       readOnly placeholder="—" />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Peso</label>
                <input type="text" className="cpm-input cpm-input--readonly" value={datos.peso}       readOnly placeholder="—" />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Contenedor</label>
                <input type="text" className="cpm-input cpm-input--readonly" value={datos.contenedor} readOnly placeholder="—" />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Referencia</label>
                <input type="text" className="cpm-input cpm-input--readonly" value={datos.referencia} readOnly placeholder="—" />
              </div>
            </div>
            <div className="cpm-campo" style={{ marginTop: 8 }}>
              <label className="cpm-label">Pedimento</label>
              <input type="text" className="cpm-input cpm-input--readonly" value={datos.pedimento} readOnly placeholder="—" />
            </div>
            {datos.contenedor && (
              <p className="cpm-hint">
                Viaje: <strong>{esFullViaje ? "Full (2 contenedores)" : "Sencillo (1 contenedor)"}</strong>
              </p>
            )}
          </div>

          {/* Descripción y Clave SAT */}
          <div className="cpm-seccion">
            <div className="cpm-campo">
              <label className="cpm-label">Descripción</label>
              <textarea
                className="cpm-textarea"
                value={datos.descripcion}
                onChange={(e) => cambiarCampo("descripcion", e.target.value)}
                rows={3}
                placeholder="Descripción de la mercancía..."
              />
            </div>
            <div className="cpm-campo">
              <label className="cpm-label">Clave SAT</label>
              <input
                type="text"
                className="cpm-input"
                value={datos.clave_sat}
                onChange={(e) => cambiarCampo("clave_sat", e.target.value)}
                placeholder="Ej. 78101802"
              />
              {datos.clave_sat && (
                <p className="cpm-hint">En PDF: <code>CLAVE SAT:{datos.clave_sat}</code></p>
              )}
            </div>
          </div>

          {/* Conductor y Placas */}
          <div className="cpm-seccion">
            <h3 className="cpm-seccion-titulo">Conductor y Placas</h3>
            <div className="cpm-campo">
              <label className="cpm-label">Conductor</label>
              <OperadorSelector
                currentValue={datos.operador}
                onSelect={handleOperador}
                disabled={false}
              />
            </div>
            <div className="cpm-fila-tres">
              <div className="cpm-campo">
                <label className="cpm-label">Placas</label>
                <PlacasSelector
                  currentValue={datos.placas}
                  onSelect={handlePlacas}
                  disabled={false}
                />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Remolque 1</label>
                <RemolqueSelector
                  currentValue={datos.remolque_1}
                  onSelect={handleRemolque1}
                  disabled={false}
                />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Remolque 2</label>
                <RemolqueSelector
                  currentValue={datos.remolque_2}
                  onSelect={handleRemolque2}
                  disabled={!remolque2Habilitado}
                />
              </div>
            </div>
          </div>

          {/* Mensajes */}
          {error && <p className="cpm-error">{error}</p>}
          {exito && <p className="cpm-exito">PDF generado y descargado correctamente.</p>}
        </div>

        {/* Footer */}
        <div className="cpm-footer">
          <button type="button" className="cpm-btn-cancelar" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="cpm-btn-generar"
            onClick={handleGenerar}
            disabled={generando || !datos.folio}
          >
            {generando
              ? <><Loader size={16} className="cpm-spin" /> Generando...</>
              : <><Download size={16} /> Generar PDF</>}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### PASO 18 — Crear `src/components/CtaPortModal/CtaPortModal.css`

```css
.cpm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.cpm-modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 700px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.cpm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 14px;
  border-bottom: 1px solid #e5e7eb;
}
.cpm-titulo {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text, #1f2937);
  margin: 0;
}
.cpm-cerrar {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-light, #6b7280);
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
}
.cpm-cerrar:hover { background: #f3f4f6; }

.cpm-body {
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cpm-seccion {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 16px;
}
.cpm-seccion:last-of-type { border-bottom: none; }

.cpm-seccion-titulo {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--primary, #2563eb);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.cpm-campo {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.cpm-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text, #1f2937);
}
.cpm-req { color: #dc2626; }

.cpm-fila-dos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.cpm-fila-tres {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
}
.cpm-grid-cuatro {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 10px;
}

.cpm-input {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text, #1f2937);
  width: 100%;
  box-sizing: border-box;
}
.cpm-input:focus {
  outline: none;
  border-color: var(--primary, #2563eb);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}
.cpm-input--readonly {
  background: #f9fafb;
  color: var(--text-light, #6b7280);
  cursor: default;
}

.cpm-textarea {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text, #1f2937);
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  font-family: inherit;
}
.cpm-textarea:focus {
  outline: none;
  border-color: var(--primary, #2563eb);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.cpm-cliente-info {
  background: #f8faff;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cpm-cliente-dato {
  font-size: 0.8rem;
  color: var(--text, #1f2937);
  margin: 0;
}

.cpm-hint {
  font-size: 0.75rem;
  color: var(--text-light, #6b7280);
  margin: 0;
}
.cpm-hint code {
  font-family: monospace;
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 3px;
}

.cpm-error {
  color: #dc2626;
  font-size: 0.82rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 0;
}
.cpm-exito {
  color: #16a34a;
  font-size: 0.82rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 0;
}

.cpm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px 18px;
  border-top: 1px solid #e5e7eb;
}

.cpm-btn-cancelar {
  padding: 8px 20px;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  background: #fff;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--text, #1f2937);
}
.cpm-btn-cancelar:hover { background: #f3f4f6; }

.cpm-btn-generar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: none;
  border-radius: 7px;
  background: var(--primary, #2563eb);
  color: #fff;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
}
.cpm-btn-generar:hover:not(:disabled) { background: #1d4ed8; }
.cpm-btn-generar:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@keyframes cpm-spin {
  to { transform: rotate(360deg); }
}
.cpm-spin {
  animation: cpm-spin 0.8s linear infinite;
}
```

---

## FASE 4: DocumentosViajePage

---

### PASO 19 — `src/pages/DocumentosViajePage.jsx`: Implementación completa

REEMPLAZAR el contenido completo del archivo placeholder actual con lo siguiente:

```jsx
import { useState } from "react";
import { FileText, ScrollText } from "lucide-react";
import { useAuthContext } from "../context/AuthContext";
import BitacoraSuenoModal from "../components/BitacoraSuenoModal/BitacoraSuenoModal";
import CtaPortModal from "../components/CtaPortModal/CtaPortModal";
import "./DocumentosViajePage.css";

/**
 * DocumentosViajePage
 * Página principal de Documentos de Viaje.
 * Muestra una tabla de 2 columnas con un botón por cada tipo de documento.
 * Solo disponible para usuarios autenticados.
 */
export default function DocumentosViajePage() {
  const [modalAbierto, setModalAbierto] = useState(null); // 'bitacora' | 'ctaport' | null
  const { user } = useAuthContext();

  if (!user) return null;

  return (
    <div className="dvp-container">
      <div className="dvp-header">
        <FileText size={28} className="dvp-icono" />
        <h1 className="dvp-titulo">Documentos de Viaje</h1>
        <p className="dvp-subtitulo">Genera y descarga los formatos de viaje en PDF.</p>
      </div>

      <div className="dvp-tabla-wrapper">
        <table className="dvp-tabla">
          <thead>
            <tr>
              <th className="dvp-th">Bitácora de Sueño</th>
              <th className="dvp-th">CTA Port Fraba Container</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="dvp-td">
                <div className="dvp-card">
                  <ScrollText size={40} className="dvp-card-icono" />
                  <p className="dvp-card-desc">
                    Formato de horas de servicio del operador. Incluye datos del
                    vehículo, origen, destino y fechas de salida y llegada.
                  </p>
                  <button
                    type="button"
                    className="dvp-btn"
                    onClick={() => setModalAbierto("bitacora")}
                  >
                    Generar Bitácora de Sueño
                  </button>
                </div>
              </td>
              <td className="dvp-td">
                <div className="dvp-card">
                  <FileText size={40} className="dvp-card-icono" />
                  <p className="dvp-card-desc">
                    Carta porte de Fraba Container. Incluye datos del cliente,
                    descripción de la carga, conductor y placas del vehículo.
                  </p>
                  <button
                    type="button"
                    className="dvp-btn"
                    onClick={() => setModalAbierto("ctaport")}
                  >
                    Generar CTA Port
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Modales */}
      {modalAbierto === "bitacora" && (
        <BitacoraSuenoModal onCerrar={() => setModalAbierto(null)} />
      )}
      {modalAbierto === "ctaport" && (
        <CtaPortModal onCerrar={() => setModalAbierto(null)} />
      )}
    </div>
  );
}
```

---

### PASO 20 — `src/pages/DocumentosViajePage.css`: Estilos completos

REEMPLAZAR el contenido actual del archivo con:

```css
.dvp-container {
  padding: 32px 24px;
  max-width: 900px;
  margin: 0 auto;
}

.dvp-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 32px;
  gap: 8px;
}
.dvp-icono {
  color: var(--primary, #2563eb);
}
.dvp-titulo {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text, #1f2937);
  margin: 0;
}
.dvp-subtitulo {
  font-size: 0.9rem;
  color: var(--text-light, #6b7280);
  margin: 0;
}

.dvp-tabla-wrapper {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  overflow: hidden;
}

.dvp-tabla {
  width: 100%;
  border-collapse: collapse;
}

.dvp-th {
  background: var(--primary, #2563eb);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  padding: 14px 24px;
  text-align: center;
  width: 50%;
}
.dvp-th:first-child {
  border-right: 2px solid rgba(255,255,255,0.2);
}

.dvp-td {
  padding: 32px 24px;
  vertical-align: top;
  border-right: 1px solid #e5e7eb;
}
.dvp-td:last-child { border-right: none; }

.dvp-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
}
.dvp-card-icono {
  color: var(--primary, #2563eb);
  opacity: 0.7;
}
.dvp-card-desc {
  font-size: 0.85rem;
  color: var(--text-light, #6b7280);
  line-height: 1.5;
  max-width: 280px;
  margin: 0;
}

.dvp-btn {
  padding: 10px 22px;
  border: none;
  border-radius: 8px;
  background: var(--primary, #2563eb);
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.dvp-btn:hover {
  background: #1d4ed8;
  transform: translateY(-1px);
}
.dvp-btn:active {
  transform: translateY(0);
}
```

---

## RESUMEN DE TODOS LOS ARCHIVOS AFECTADOS

### Archivos nuevos (crear)
```
api/documentos/templates/CTA_PTE_FORMATO.xlsx               ← copiar de uploads
src/components/FolioSelector/FolioSelector.jsx
src/components/FolioSelector/FolioSelector.css
src/components/ClienteSelector/ClienteSelector.jsx
src/components/ClienteSelector/ClienteSelector.css
src/components/BitacoraSuenoModal/BitacoraSuenoModal.jsx
src/components/BitacoraSuenoModal/BitacoraSuenoModal.css
src/components/CtaPortModal/CtaPortModal.jsx
src/components/CtaPortModal/CtaPortModal.css
```

### Archivos existentes a modificar
```
api/models.py              ← Maniobra (+tipo, +peso, +referencia), Cliente (+colonia, +ciudad)
api/Serializers.py         ← Verificar ClienteSerializer incluye nuevos campos
api/views.py               ← +imports, +_TEMPLATE_PATH, +_xlsx_a_pdf, +_concat_placas_remolques,
                              +folios_recientes action en ManiobraViewSet,
                              +DocumentoBitacoraSuenoView, +DocumentoCtaPortView
api/urls.py                ← +path bitacora-sueno, +path cta-port
src/api/apiClient.js       ← +método download
src/pages/ManiobrasPage.jsx ← umbral 32→12, COLUMNAS (tipo_y_peso→tipo+peso, +referencia), MANIOBRA_VACIA
src/pages/CatalogosPage.jsx ← configFormularios.clientes (+colonia, +ciudad), TRADUCCIONES_COLUMNAS
src/pages/DocumentosViajePage.jsx ← reemplazar placeholder con implementación completa
src/pages/DocumentosViajePage.css ← reemplazar con estilos completos
```

---

## NOTAS CRÍTICAS PARA CLAUDE CODE

### Sobre PlacasSelector (IMPORTANTE)
Antes de implementar BitacoraSuenoModal, revisar `PlacasSelector.jsx` para ver qué valor pasa al callback `onSelect`:
- Si pasa solo el string de placas: `onSelect(tracto.placas)` → cambiar a `onSelect(tracto)` (objeto completo).
- Actualizar los usos existentes en ManiobrasPage.jsx: cambiar `onSelect={(val) => actualizarCampo("placas_pis", val)}` a `onSelect={(t) => actualizarCampo("placas_pis", t.placas)}` y lo análogo para el campo `unidad`.

### Sobre RemolqueSelector (IMPORTANTE)
Verificar qué pasa al callback `onSelect` en RemolqueSelector:
- Si pasa solo el string de placas: `onSelect(remolque.placas)` → cambiar a `onSelect(remolque)` (objeto completo).
- Actualizar los usos existentes en ManiobrasPage.jsx de forma análoga.

### Sobre la fórmula D33 en BITÁCORA DE SUEÑO
La celda D33 del template contiene la cadena `'=L7'`. openpyxl la preserva como fórmula al guardar. NO tocar D33 en la vista de backend. LibreOffice evalúa la fórmula al convertir a PDF y obtiene el valor de L7 correctamente.

### Sobre las fórmulas C23 y F23 en CTA PORT
Estas celdas contienen fórmulas que referencian BITÁCORA DE SUEÑO. En el backend, se sobreescriben con valores directos ANTES de eliminar la hoja de BITÁCORA DE SUEÑO. Esto garantiza que el PDF de CTA PORT sea autónomo.

### Sobre la celda J2 en CTA PORT (merged J2:J3)
openpyxl escribe en la celda superior izquierda del rango fusionado: `ws['J2'] = valor`. El rango fusionado J2:J3 ya existe en el template; no es necesario crear la fusión.

### Sobre el umbral full/sencillo
El cambio de `32` a `12` afecta DOS lugares en ManiobrasPage.jsx (FilaNueva y ModalEditar). Buscar todas las ocurrencias de `<= 32` relacionadas con `.length` y cambiarlas a `<= 12`.

### Sobre tipo_y_peso
La columna `tipo_y_peso` se mantiene en la base de datos y en el modelo Django. Solo se retira del array COLUMNAS de ManiobrasPage. Los datos existentes quedan intactos en la BD.

### Sobre la migración
La migración aplica a la tabla `api_cliente` (managed=True). Las columnas de maniobras se agregan via SQL (managed=False) — la migración para maniobras solo actualiza el estado del modelo Python, no crea columnas reales (eso ya lo hizo el SQL del PASO 1).
