# PLAN — Bitácora de Gastos integrada en CtaPortModal

## Decisiones de diseño confirmadas
- **Layout:** Mantener 2 columnas en DocumentosViajePage. Actualizar tarjeta CTA Port para reflejar que genera ambos documentos.
- **Total de Gastos:** Campo **obligatorio**. El formulario no puede enviarse sin él. Siempre se generan ambos PDFs.
- **Descargas:** Dos archivos separados descargados secuencialmente (con 600 ms de intervalo para evitar bloqueo del navegador).

## Convenciones
- Números de paso secuenciales y obligatorios en ese orden.
- "AGREGAR" = añadir sin borrar lo existente, salvo que se indique REEMPLAZAR.
- Todos los paths son relativos a la raíz del proyecto Django (donde vive `manage.py`).

---

## Mapa de celdas BITACORA GASTOS

| Celda (top-left del merge) | Rango fusionado | Fórmula actual en template      | Valor que se escribirá              |
|----------------------------|------------------|---------------------------------|--------------------------------------|
| `B2`                       | B2:G2            | `=TODAY()`                      | ⚠️ **NO TOCAR** — fórmula intra-hoja, LibreOffice la resuelve solo |
| `I2`                       | I2:L2            | `='CTA PORT FRABA CONTAINER'!F23` | `concat_placas` (idéntico a F23 en CTA PORT) |
| `B3`                       | B3:G3            | `='CTA PORT FRABA CONTAINER'!C23` | `operador` (idéntico a C23 en CTA PORT) |
| `I3`                       | I3:L3            | `=SUM('CTA PORT FRABA CONTAINER'!F17:F19)` | `peso_valor` numérico (F18 y F19 son vacíos en template, la suma = F17) |
| `B4`                       | B4:G4            | `='CTA PORT FRABA CONTAINER'!G6`  | `destino` (idéntico a G6 en CTA PORT) |
| `I4`                       | I4:L4            | `2500` (placeholder)             | `total_gastos` (float/int — la celda ya tiene formato `"$"#,##0`) |

---

## FASE 1: BACKEND

---

### PASO 1 — `api/views.py`: Agregar `DocumentoBitacoraGastosView`

#### 1a. Agregar import de `date` si no está presente

Buscar en la sección de imports de `views.py`. Si `from datetime import date` (o `datetime`) no está ya importado, AGREGAR:

```python
from datetime import date
```

#### 1b. Agregar la nueva vista al final de `views.py`

AGREGAR la siguiente clase inmediatamente después de `DocumentoCtaPortView`:

