# PLAN: Modificación Cta Porte Fraba Container + Nuevo Formulario Cta Porte Terceros

**Estado:** Listo para ejecutar con Claude Code
**Alcance:** Backend (Django) + Frontend (React)
**Regla de oro para quien ejecute este plan:** NO modificar nada que no esté explícitamente indicado aquí. Cada paso indica el archivo exacto, la ubicación exacta y el código exacto (antes/después). Si algo no coincide EXACTAMENTE con el `old_str` mostrado (por haber cambiado desde que se escribió este plan), DETENERSE y pedir confirmación antes de continuar — no improvisar.

---

## Contexto de las decisiones ya confirmadas con el usuario (no volver a preguntar)

1. Los datos de cliente (`nombre_cliente`, `domicilio`, `colonia`, `ciudad`) SÍ se llenan en Cta Porte Terceros, en las mismas celdas que Fraba Container: `G7`, `G8`, `G9`, `G10`.
2. Registros viejos de `tipo` sin `/` → se tratan como vacíos al generar el documento (no se lanza error duro, simplemente las celdas de tipo quedan en blanco). No se hace migración de datos retroactiva.
3. Detección de "CARGA SUELTA" en la columna Contenedor → comparación tipo `contains` (basta con que el texto contenga la palabra, no tiene que ser coincidencia exacta), sobre el valor ya normalizado a mayúsculas.
4. El campo `tipo` dividido (lado izquierdo / lado derecho) es completamente libre en ambos lados, sin restricción de formato (no se valida que la izquierda sea solo números ni que la derecha sea solo letras).
5. La lógica de llenado de celdas se comparte entre Fraba Container y Terceros mediante una función auxiliar común (DRY) en `views.py`.
6. El formulario Cta Porte Terceros usa el mismo `FolioSelector` para autocompletar `tipo`, `peso`, `contenedor`, `pedimento`, `referencia`, `operador`, `placas`, `remolque_1`, `remolque_2` desde Maniobras, exactamente igual que Fraba Container.
7. El nuevo template Excel (`FORMATO_CTA_PTE_TERCEROS.xlsx` proporcionado por el usuario) tiene una sola hoja, cuyo nombre interno es literalmente `"CTA PORT FRABA CONTAINER"` (así viene, no se debe renombrar la hoja dentro del archivo — se referencia por ese nombre en el código aunque el documento se llame "Terceros"). El mapeo de celdas de esa hoja es IDÉNTICO al de Fraba Container: `J2:J3` (Folio/CCP), `H5/I5/J5` (fecha), `B6/G6` (origen/destino), `G7-G10` (cliente), `A17/B17/C16/C17/C18/A18/F17` (bultos), `C20/C21` (descripción/clave SAT), `C23/F23` (conductor/placas — confirmado por las etiquetas `A23='CONDUCTOR:'` y `E23='PLACAS:'` en el archivo subido). No tiene hoja de Bitácora de Sueño ni de Bitácora de Gastos.

---

## Mapeo de celdas — Tabla de bultos (NUEVO comportamiento, reemplaza al actual)

### Caso normal (contenedor NO contiene "CARGA SUELTA") — full/sencillo

| Celda | Contenido |
|-------|-----------|
| A17 | `1` o `2` según full/sencillo (sin cambios, igual que hoy) |
| B17 | `"CONTENEDOR"` o `"CONTENEDORES"` (sin cambios, igual que hoy) |
| A18 | Primer valor numérico del campo `tipo` (parte izquierda de la `/`, antes del `-` si lo hay) |
| B18 | Primer valor de texto del campo `tipo` (parte derecha de la `/`, antes del `-` si lo hay) |
| A19 | Segundo valor numérico (después del `-` en la parte izquierda) — **solo si existe** |
| B19 | Segundo valor de texto (después del `-` en la parte derecha) — **solo si existe** |

Ejemplo `tipo = "40 / HC"` → A18=`40`, B18=`HC`, A19 y B19 no se tocan.
Ejemplo `tipo = "40 - 20 / HC - DC"` → A18=`40`, A19=`20`, B18=`HC`, B19=`DC`.

