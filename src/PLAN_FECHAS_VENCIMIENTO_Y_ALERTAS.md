# PLAN — Fechas de Vencimiento en Catálogos + Alertas en Home

## Contexto y decisiones

- **Choferes** → nueva columna `fecha_vencimiento_licencia` (DateField, managed=False → SQL primero).
- **Tractos** → nueva columna `fecha_vencimiento_poliza` (DateField, managed=False → SQL primero).
- **"Nombre del tracto"** en el mensaje de alerta = campo `no_eco` del modelo Tracto (es el identificador único del vehículo).
- **Umbral de alerta**: 30 días calendario antes del vencimiento (equivale a "1 mes").
- **Sin botón de cierre**: las alertas son permanentes en Home hasta que la fecha se actualice en Catálogos.
- **Formato de fecha en alertas**: `dd/MM/yyyy` (ej. 25/07/2025).
- **Formato del input de fecha en formulario**: `<input type="date">` con valor `YYYY-MM-DD` (formato nativo de DateField de Django, compatible sin conversión).
- **Orden de alertas**: de izquierda a derecha por fecha más próxima a vencer (la más urgente primero).
- **Layout de alertas**: `flex` horizontal con `flex-wrap` para que no se encimen si hay muchas.
- **Visible para todos los usuarios** (no depende de rol).

---

## PASO 1 — SQL en pgAdmin (ejecutar ANTES de la migración)

Ambas tablas son `managed=False`. Las columnas se crean vía SQL; la migración solo actualiza el estado del modelo Python.

```sql
-- Chofer
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS fecha_vencimiento_licencia DATE NULL;

-- Tracto
ALTER TABLE tractos ADD COLUMN IF NOT EXISTS fecha_vencimiento_poliza DATE NULL;
```

---

## PASO 2 — `api/models.py`: Agregar campos a `Chofer` y `Tracto`

#### 2a. En la clase `Chofer`

Localizar el bloque de campos del modelo `Chofer`. AGREGAR al final de los campos declarados (después de `licencia`):

```python
fecha_vencimiento_licencia = models.DateField(null=True, blank=True)
```

**Resultado esperado del bloque de campos de Chofer:**
```python
nombre    = models.CharField(...)
rfc       = models.CharField(...)
licencia  = models.CharField(...)
fecha_vencimiento_licencia = models.DateField(null=True, blank=True)   # ← nuevo
```

#### 2b. En la clase `Tracto`

Localizar el bloque de campos del modelo `Tracto`. AGREGAR al final de los campos declarados (después de `tipo`):

```python
fecha_vencimiento_poliza = models.DateField(null=True, blank=True)
```

**Resultado esperado del bloque de campos de Tracto:**
```python
no_eco  = models.CharField(...)
unidad  = models.CharField(...)
anio    = models.IntegerField(...)
placas  = models.CharField(...)
tipo    = models.CharField(...)
fecha_vencimiento_poliza = models.DateField(null=True, blank=True)   # ← nuevo
```

---

## PASO 3 — Ejecutar migración

```bash
python manage.py makemigrations api --name="add_fecha_vencimiento_licencia_y_poliza"
python manage.py migrate
```

La migración actualiza el estado interno de Django para los modelos `managed=False`. Las columnas físicas ya existen en PostgreSQL desde el PASO 1.

---

## PASO 4 — `api/Serializers.py`: Verificar serializers

Localizar `ChoferSerializer` y `TractoSerializer`.

- Si usan `fields = '__all__'`: no requieren cambio — Django incluirá los nuevos campos automáticamente.
- Si tienen una lista explícita de campos: AGREGAR `'fecha_vencimiento_licencia'` a `ChoferSerializer` y `'fecha_vencimiento_poliza'` a `TractoSerializer`.

---

## PASO 5 — `api/views.py`: Agregar `AlertasVencimientoView`

#### 5a. Verificar import de `date`

Buscar `from datetime import date` en los imports de `views.py`. Ya debe existir del plan anterior. Si no, AGREGAR.

#### 5b. Agregar la vista

Al final de `views.py`, después de `DocumentoBitacoraGastosView`, AGREGAR:

```python
class AlertasVencimientoView(APIView):
    """
    GET /api/alertas-vencimiento/
    Devuelve todas las licencias de choferes y pólizas de tractos
    que vencen en los próximos 30 días, ordenadas por fecha ascendente.
    Visible para todos los usuarios autenticados sin distinción de rol.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def get(self, request):
        from datetime import timedelta
        hoy        = date.today()
        en_30_dias = hoy + timedelta(days=30)

        # Choferes con licencia que vence entre hoy y 30 días
        choferes_por_vencer = Chofer.objects.filter(
            fecha_vencimiento_licencia__isnull=False,
            fecha_vencimiento_licencia__gte=hoy,
            fecha_vencimiento_licencia__lte=en_30_dias,
        ).values('nombre', 'fecha_vencimiento_licencia')

        # Tractos con póliza que vence entre hoy y 30 días
        tractos_por_vencer = Tracto.objects.filter(
            fecha_vencimiento_poliza__isnull=False,
            fecha_vencimiento_poliza__gte=hoy,
            fecha_vencimiento_poliza__lte=en_30_dias,
        ).values('no_eco', 'fecha_vencimiento_poliza')

        alertas = []

        for c in choferes_por_vencer:
            alertas.append({
                'tipo':      'licencia',
                'nombre':    c['nombre'] or '(sin nombre)',
                'fecha':     c['fecha_vencimiento_licencia'].strftime('%d/%m/%Y'),
                'fecha_raw': c['fecha_vencimiento_licencia'].isoformat(),
            })

        for t in tractos_por_vencer:
            alertas.append({
                'tipo':      'poliza',
                'nombre':    t['no_eco'] or '(sin no. eco)',
                'fecha':     t['fecha_vencimiento_poliza'].strftime('%d/%m/%Y'),
                'fecha_raw': t['fecha_vencimiento_poliza'].isoformat(),
            })

        # Ordenar de más próxima a más lejana (izquierda → derecha en el UI)
        alertas.sort(key=lambda a: a['fecha_raw'])

        return Response(alertas)
```

---

## PASO 6 — `api/urls.py`: Registrar el nuevo endpoint

#### 6a. Agregar import

En la sección de imports, AGREGAR `AlertasVencimientoView`:

```python
from .views import (
    # ... todos los existentes ...
    AlertasVencimientoView,   # ← AGREGAR
)
```

#### 6b. Agregar path en `urlpatterns`

Inmediatamente después del path de `bitacora-gastos`, AGREGAR:

```python
path('alertas-vencimiento/', AlertasVencimientoView.as_view(), name='alertas-vencimiento'),
```

---

## PASO 7 — `src/pages/CatalogosPage.jsx`: Agregar campos de fecha

Se realizan 3 cambios en este archivo.

---

#### Cambio 7a — Agregar campos al `configFormularios`

Localizar el objeto `configFormularios` en `CatalogosPage.jsx`.

**En la entrada `choferes`**, AGREGAR al final del array el campo de fecha de vencimiento de licencia:

```js
{ key: 'fecha_vencimiento_licencia', label: 'Fecha Vencimiento Licencia', type: 'date' }
```

**En la entrada `tractos`**, AGREGAR al final del array el campo de fecha de vencimiento de póliza:

```js
{ key: 'fecha_vencimiento_poliza', label: 'Fecha Vencimiento Póliza', type: 'date' }
```

**Importante:** si los campos existentes son strings simples (ej. `'nombre'`, `'rfc'`), el nuevo campo se agrega como objeto. Si ya son objetos con `key` y `label`, seguir el mismo formato.

---

#### Cambio 7b — Actualizar `TRADUCCIONES_COLUMNAS`

Localizar el objeto `TRADUCCIONES_COLUMNAS`. AGREGAR las dos nuevas entradas:

```js
fecha_vencimiento_licencia: 'Fecha Vencimiento Licencia',
fecha_vencimiento_poliza:   'Fecha Vencimiento Póliza',
```

---

#### Cambio 7c — Actualizar el renderizador del formulario para soporte de tipo `date`

Localizar en `CatalogosPage.jsx` el bloque donde se renderizan los campos del formulario de agregar/editar (el modal o inline form donde se itera sobre `configFormularios[vista]`).

Ese bloque actualmente probablemente renderiza todos los campos como `<input type="text">` o similar.

Encontrar exactamente dónde se renderiza cada campo de formulario. Agregar la siguiente lógica de discriminación **antes** de renderizar el input de cada campo:

```js
// Normalizar campo: puede ser string o objeto
const fieldKey   = typeof campo === 'object' ? campo.key   : campo;
const fieldLabel = typeof campo === 'object'
  ? campo.label
  : (TRADUCCIONES_COLUMNAS[campo] || campo);
const fieldType  = typeof campo === 'object' ? (campo.type || 'text') : 'text';
```

Luego, donde se renderiza el `<input>`, REEMPLAZAR el input único por la siguiente estructura condicional:

```jsx
{fieldType === 'date' ? (
  <input
    type="date"
    className={/* misma clase CSS que usa el input de texto existente */}
    value={formData[fieldKey] || ''}
    onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
  />
) : (
  /* el <input type="text"> o el JSX original para ese campo, usando fieldKey en lugar de campo */
  <input
    type="text"
    className={/* misma clase CSS existente */}
    value={formData[fieldKey] || ''}
    onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
  />
)}
```

**Nota crítica:** No cambiar la lógica para los campos existentes que ya funcionan. Solo añadir la discriminación de `fieldType === 'date'`. El renderizado de los campos existentes (ahora usando `fieldKey` en lugar de `campo`) debe producir el mismo resultado que antes.

---

## PASO 8 — Crear `src/hooks/useAlertasVencimiento.js`

```js
import { useState, useEffect } from "react";
import { apiClient } from "../api/apiClient";

/**
 * useAlertasVencimiento
 * Obtiene las alertas de vencimiento de licencias y pólizas
 * desde el backend (umbral: 30 días).
 * Se llama una vez al montar el componente Home.
 */
export function useAlertasVencimiento() {
  const [alertas,  setAlertas]  = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setCargando(true);
    apiClient
      .get("/alertas-vencimiento/")
      .then((data) => setAlertas(Array.isArray(data) ? data : []))
      .catch(() => setAlertas([]))
      .finally(() => setCargando(false));
  }, []);

  return { alertas, cargando };
}
```

---

## PASO 9 — Crear `src/components/AlertaVencimiento/AlertaVencimiento.jsx`

```jsx
import "./AlertaVencimiento.css";

/**
 * AlertaVencimiento
 * Tarjeta de alerta de vencimiento próximo.
 * Sin botón de cierre — persiste hasta que el dato se actualice en BD.
 *
 * Props:
 *   alerta  { tipo: 'licencia'|'poliza', nombre: string, fecha: string }
 */
export default function AlertaVencimiento({ alerta }) {
  const mensaje =
    alerta.tipo === "licencia"
      ? `La licencia del chofer ${alerta.nombre} vence el día ${alerta.fecha}, actualice la licencia a la brevedad`
      : `La Póliza del carro ${alerta.nombre} vence el día ${alerta.fecha}, actualice la póliza a la brevedad`;

  return (
    <div className="av-card">
      <p className="av-urgente">¡URGENTE!</p>
      <p className="av-mensaje">{mensaje}</p>
    </div>
  );
}
```

---

## PASO 10 — Crear `src/components/AlertaVencimiento/AlertaVencimiento.css`

```css
.av-card {
  background: #fde8e8;          /* rojo pastel */
  border: 1px solid #f5c2c2;
  border-radius: 10px;
  padding: 14px 20px;
  min-width: 220px;
  max-width: 320px;
  text-align: center;
  flex-shrink: 0;
}

.av-urgente {
  color: #dc2626;               /* rojo vivo */
  font-weight: 700;
  font-size: 1rem;
  margin: 0 0 6px 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.av-mensaje {
  color: #111827;               /* negro casi puro */
  font-size: 0.82rem;
  margin: 0;
  line-height: 1.5;
}
```

---

## PASO 11 — Home page: integrar alertas de vencimiento

Localizar el componente que se renderiza en la ruta `/` (Home). Puede estar en `App.jsx` o en un componente separado (ej. `HomePage.jsx`). Claude Code debe buscar el componente que contiene las tarjetas de navegación (Maniobras, Gastos, Vacíos, etc.).

#### 11a. Agregar imports en el Home

En el archivo del Home, AGREGAR los siguientes imports:

```js
import { useAlertasVencimiento } from "../hooks/useAlertasVencimiento";
// Ajustar el path relativo según donde esté el archivo del Home
import AlertaVencimiento from "../components/AlertaVencimiento/AlertaVencimiento";
```