```python
class DocumentoBitacoraGastosView(APIView):
    """
    POST /api/documentos/bitacora-gastos/
    Recibe los mismos datos que DocumentoCtaPortView más `total_gastos`.
    Llena la hoja 'BITACORA GASTOS' del template con valores directos
    (anulando las fórmulas cruzadas que apuntan a CTA PORT FRABA CONTAINER).
    Devuelve el PDF de BITACORA GASTOS.
    Requiere autenticación JWT.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def post(self, request):
        # ── Leer datos del body ────────────────────────────────────────────────
        # Datos compartidos con CTA PORT (vienen del mismo formulario)
        operador   = request.data.get('operador',   '').strip()
        placas     = request.data.get('placas',     '').strip()
        remolque_1 = request.data.get('remolque_1', '').strip()
        remolque_2 = request.data.get('remolque_2', '').strip()
        peso_raw   = request.data.get('peso',       '')
        destino    = request.data.get('destino',    '').strip()

        # Campo exclusivo de BITACORA GASTOS
        total_gastos_raw = request.data.get('total_gastos', '')

        # ── Validación ────────────────────────────────────────────────────────
        if not total_gastos_raw and total_gastos_raw != 0:
            return Response(
                {'detail': 'El campo Total de Gastos es requerido.'},
                status=400,
            )

        try:
            total_gastos = float(str(total_gastos_raw).replace(',', ''))
        except (ValueError, TypeError):
            return Response(
                {'detail': 'Total de Gastos debe ser un número válido.'},
                status=400,
            )

        # ── Valores derivados ──────────────────────────────────────────────────
        # I2: mismo concatenado de placas/remolques que va en F23 de CTA PORT
        concat_placas = _concat_placas_remolques(placas, remolque_1, remolque_2)

        # I3: peso numérico (F17 en CTA PORT; F18 y F19 son vacíos → SUM = F17)
        try:
            peso_valor = float(peso_raw) if peso_raw else 0.0
        except (ValueError, TypeError):
            peso_valor = 0.0

        # ── Abrir template y trabajar en directorio temporal ──────────────────
        try:
            with tempfile.TemporaryDirectory() as tmp_dir:
                wb = load_workbook(str(_TEMPLATE_PATH))  # preserva fórmulas y formatos
                ws = wb['BITACORA GASTOS']

                # B2 (=TODAY()) — NO SE TOCA. LibreOffice resuelve la fórmula.

                # I2 (merged I2:L2): Unidad / Placas
                # Anula la fórmula ='CTA PORT FRABA CONTAINER'!F23
                ws['I2'] = concat_placas

                # B3 (merged B3:G3): Nombre del conductor
                # Anula la fórmula ='CTA PORT FRABA CONTAINER'!C23
                ws['B3'] = operador

                # I3 (merged I3:L3): Peso
                # Anula la fórmula =SUM('CTA PORT FRABA CONTAINER'!F17:F19)
                ws['I3'] = peso_valor if peso_valor != 0.0 else ''

                # B4 (merged B4:G4): Destino
                # Anula la fórmula ='CTA PORT FRABA CONTAINER'!G6
                ws['B4'] = destino

                # I4 (merged I4:L4): Total de Gastos
                # La celda ya tiene formato de dinero "$"#,##0 en el template.
                # openpyxl preserva el formato al cargar; solo se escribe el número.
                ws['I4'] = total_gastos

                # Eliminar las otras hojas para exportar solo BITACORA GASTOS
                for nombre_hoja in [n for n in wb.sheetnames if n != 'BITACORA GASTOS']:
                    del wb[nombre_hoja]

                # Guardar xlsx temporal
                xlsx_tmp = os.path.join(tmp_dir, 'bitacora_gastos.xlsx')
                wb.save(xlsx_tmp)

                # Convertir a PDF con LibreOffice
                pdf_path = _xlsx_a_pdf(xlsx_tmp, tmp_dir)

                with open(pdf_path, 'rb') as f:
                    pdf_bytes = f.read()

            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = 'attachment; filename="bitacora_gastos.pdf"'
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
                {'detail': f'Error al generar Bitácora de Gastos: {str(exc)}'},
                status=500,
            )
```

---

### PASO 2 — `api/urls.py`: Registrar el nuevo endpoint

#### 2a. Agregar `DocumentoBitacoraGastosView` al import de vistas

En la sección de imports de `api/urls.py`, localizar donde se importan `DocumentoBitacoraSuenoView` y `DocumentoCtaPortView`. AGREGAR `DocumentoBitacoraGastosView` a ese mismo import:

```python
from .views import (
    # ... todos los imports existentes ...
    DocumentoBitacoraSuenoView,
    DocumentoCtaPortView,
    DocumentoBitacoraGastosView,   # ← AGREGAR
)
```

#### 2b. Registrar el path en `urlpatterns`

En `urlpatterns`, inmediatamente DESPUÉS del path de `cta-port`, AGREGAR:

```python
path('documentos/bitacora-gastos/', DocumentoBitacoraGastosView.as_view(), name='bitacora-gastos'),
```

**Resultado esperado del bloque de documentos en `urlpatterns`:**
```python
path('documentos/bitacora-sueno/', DocumentoBitacoraSuenoView.as_view(), name='bitacora-sueno'),
path('documentos/cta-port/',       DocumentoCtaPortView.as_view(),        name='cta-port'),
path('documentos/bitacora-gastos/', DocumentoBitacoraGastosView.as_view(), name='bitacora-gastos'),
```

---

## FASE 2: FRONTEND

---

### PASO 3 — `src/components/CtaPortModal/CtaPortModal.jsx`: Actualización completa

Se realizan 4 cambios en este archivo. Aplicarlos en orden.

---

#### Cambio 3a — Actualizar `ESTADO_INICIAL`: agregar `total_gastos`

Localizar el objeto `ESTADO_INICIAL`. Dentro de la sección de "Texto libre", AGREGAR la propiedad `total_gastos`:

```js
// Texto libre
descripcion: "",
clave_sat:   "",
total_gastos: "",   // ← AGREGAR
```