### Caso CARGA SUELTA (contenedor contiene "CARGA SUELTA")

| Celda | Contenido |
|-------|-----------|
| A17 | Primer valor numérico del campo `tipo` (ya NO se escribe `1`/`2`) |
| B17 | Primer valor de texto del campo `tipo` (ya NO se escribe `CONTENEDOR`/`CONTENEDORES`) |
| A18 | Segundo valor numérico (después del `-`) — **solo si existe** |
| B18 | Segundo valor de texto (después del `-`) — **solo si existe** |

Ejemplo `tipo = "7 / PALLETS"` → A17=`7`, B17=`PALLETS`.
Ejemplo `tipo = "9 - 14 / PALLETS - CARTONES"` → A17=`9`, A18=`14`, B17=`PALLETS`, B18=`CARTONES`.

**Celdas que NO cambian de comportamiento en ningún caso:** `C16` (referencia), `C17` (contenedor — sigue escribiendo el valor literal, incluida la palabra "CARGA SUELTA" si aplica), `C18` (pedimento), `F17` (peso).

---

## FASE 0 — Colocar el nuevo template Excel

**Origen:** el archivo `FORMATO_CTA_PTE_TERCEROS.xlsx` que el usuario ya proporcionó.

**Acción:** copiarlo, sin modificar su contenido ni renombrar su hoja, a:
```
api/documentos/templates/CTA_PTE_TERCEROS_FORMATO.xlsx
```
(mismo directorio donde ya vive `CTA_PTE_FORMATO.xlsx`).

No requiere ninguna acción de código en este paso, solo copiar el archivo binario.

---

## FASE 1 — Backend: helpers compartidos en `views.py`

**Archivo:** `api/views.py`
**Ubicación:** justo después de la función `_concat_placas_remolques` (línea ~126, antes de `_validar_operador_vigente`).

### 1.1 — Agregar tres funciones nuevas

Insertar este bloque completo **entre** el final de `_concat_placas_remolques` y el inicio de `_validar_operador_vigente`:

```python
def _dividir_por_guion(segmento: str) -> tuple[str, str]:
    """
    Divide un segmento de texto en (parte_1, parte_2) usando '-' como separador.
    Si no hay '-', parte_2 queda vacía.
    Ej: "40 - 20" -> ("40", "20")   |   "40" -> ("40", "")
    """
    if '-' in segmento:
        izquierda, derecha = segmento.split('-', 1)
        return izquierda.strip(), derecha.strip()
    return segmento.strip(), ''


def _parsear_tipo(tipo_raw: str) -> tuple[str, str, str, str]:
    """
    Parsea el campo 'tipo' de Maniobra. El frontend garantiza el formato
    'IZQUIERDA / DERECHA' para registros nuevos (la diagonal es obligatoria
    y no editable en ManiobrasPage). Cada lado puede además tener un '-'
    interno para representar dos valores (ej. viajes full con dos tipos
    de contenedor distintos, o carga suelta con dos tipos de bulto).

    Ejemplos:
      "40 / HC"                      -> ("40", "",   "HC", "")
      "40 - 20 / HC - DC"            -> ("40", "20", "HC", "DC")
      "7 / PALLETS"                  -> ("7",  "",   "PALLETS", "")
      "9 - 14 / PALLETS - CARTONES"  -> ("9",  "14", "PALLETS", "CARTONES")
      "" o cualquier texto sin '/'   -> ("", "", "", "")  (registro viejo sin
                                          migrar: se trata como vacío, no error)

    Devuelve (numero_1, numero_2, letra_1, letra_2).
    """
    if not tipo_raw or '/' not in tipo_raw:
        return '', '', '', ''
    parte_izquierda, parte_derecha = tipo_raw.split('/', 1)
    numero_1, numero_2 = _dividir_por_guion(parte_izquierda)
    letra_1, letra_2   = _dividir_por_guion(parte_derecha)
    return numero_1, numero_2, letra_1, letra_2


def _es_carga_suelta(contenedor: str) -> bool:
    """
    True si la columna Contenedor de la maniobra contiene la palabra
    'CARGA SUELTA' (comparación tipo 'contains', no exige coincidencia exacta).
    """
    return 'CARGA SUELTA' in (contenedor or '').upper()
```

