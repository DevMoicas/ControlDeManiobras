# PLAN — Fecha de Expedición en CTA PORT FRABA CONTAINER (H5, I5, J5)

## Alcance
Un solo archivo modificado: `api/views.py`.
Dos cambios quirúrgicos dentro de ese archivo.
Cero cambios en frontend, modelos, serializers, URLs o cualquier otro archivo.

---

## PASO 1 — `api/views.py`: Agregar constante `_MESES_ES` a nivel de módulo

Localizar la sección de constantes de módulo que ya existe en `views.py`.
Actualmente esa sección contiene (en este orden):

```python
_TEMPLATE_PATH = (
    settings.BASE_DIR / 'api' / 'documentos' / 'templates' / 'CTA_PTE_FORMATO.xlsx'
)
```

y las funciones auxiliares `_xlsx_a_pdf` y `_concat_placas_remolques`.

AGREGAR la siguiente constante inmediatamente DESPUÉS de `_TEMPLATE_PATH` y ANTES de `_xlsx_a_pdf`:

```python
_MESES_ES = {
    1:  'ENERO',
    2:  'FEBRERO',
    3:  'MARZO',
    4:  'ABRIL',
    5:  'MAYO',
    6:  'JUNIO',
    7:  'JULIO',
    8:  'AGOSTO',
    9:  'SEPTIEMBRE',
    10: 'OCTUBRE',
    11: 'NOVIEMBRE',
    12: 'DICIEMBRE',
}
```

**Resultado esperado del bloque de constantes/auxiliares (orden):**
```python
_TEMPLATE_PATH = (...)

_MESES_ES = {
    1: 'ENERO',
    ...
    12: 'DICIEMBRE',
}

def _xlsx_a_pdf(...): ...
def _concat_placas_remolques(...): ...
```

---

## PASO 2 — `api/views.py`: Verificar import de `date`

Buscar en la sección de imports al inicio del archivo si ya existe alguna de estas líneas:

```python
from datetime import date
```
o
```python
import datetime
```

- Si `from datetime import date` ya está → no hacer nada.
- Si solo está `import datetime` → agregar `from datetime import date` en la misma sección de imports.
- Si no existe ninguna → AGREGAR `from datetime import date` en la sección de imports estándar de Python (junto a `os`, `subprocess`, `tempfile`).

---

## PASO 3 — `api/views.py`: Escribir H5, I5, J5 dentro de `DocumentoCtaPortView`

Localizar la clase `DocumentoCtaPortView` y dentro de ella el método `post`.

Dentro del método `post`, localizar el bloque donde se escriben valores a las celdas de la hoja CTA PORT. Ese bloque comienza con:

```python
ws['J2'] = remision_valor
```

AGREGAR las siguientes tres líneas en ese mismo bloque, inmediatamente DESPUÉS de la línea `ws['J2'] = remision_valor`:

```python
# Fecha de expedición del documento: día numérico / mes en español / año
_hoy = date.today()
ws['H5'] = _hoy.day
ws['I5'] = _MESES_ES[_hoy.month]
ws['J5'] = _hoy.year
```

**Resultado esperado del bloque de escritura de celdas (fragmento):**
```python
ws['J2'] = remision_valor

# Fecha de expedición del documento: día numérico / mes en español / año
_hoy = date.today()
ws['H5'] = _hoy.day
ws['I5'] = _MESES_ES[_hoy.month]
ws['J5'] = _hoy.year

ws['B6'] = origen
ws['G6'] = destino
# ... resto de celdas sin cambio ...
```

---

## VERIFICACIÓN FINAL

Confirmar que el bloque de constantes de módulo en `views.py` queda en este orden exacto:

```
_TEMPLATE_PATH  → ruta al template Excel
_MESES_ES       → diccionario de meses en español  ← nuevo
_xlsx_a_pdf     → función auxiliar de conversión LibreOffice
_concat_placas_remolques → función auxiliar de concatenación
```

Confirmar que `DocumentoCtaPortView.post()` escribe en este orden al inicio del bloque de celdas:

```
ws['J2'] → remision (folio / ccp)
ws['H5'] → día      ← nuevo
ws['I5'] → mes      ← nuevo
ws['J5'] → año      ← nuevo
ws['B6'] → origen
ws['G6'] → destino
... resto sin cambio
```

## ARCHIVOS AFECTADOS

```
api/views.py   ← ÚNICO archivo modificado
```

Sin cambios en: modelos, serializers, URLs, migraciones, frontend, template Excel.