**Resultado esperado de esa sección en `ESTADO_INICIAL`:**
```js
descripcion:  "",
clave_sat:    "",
total_gastos: "",
```

---

#### Cambio 3b — Agregar campo "Total de Gastos" en el JSX del modal

Localizar en el return del componente la sección que tiene el campo `descripcion` y el campo `clave_sat`. Esta sección está dentro de un `<div className="cpm-seccion">`.

AGREGAR el siguiente campo **inmediatamente DESPUÉS** del campo `clave_sat` y **ANTES** del cierre del `</div>` de esa misma sección:

```jsx
<div className="cpm-campo">
  <label className="cpm-label">
    Total de Gastos <span className="cpm-req">*</span>
  </label>
  <input
    type="number"
    min="0"
    step="1"
    className="cpm-input cpm-input--money"
    value={datos.total_gastos}
    onChange={(e) => cambiarCampo("total_gastos", e.target.value)}
    placeholder="Ej. 5000"
  />
  {datos.total_gastos && (
    <p className="cpm-hint">
      Se incluirá como Total de Gastos en la Bitácora de Gastos.
    </p>
  )}
</div>
```

---

#### Cambio 3c — Reemplazar la función `handleGenerar` completa

Localizar la función `handleGenerar` existente en el componente. REEMPLAZAR toda la función completa (desde `const handleGenerar = async () => {` hasta el cierre `};`) con la siguiente versión:

```js
/**
 * Utilidad interna: crea un enlace temporal, activa la descarga y lo elimina.
 */
const triggerDownload = (blob, filename) => {
  const url  = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const handleGenerar = async () => {
  setError(null);
  setGenerando(true);

  try {
    // Payload compartido para ambos endpoints
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
      total_gastos:      datos.total_gastos,   // usado solo por bitacora-gastos
    };

    // ── 1. Generar y descargar CTA PORT ────────────────────────────────────
    const blobCtaPort = await apiClient.download("/documentos/cta-port/", payload);
    triggerDownload(blobCtaPort, "cta_port.pdf");

    // ── Pausa de 600ms para evitar que el navegador bloquee la 2ª descarga ─
    await new Promise((resolve) => setTimeout(resolve, 600));

    // ── 2. Generar y descargar BITACORA GASTOS ─────────────────────────────
    const blobGastos = await apiClient.download("/documentos/bitacora-gastos/", payload);
    triggerDownload(blobGastos, "bitacora_gastos.pdf");

    setExito(true);
  } catch (err) {
    setError(err.message || "Error al generar los documentos.");
  } finally {
    setGenerando(false);
  }
};
```

**Nota:** La función `triggerDownload` debe declararse ANTES de `handleGenerar` dentro del componente (ambas van dentro del cuerpo de la función del componente, antes del `return`).

---

#### Cambio 3d — Actualizar validación del botón "Generar PDF" y su texto

Localizar el botón `cpm-btn-generar` en el JSX del return. Tiene actualmente:

```jsx
disabled={generando || !datos.folio}
```

REEMPLAZAR esa condición `disabled` por:

```jsx
disabled={generando || !datos.folio || !datos.total_gastos}
```

Además, el texto del botón actualmente dice "Generar PDF". REEMPLAZAR el contenido del botón (el fragmento dentro del botón) por:

```jsx
{generando
  ? <><Loader size={16} className="cpm-spin" /> Generando documentos...</>
  : <><Download size={16} /> Generar CTA Port + Bitácora de Gastos</>}
```

---

### PASO 4 — `src/components/CtaPortModal/CtaPortModal.css`: Agregar estilo para el input de dinero

Al final del archivo CSS, AGREGAR:

```css
/* Input numérico para Total de Gastos */
.cpm-input--money {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: #16a34a;
}
.cpm-input--money:focus {
  border-color: #16a34a;
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.15);
}
```

---

### PASO 5 — `src/pages/DocumentosViajePage.jsx`: Actualizar tarjeta CTA Port

En el `return` del componente, localizar el bloque `<td>` que contiene la tarjeta de CTA Port (segunda celda de la tabla). Tiene una estructura `<div className="dvp-card">` con el ícono, descripción y botón.

REEMPLAZAR únicamente el contenido interno del `<div className="dvp-card">` de la tarjeta CTA Port con lo siguiente:

```jsx
<FileText size={40} className="dvp-card-icono" />
<p className="dvp-card-desc">
  Genera dos documentos simultáneamente: la <strong>Carta Porte</strong> de
  Fraba Container y la <strong>Bitácora de Gastos de Viaje</strong>. Incluye
  datos del cliente, descripción de la carga, conductor, placas y total de gastos.
</p>
<button
  type="button"
  className="dvp-btn"
  onClick={() => setModalAbierto("ctaport")}
>
  Generar CTA Port + Bitácora de Gastos
</button>
```

**Nota:** Solo se modifica el contenido interno del `dvp-card`. El `<td>`, el `<tr>`, la estructura de la tabla y la tarjeta de Bitácora de Sueño permanecen sin cambios.

---

## RESUMEN DE ARCHIVOS AFECTADOS

### Archivos modificados (solo estos 4, nada más)

```
api/views.py
  └── Agregar DocumentoBitacoraGastosView al final del archivo

api/urls.py
  └── Agregar import de DocumentoBitacoraGastosView
  └── Agregar path 'documentos/bitacora-gastos/'

src/components/CtaPortModal/CtaPortModal.jsx
  └── Agregar total_gastos a ESTADO_INICIAL
  └── Agregar campo "Total de Gastos" en el JSX
  └── Reemplazar handleGenerar (ahora hace 2 descargas secuenciales)
  └── Agregar triggerDownload antes de handleGenerar
  └── Actualizar disabled y texto del botón Generar

src/components/CtaPortModal/CtaPortModal.css
  └── Agregar .cpm-input--money al final

src/pages/DocumentosViajePage.jsx
  └── Actualizar contenido interno del dvp-card de CTA Port
```

### Sin cambios (no tocar)
```
api/models.py           ← sin cambios
api/Serializers.py      ← sin cambios
src/api/apiClient.js    ← sin cambios (ya tiene método download del plan anterior)
src/pages/DocumentosViajePage.css ← sin cambios
```

---

## NOTAS CRÍTICAS PARA CLAUDE CODE

### Sobre B2 (=TODAY()) en BITACORA GASTOS
La celda B2 tiene la fórmula `=TODAY()`. Es una referencia **intra-hoja** (no depende de otras hojas del workbook). NO se debe sobreescribir. Cuando se eliminan las otras dos hojas y LibreOffice convierte el archivo a PDF, evalúa `=TODAY()` y coloca la fecha actual automáticamente.

### Sobre el formato de dinero en I4
La celda I4 del template ya tiene el número_format `"$"#,##0;[Red]\-"$"#,##0`. openpyxl preserva este formato al cargar el template con `load_workbook()` y simplemente escribir un valor numérico (`ws['I4'] = 2500.0`). No es necesario aplicar ningún formato manualmente. LibreOffice respetará ese formato al generar el PDF.

### Sobre el valor de I3 (Peso)
La fórmula original en I3 es `=SUM('CTA PORT FRABA CONTAINER'!F17:F19)`. En el template, F17, F18 y F19 están vacías antes de ser llenadas. En la vista `DocumentoCtaPortView`, solo se llena F17 con el peso. F18 y F19 permanecen vacías. Por lo tanto, el valor efectivo de la suma es idéntico al valor de `peso`. La vista `DocumentoBitacoraGastosView` escribe directamente el valor numérico de `peso` a `ws['I3']`, que es equivalente.

### Sobre la espera de 600ms entre descargas
La pausa `await new Promise(resolve => setTimeout(resolve, 600))` es necesaria porque algunos navegadores (especialmente Chrome) bloquean la segunda descarga si se activa demasiado rápido después de la primera. 600ms es suficiente en la práctica. No reducir ese valor.

### Sobre el payload compartido
Ambas llamadas (`/documentos/cta-port/` y `/documentos/bitacora-gastos/`) reciben el mismo `payload` completo. La vista `DocumentoCtaPortView` ignora `total_gastos` (no lo usa). La vista `DocumentoBitacoraGastosView` ignora los campos de cliente y demás campos de CTA PORT que no necesita. Esto es correcto y no genera errores — los campos extra en el body simplemente se ignoran con `request.data.get('campo', '')`.

### Sobre el botón deshabilitado
La condición `disabled={generando || !datos.folio || !datos.total_gastos}` deshabilita el botón si falta el folio O si falta el total de gastos. Esto garantiza que ambos documentos siempre se generen completos.