### 1.2 — Agregar función compartida `_generar_pdf_cta_port`

**Ubicación:** justo después de `_validar_operador_vigente` (línea ~148 original), antes de `class TractoViewSet`.

Insertar este bloque completo:

```python
def _generar_pdf_cta_port(request_data, template_path, nombre_archivo_pdf: str):
    """
    Lógica compartida para generar el PDF de la hoja 'CTA PORT FRABA CONTAINER'.
    La usan tanto DocumentoCtaPortView (Fraba Container) como
    DocumentoCtaPortTercerosView (Terceros) — ambos templates comparten
    EXACTAMENTE el mismo mapeo de celdas para esta hoja, solo cambia el
    archivo de template de origen y el nombre del PDF de salida.

    Devuelve:
      - HttpResponse con el PDF en caso de éxito.
      - rest_framework Response con status de error en caso de fallo.
    """
    # ── Leer datos del body (en MAYÚSCULAS para el Excel) ──────────────────
    folio       = request_data.get('folio', '').strip().upper()
    ccp         = request_data.get('ccp', '').strip().upper()
    origen      = request_data.get('origen', '').strip().upper()
    destino     = request_data.get('destino', '').strip().upper()

    # Datos del cliente
    cliente_nombre    = request_data.get('cliente_nombre', '').strip().upper()
    cliente_domicilio = request_data.get('cliente_domicilio', '').strip().upper()
    cliente_colonia   = request_data.get('cliente_colonia', '').strip().upper()
    cliente_ciudad    = request_data.get('cliente_ciudad', '').strip().upper()

    # Datos de la carga (auto-llenados desde maniobra via folio)
    tipo       = request_data.get('tipo', '').strip().upper()
    peso_raw   = request_data.get('peso', '')
    contenedor = request_data.get('contenedor', '').strip().upper()
    pedimento  = request_data.get('pedimento', '').strip().upper()
    referencia = request_data.get('referencia', '').strip().upper()

    # Datos de texto libre
    descripcion = request_data.get('descripcion', '').strip().upper()
    clave_sat   = request_data.get('clave_sat', '').strip().upper()

    # Conductor y placas
    operador   = request_data.get('operador', '').strip().upper()
    placas     = request_data.get('placas', '').strip().upper()
    remolque_1 = request_data.get('remolque_1', '').strip().upper()
    remolque_2 = request_data.get('remolque_2', '').strip().upper()

    # ── Validación mínima ──────────────────────────────────────────────────
    if not folio:
        return Response({'detail': 'El campo folio (Remisión) es requerido.'}, status=400)

    # ── Cálculos derivados ─────────────────────────────────────────────────
    remision_valor = f"{folio} / {ccp}" if ccp else folio

    es_carga_suelta = _es_carga_suelta(contenedor)
    es_full         = len(contenedor) > 12
    cantidad_label  = 2 if es_full else 1
    tipo_label      = 'CONTENEDORES' if es_full else 'CONTENEDOR'

    numero_1, numero_2, letra_1, letra_2 = _parsear_tipo(tipo)

    clave_sat_celda = f"CLAVE SAT:{clave_sat}" if clave_sat else ''

    try:
        peso_valor = float(peso_raw) if peso_raw else ''
    except (ValueError, TypeError):
        peso_valor = ''

    concat_placas = _concat_placas_remolques(placas, remolque_1, remolque_2)

    # ── Abrir template y trabajar en directorio temporal ──────────────────
    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            wb = load_workbook(str(template_path))
            ws = wb['CTA PORT FRABA CONTAINER']

            # Remisión: J2 (celda superior del rango fusionado J2:J3)
            ws['J2'] = remision_valor

            # Fecha de expedición del documento: día numérico / mes en español / año
            _hoy = date.today()
            ws['H5'] = _hoy.day
            ws['I5'] = _MESES_ES[_hoy.month]
            ws['J5'] = _hoy.year

            # Origen y Destino
            ws['B6'] = origen
            ws['G6'] = destino

            # Datos del cliente
            ws['G7']  = cliente_nombre
            ws['G8']  = cliente_domicilio
            ws['G9']  = cliente_colonia
            ws['G10'] = cliente_ciudad

            # Tabla de bultos — full/sencillo vs. carga suelta
            if es_carga_suelta:
                # No se escribe cantidad (A17) ni "CONTENEDOR/CONTENEDORES" (B17):
                # esas celdas se reutilizan para la primera pareja número/letra.
                ws['A17'] = numero_1
                ws['B17'] = letra_1
                if numero_2:
                    ws['A18'] = numero_2
                if letra_2:
                    ws['B18'] = letra_2
            else:
                ws['A17'] = cantidad_label    # 1 o 2
                ws['B17'] = tipo_label        # 'CONTENEDOR' o 'CONTENEDORES'
                ws['A18'] = numero_1
                ws['B18'] = letra_1
                if numero_2:
                    ws['A19'] = numero_2
                if letra_2:
                    ws['B19'] = letra_2

            ws['C16'] = referencia        # Referencia
            ws['C17'] = contenedor        # No. de contenedor (o "CARGA SUELTA")
            ws['C18'] = pedimento         # Pedimento
            ws['F17'] = peso_valor        # Peso numérico

            # Descripción y Clave SAT
            ws['C20'] = descripcion
            ws['C21'] = clave_sat_celda

            # Conductor y Placas (valores directos para PDF autónomo)
            ws['C23'] = operador
            ws['F23'] = concat_placas

            # Eliminar las otras hojas para exportar solo CTA PORT
            for nombre_hoja in [n for n in wb.sheetnames if n != 'CTA PORT FRABA CONTAINER']:
                del wb[nombre_hoja]

            xlsx_tmp = os.path.join(tmp_dir, 'cta_port.xlsx')
            wb.save(xlsx_tmp)

            pdf_path = _xlsx_a_pdf(xlsx_tmp, tmp_dir)

            with open(pdf_path, 'rb') as f:
                pdf_bytes = f.read()

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{nombre_archivo_pdf}"'
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

### 1.3 — Agregar la ruta del nuevo template

**Ubicación:** justo debajo de `_TEMPLATE_PATH` (línea ~29, dentro del bloque `# ── Documentos de viaje ──`).