#### 11b. Llamar al hook en el cuerpo del componente

Dentro del cuerpo del componente Home (antes del `return`), AGREGAR:

```js
const { alertas } = useAlertasVencimiento();
```

#### 11c. Renderizar el bloque de alertas en el JSX

En el `return` del componente Home, AGREGAR el siguiente bloque **al inicio del contenido**, antes de las tarjetas de navegación y después del elemento contenedor más externo:

```jsx
{/* Alertas de vencimiento — solo visibles en Home */}
{alertas.length > 0 && (
  <div className="home-alertas-container">
    {alertas.map((alerta, index) => (
      <AlertaVencimiento key={`${alerta.tipo}-${index}`} alerta={alerta} />
    ))}
  </div>
)}
```

#### 11d. Agregar estilos del contenedor de alertas

En el archivo CSS del Home (o en `App.css` si el Home no tiene CSS propio), AGREGAR:

```css
/* Contenedor de alertas de vencimiento en Home */
.home-alertas-container {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
  padding: 16px 24px 8px;
  width: 100%;
  box-sizing: border-box;
}
```

---

## RESUMEN DE ARCHIVOS AFECTADOS

### Archivos nuevos (crear)
```
src/hooks/useAlertasVencimiento.js
src/components/AlertaVencimiento/AlertaVencimiento.jsx
src/components/AlertaVencimiento/AlertaVencimiento.css
```

### Archivos existentes a modificar
```
api/models.py          ← +fecha_vencimiento_licencia en Chofer
                         +fecha_vencimiento_poliza en Tracto
api/Serializers.py     ← verificar que incluyan los nuevos campos
api/views.py           ← +AlertasVencimientoView
api/urls.py            ← +path alertas-vencimiento/
src/pages/CatalogosPage.jsx  ← +campos fecha en configFormularios,
                               +TRADUCCIONES_COLUMNAS, +render tipo date
Componente Home (ruta /)     ← +useAlertasVencimiento, +bloque JSX alertas,
                               +CSS .home-alertas-container
```

### SQL adicional (pgAdmin, ANTES de la migración)
```sql
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS fecha_vencimiento_licencia DATE NULL;
ALTER TABLE tractos  ADD COLUMN IF NOT EXISTS fecha_vencimiento_poliza   DATE NULL;
```

---

## NOTAS CRÍTICAS PARA CLAUDE CODE

### Sobre el cambio 7c (renderizador de formulario en CatalogosPage)
Este es el cambio más delicado. El formulario en CatalogosPage actualmente itera sobre `configFormularios[vista]`. Si los campos son strings simples, la normalización con `typeof campo === 'object'` los detectará y caerán en el branch de `type: 'text'` (comportamiento idéntico al actual). Solo los nuevos campos `{ key, label, type: 'date' }` usarán el input de fecha. No se rompe nada existente.

### Sobre `<input type="date">` y el backend
Django serializa `DateField` como `"YYYY-MM-DD"` en JSON. `<input type="date">` también usa `"YYYY-MM-DD"` como su formato de value. No se necesita conversión. El valor del input va directamente al payload del PATCH/POST y Django lo entiende nativamente.

### Sobre el path del hook `useAlertasVencimiento` en el Home
Si el componente Home está en `src/App.jsx`, el path del import será `"./hooks/useAlertasVencimiento"`. Si está en `src/pages/HomePage.jsx` (o similar), será `"../hooks/useAlertasVencimiento"`. Claude Code debe ajustar el path relativo según la ubicación real del archivo.

### Sobre las alertas ya vencidas (fecha pasada)
El filtro del backend usa `__gte=hoy`, por lo que fechas ya vencidas NO aparecen en alertas. Las alertas solo muestran vencimientos próximos (entre hoy y 30 días). Si se desea mostrar también las ya vencidas, se puede eliminar `__gte=hoy` del filtro. Por ahora sigue la especificación: "próximas a vencer".

### Sobre Tractos y Choferes en vistas.py — imports
`AlertasVencimientoView` usa los modelos `Chofer` y `Tracto`. Verificar que ambos estén importados en `views.py`. Si los ViewSets existentes (`ChoferViewSet`, `TractoViewSet`) los usan, ya estarán importados.