**Buscar:**
```python
_TEMPLATE_PATH = (
    settings.BASE_DIR / 'api' / 'documentos' / 'templates' / 'CTA_PTE_FORMATO.xlsx'
)
```

**Reemplazar por:**
```python
_TEMPLATE_PATH = (
    settings.BASE_DIR / 'api' / 'documentos' / 'templates' / 'CTA_PTE_FORMATO.xlsx'
)
_TEMPLATE_PATH_TERCEROS = (
    settings.BASE_DIR / 'api' / 'documentos' / 'templates' / 'CTA_PTE_TERCEROS_FORMATO.xlsx'
)
```

---

## FASE 2 — Backend: simplificar `DocumentoCtaPortView` para usar el helper

**Archivo:** `api/views.py`
**Clase:** `DocumentoCtaPortView` (la que existe hoy, línea ~736).

**Buscar** el método `post` completo de `DocumentoCtaPortView` (desde `def post(self, request):` hasta el `except Exception as exc:` final de esa clase, es decir todo el cuerpo actual que arma `folio`, `ccp`, calcula `es_full`, abre el workbook, escribe las celdas, convierte a PDF, etc. — el bloque completo mostrado en el contexto original, líneas 748-875 aprox.)

**Reemplazar TODO ese método `post` por:**
```python
    def post(self, request):
        return _generar_pdf_cta_port(request.data, _TEMPLATE_PATH, 'cta_port.pdf')
```

La clase `DocumentoCtaPortView` queda así (docstring y atributos de clase NO se tocan, solo el método `post`):
```python
class DocumentoCtaPortView(APIView):
    """
    POST /api/documentos/cta-port/
    Recibe datos del formulario, llena la hoja 'CTA PORT FRABA CONTAINER'
    del template Excel y devuelve el PDF generado.
    Requiere autenticación JWT.
    Todos los valores de texto se escriben en MAYÚSCULAS.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def post(self, request):
        return _generar_pdf_cta_port(request.data, _TEMPLATE_PATH, 'cta_port.pdf')
```

**⚠️ Importante:** no tocar `DocumentoBitacoraGastosView` ni `DocumentoBitacoraSuenoView`. Su lógica no cambia en este plan.

---

## FASE 3 — Backend: nueva vista `DocumentoCtaPortTercerosView`

**Archivo:** `api/views.py`
**Ubicación:** justo después de la clase `DocumentoCtaPortView` (que ahora quedó reducida), y antes de `class DocumentoBitacoraGastosView`.

Insertar:
```python
class DocumentoCtaPortTercerosView(APIView):
    """
    POST /api/documentos/cta-port-terceros/
    Genera el PDF de Carta Porte para transportistas Terceros, usando el
    template CTA_PTE_TERCEROS_FORMATO.xlsx. Comparte exactamente el mismo
    mapeo de celdas y la misma lógica de negocio que DocumentoCtaPortView
    (ver _generar_pdf_cta_port). No genera Bitácora de Gastos.
    Requiere autenticación JWT.
    Todos los valores de texto se escriben en MAYÚSCULAS.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def post(self, request):
        return _generar_pdf_cta_port(request.data, _TEMPLATE_PATH_TERCEROS, 'cta_port_terceros.pdf')
```

---

## FASE 4 — Backend: registrar la nueva URL

**Archivo:** `api/urls.py`

**Buscar** la línea (o bloque) donde está registrada:
```python
path('documentos/cta-port/', DocumentoCtaPortView.as_view())
```
(ajustar sintaxis exacta al patrón real del archivo — puede tener `name=` u otras opciones; replicar el mismo estilo).

**Acción:**
1. Importar `DocumentoCtaPortTercerosView` junto con las demás vistas de `views.py` en el `import` correspondiente de `urls.py`.
2. Agregar, inmediatamente después de la línea de `cta-port/`, una línea nueva:
```python
path('documentos/cta-port-terceros/', DocumentoCtaPortTercerosView.as_view()),
```
respetando exactamente el mismo estilo (comas, `name=`, etc.) que ya usa la línea de `cta-port/`.

---

## FASE 5 — Frontend: campo `tipo` dividido en `ManiobrasPage.jsx`

**Archivo:** `src/pages/ManiobrasPage.jsx`

### 5.1 — Nuevo componente `TipoSplitInput`

**Ubicación:** insertar justo antes de `const COLUMNAS = [` (después de la línea `registerLocale("es", es);` y el comentario `// ── Constantes ──...`).

```jsx
// Campo "tipo": fuerza el formato "IZQUIERDA / DERECHA". La diagonal es fija,
// nunca editable ni borrable por el usuario — se compone automáticamente al
// unir los dos sub-campos. Cada lado admite texto libre, incluyendo un "-"
// interno para casos con dos valores (ej. "40 - 20" o "HC - DC").
function TipoSplitInput({ value, onChange, disabled, idPrefix }) {
  const partes = (value || "").split("/");
  const izquierda = (partes[0] || "").trim();
  const derecha   = (partes[1] || "").trim();

  const emitir = (nuevaIzquierda, nuevaDerecha) => {
    const izq = nuevaIzquierda !== undefined ? nuevaIzquierda : izquierda;
    const der = nuevaDerecha   !== undefined ? nuevaDerecha   : derecha;
    onChange(izq || der ? `${izq} / ${der}` : "");
  };

  return (
    <div className="tipo-split-input">
      <input
        id={idPrefix ? `${idPrefix}-izq` : undefined}
        type="text"
        value={izquierda}
        onChange={(e) => emitir(e.target.value, undefined)}
        placeholder="Ej. 40"
        disabled={disabled}
        aria-label="Tipo (izquierda)"
        className="tipo-split-campo"
      />
      <span className="tipo-split-separador">/</span>
      <input
        id={idPrefix ? `${idPrefix}-der` : undefined}
        type="text"
        value={derecha}
        onChange={(e) => emitir(undefined, e.target.value)}
        placeholder="Ej. HC"
        disabled={disabled}
        aria-label="Tipo (derecha)"
        className="tipo-split-campo"
      />
    </div>
  );
}
```

### 5.2 — Marcar la columna `tipo` con la nueva bandera

**Buscar** (dentro de `COLUMNAS`):
```js
  { key: "tipo",  label: "Tipo" },
```

**Reemplazar por:**
```js
  { key: "tipo",  label: "Tipo", isTipo: true },
```

### 5.3 — Usar `TipoSplitInput` en `FilaNueva`

**Buscar** dentro de `FilaNueva`, la rama final del `? :` en cascada (justo antes del `<input>` genérico de cierre):
```jsx
          ) : col.isRemolque2 ? (
            <RemolqueSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting || (datos.contenedor || "").length <= 12}
            />
          ) : (
            <input
              value={datos[col.key]}
              onChange={(e) => onChange(col.key, e.target.value)}
              placeholder={col.label}
              aria-label={col.label}
            />
          )}
```

**Reemplazar por:**
```jsx
          ) : col.isRemolque2 ? (
            <RemolqueSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting || (datos.contenedor || "").length <= 12}
            />
          ) : col.isTipo ? (
            <TipoSplitInput
              value={datos[col.key]}
              onChange={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
          ) : (
            <input
              value={datos[col.key]}
              onChange={(e) => onChange(col.key, e.target.value)}
              placeholder={col.label}
              aria-label={col.label}
            />
          )}
```

### 5.4 — Usar `TipoSplitInput` en `ModalEditar`

**Buscar** dentro de `ModalEditar`, la rama equivalente:
```jsx
                ) : col.isRemolque2 ? (
                  <RemolqueSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting || (datos.contenedor || "").length <= 12}
                  />
                ) : (
                  <input
                    id={`edit-${col.key}`}
                    value={datos[col.key] ?? ""}
                    onChange={(e) => onChange(col.key, e.target.value)}
                  />
                )}
```

**Reemplazar por:**
```jsx
                ) : col.isRemolque2 ? (
                  <RemolqueSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting || (datos.contenedor || "").length <= 12}
                  />
                ) : col.isTipo ? (
                  <TipoSplitInput
                    idPrefix={`edit-${col.key}`}
                    value={datos[col.key] ?? ""}
                    onChange={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : (
                  <input
                    id={`edit-${col.key}`}
                    value={datos[col.key] ?? ""}
                    onChange={(e) => onChange(col.key, e.target.value)}
                  />
                )}
```

### 5.5 — Confirmar que NO hay más cambios necesarios en este archivo

- `MANIOBRA_VACIA.tipo = ""` ya es compatible, no se toca.
- La tabla de solo lectura (renderizado de filas existentes) sigue mostrando `maniobra[col.key]` tal cual (el string ya viene con formato `"IZQ / DER"` desde el backend) — no se toca, no hace falta un renderizador especial ahí.
- `isRemolque2` sigue basado en `contenedor.length > 12`, sin relación con "CARGA SUELTA" — el usuario no pidió cambiar esa regla, no se toca.

### 5.6 — CSS del nuevo campo

**Archivo:** `src/pages/ManiobrasPage.css`
**Acción:** agregar al final del archivo:
```css
.tipo-split-input {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tipo-split-campo {
  flex: 1;
  min-width: 0;
}
.tipo-split-separador {
  font-weight: 600;
  color: var(--text-light);
  user-select: none;
}
```

---

## FASE 6 — Frontend: nuevo componente `CtaPorteTercerosModal.jsx`

**Archivo nuevo:** `src/components/CtaPorteTercerosModal/CtaPorteTercerosModal.jsx`
**Archivo nuevo:** `src/components/CtaPorteTercerosModal/CtaPorteTercerosModal.css`

Es un clon de `src/components/CtaPortModal/CtaPortModal.jsx`, con estas diferencias exactas:

1. **Título del modal:** `"CTA Porte Terceros"` en vez de `"CTA Port Fraba Container"`.
2. **Sin `total_gastos`:** eliminar del `ESTADO_INICIAL` la clave `total_gastos`, eliminar el bloque de UI "Total de Gastos" (el `<div className="cpm-campo">` con el input `type="number"` de Total de Gastos, incluida su etiqueta y el hint que dice "Se incluirá como Total de Gastos..."), y eliminarlo del `payload` en `handleGenerar`.
3. **Una sola descarga, no dos:** en `handleGenerar`, eliminar por completo el bloque de la 2ª descarga (`DocumentoBitacoraGastosView` / `bitacora_gastos.pdf` / la pausa de 600ms). Solo queda:
```js
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

    const blob = await apiClient.download("/documentos/cta-port-terceros/", payload);
    triggerDownload(blob, "cta_port_terceros.pdf");

    setExito(true);
  } catch (err) {
    setError(err.message || "Error al generar el documento.");
  } finally {
    setGenerando(false);
  }
};
```
4. **Botón de generar:** el texto y el `disabled` ya no dependen de `total_gastos`:
```jsx
<button
  type="button"
  className="cpm-btn-generar"
  onClick={handleGenerar}
  disabled={generando || !datos.folio}
>
  {generando
    ? <><Loader size={16} className="cpm-spin" /> Generando documento...</>
    : <><Download size={16} /> Generar CTA Porte Terceros</>}
</button>
```
5. **Mensaje de éxito:** cambiar `"PDF generado y descargado correctamente."` (se puede dejar igual, es genérico — no requiere cambio, pero si se desea especificar, usar el mismo texto).
6. **Todo lo demás es idéntico** a `CtaPortModal.jsx`: Remisión (folio/ccp con `FolioSelector`), Origen/Destino, sección Cliente con `ClienteSelector`, sección Carga de solo lectura (tipo/peso/contenedor/referencia/pedimento) con el mismo hint de full/sencillo, Descripción y Clave SAT (sin el bloque de Total de Gastos), sección Conductor y Placas con `OperadorSelector`/`PlacasSelector`/`RemolqueSelector` — copiar tal cual, incluyendo el `handleFolio`, `handleCliente`, `handleOperador`, `handlePlacas`, `handleRemolque1`, `handleRemolque2`, `cambiarCampo`, `triggerDownload`, y la lógica `esFullViaje`/`remolque2Habilitado` sin ningún cambio.
7. **`CtaPorteTercerosModal.css`:** copia exacta de `CtaPortModal.css` (mismas clases `cpm-*`, ya que se reutiliza la misma estructura de marcado).

---

## FASE 7 — Frontend: agregar la tarjeta en `DocumentosViajePage.jsx`

**Archivo:** `src/pages/DocumentosViajePage.jsx`

### 7.1 — Import

**Buscar:**
```jsx
import CtaPortModal from "../components/CtaPortModal/CtaPortModal";
```

**Reemplazar por:**
```jsx
import CtaPortModal from "../components/CtaPortModal/CtaPortModal";
import CtaPorteTercerosModal from "../components/CtaPorteTercerosModal/CtaPorteTercerosModal";
```

### 7.2 — Nueva entrada en `DOCUMENTOS`

**Buscar:**
```jsx
  {
    id: "ctaport",
    clase: "Carta porte + Bitácora de gastos",
    titulo: "CTA Porte Fraba Container",
    desc: "Genera dos documentos: la Carta Porte de la carga y la Bitácora de Gastos de viaje.",
    campos: ["Cliente", "Carga", "Conductor", "Total de gastos"],
    Icon: FileText,
  },
];
```

**Reemplazar por:**
```jsx
  {
    id: "ctaport",
    clase: "Carta porte + Bitácora de gastos",
    titulo: "CTA Porte Fraba Container",
    desc: "Genera dos documentos: la Carta Porte de la carga y la Bitácora de Gastos de viaje.",
    campos: ["Cliente", "Carga", "Conductor", "Total de gastos"],
    Icon: FileText,
  },
  {
    id: "ctaporte-terceros",
    clase: "Carta porte",
    titulo: "CTA Porte Terceros",
    desc: "Genera la Carta Porte para transportistas terceros.",
    campos: ["Cliente", "Carga", "Conductor"],
    Icon: FileText,
  },
];
```

### 7.3 — Actualizar el comentario del estado (opcional, cosmético)

**Buscar:**
```jsx
  const [modalAbierto, setModalAbierto] = useState(null); // 'bitacora' | 'ctaport' | null
```

**Reemplazar por:**
```jsx
  const [modalAbierto, setModalAbierto] = useState(null); // 'bitacora' | 'ctaport' | 'ctaporte-terceros' | null
```

### 7.4 — Renderizar el nuevo modal

**Buscar:**
```jsx
      {modalAbierto === "ctaport" && (
        <CtaPortModal onCerrar={() => setModalAbierto(null)} />
      )}
    </div>
  );
}
```

**Reemplazar por:**
```jsx
      {modalAbierto === "ctaport" && (
        <CtaPortModal onCerrar={() => setModalAbierto(null)} />
      )}
      {modalAbierto === "ctaporte-terceros" && (
        <CtaPorteTercerosModal onCerrar={() => setModalAbierto(null)} />
      )}
    </div>
  );
}
```

---

## FASE 8 — Checklist de QA manual (después de implementar)

1. **Regresión Fraba Container — caso normal (sencillo):** crear/editar una maniobra con `contenedor` de longitud ≤12 (no full) y `tipo = "40 / HC"`. Generar Cta Porte Fraba Container. Verificar: A17=`1`, B17=`CONTENEDOR`, A18=`40`, B18=`HC`, A19/B19 vacíos.
2. **Regresión Fraba Container — caso full con doble tipo:** `contenedor` >12 caracteres, `tipo = "40 - 20 / HC - DC"`. Verificar: A17=`2`, B17=`CONTENEDORES`, A18=`40`, A19=`20`, B18=`HC`, B19=`DC`.
3. **Caso CARGA SUELTA simple:** `contenedor = "CARGA SUELTA"`, `tipo = "7 / PALLETS"`. Verificar: A17=`7`, B17=`PALLETS`, A18/B18 vacíos, y que NO aparezca `1`/`2` ni `CONTENEDOR(ES)` en ningún lado.
4. **Caso CARGA SUELTA doble:** `contenedor` contiene "CARGA SUELTA" (ej. `"CARGA SUELTA - LOTE 2"`, para probar el `contains`), `tipo = "9 - 14 / PALLETS - CARTONES"`. Verificar: A17=`9`, A18=`14`, B17=`PALLETS`, B18=`CARTONES`.
5. **Registro viejo sin `/` en tipo:** verificar que el documento se genera sin error, con A18/B18 (o A17/B17 según el caso) en blanco.
6. **Cta Porte Terceros — flujo completo:** generar un documento nuevo desde folio existente, confirmar que llega un solo PDF (no dos), que el nombre de archivo descargado es `cta_port_terceros.pdf`, y que las celdas C23 (operador) y F23 (placas/remolques) y G7-G10 (cliente) se ven correctas en el PDF.
7. **UI del campo Tipo en ManiobrasPage:** en `FilaNueva` y en `ModalEditar`, verificar que el separador `/` es visualmente fijo (no es un carácter dentro de un input editable), que cada sub-campo permite escribir texto libre, y que al guardar se compone correctamente el string `"IZQ / DER"`. Verificar también que si ambos sub-campos quedan vacíos, se guarda `tipo = ""` (no `" / "`).
8. **Confirmar que NO se rompió nada más:** Bitácora de Sueño y Bitácora de Gastos siguen funcionando igual que antes (no fueron tocadas).
