# PLAN — Lote de Mejoras: Catálogos, Columnas Nuevas, Alertas y Bloqueo de Licencia Vencida

## Alcance de este plan
Cubre las peticiones #1, #2, #3, #4/#11, #5, #6, #7, #8, #9, #10.
La petición #12 (SMS) queda fuera de este plan, pendiente de proveedor.

## Orden de ejecución (estricto, por dependencias)
```
FASE 1 — Catálogos base:           Transportistas, Cargos
FASE 2 — Columnas dependientes:    transportista (Maniobra), cargo (Empleado)
FASE 3 — Teléfono en Empleados
FASE 4 — Columnas independientes:  tag (Tracto), ruta_inicio/ruta_fin (Maniobra)
FASE 5 — Alertas:                  intermitencia sutil + umbrales separados (licencia 30d / póliza 14d)
FASE 6 — Bloqueo operador con licencia vencida (frontend + backend)
```

## Convenciones
- "AGREGAR" = añadir sin borrar. "REEMPLAZAR" = sustituir exactamente el bloque señalado.
- Paths relativos a la raíz del proyecto Django.
- Cada fase es independiente entre sí salvo donde se indique dependencia explícita; pueden ejecutarse en sesiones separadas de Claude Code siempre que se respete el orden.

---

# FASE 1 — Catálogos: Transportistas y Cargos

---

### PASO 1.1 — `api/models.py`: Agregar modelos `Transportista` y `Cargo`

Al final del archivo, AGREGAR:

```python
class Transportista(models.Model):
    nombre = models.CharField(max_length=255, unique=True)

    class Meta:
        managed  = True
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class Cargo(models.Model):
    nombre = models.CharField(max_length=255, unique=True)

    class Meta:
        managed  = True
        ordering = ['nombre']

    def __str__(self):
        return self.nombre
```

---

### PASO 1.2 — `api/Serializers.py`: Agregar serializers

Al final del archivo, AGREGAR:

```python
class TransportistaSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Transportista
        fields = '__all__'


class CargoSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Cargo
        fields = '__all__'
```

---

### PASO 1.3 — `api/views.py`: Agregar ViewSets

Al final del archivo, AGREGAR:

```python
class TransportistaViewSet(viewsets.ModelViewSet):
    queryset               = Transportista.objects.all()
    serializer_class       = TransportistaSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({'detail': 'No tienes permisos para eliminar registros.'}, status=403)
        return super().destroy(request, *args, **kwargs)


class CargoViewSet(viewsets.ModelViewSet):
    queryset               = Cargo.objects.all()
    serializer_class       = CargoSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({'detail': 'No tienes permisos para eliminar registros.'}, status=403)
        return super().destroy(request, *args, **kwargs)
```

Verificar que `Transportista`, `Cargo`, `TransportistaSerializer`, `CargoSerializer` estén importados en `views.py` si el archivo usa imports explícitos.

---

### PASO 1.4 — `api/urls.py`: Registrar ViewSets

En imports, AGREGAR `TransportistaViewSet`, `CargoViewSet`.

En el bloque de `router.register(...)`, AGREGAR:

```python
router.register(r'transportistas', TransportistaViewSet, basename='transportistas')
router.register(r'cargos',         CargoViewSet,         basename='cargos')
```

---

### PASO 1.5 — Migración con dato inicial (FRABA CONTAINER precargado)

```bash
python manage.py makemigrations api --name="add_transportista_cargo"
```

Después de generar la migración, ABRIR el archivo de migración recién creado en `api/migrations/` y AGREGAR una `RunPython` al final de `operations`, de forma que quede así:

```python
from django.db import migrations, models


def crear_transportista_default(apps, schema_editor):
    Transportista = apps.get_model('api', 'Transportista')
    Transportista.objects.get_or_create(nombre='FRABA CONTAINER')


def revertir_transportista_default(apps, schema_editor):
    Transportista = apps.get_model('api', 'Transportista')
    Transportista.objects.filter(nombre='FRABA CONTAINER').delete()


class Migration(migrations.Migration):

    dependencies = [
        # ... mantener la dependencia generada automáticamente ...
    ]

    operations = [
        # ... mantener las operaciones CreateModel generadas automáticamente ...
        migrations.RunPython(crear_transportista_default, revertir_transportista_default),
    ]
```

**Importante:** las funciones `crear_transportista_default` y `RunPython` se agregan DESPUÉS de las operaciones `CreateModel` generadas automáticamente, no las reemplazan.

```bash
python manage.py migrate
```

---

### PASO 1.6 — SQL en pgAdmin: RLS para las nuevas tablas

```sql
ALTER TABLE api_transportista ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_transportista FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON api_transportista TO django_standard_role;
CREATE POLICY standard_transportista_access ON api_transportista
    FOR ALL TO django_standard_role USING (true) WITH CHECK (true);

ALTER TABLE api_cargo ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_cargo FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON api_cargo TO django_standard_role;
CREATE POLICY standard_cargo_access ON api_cargo
    FOR ALL TO django_standard_role USING (true) WITH CHECK (true);
```

---

### PASO 1.7 — `src/pages/CatalogosPage.jsx`: Agregar pestañas Transportistas y Cargos

#### 1.7a. Agregar a la lista de pestañas

Localizar la lista/array de pestañas disponibles (`tractos | remolques | choferes | empleados | patios | clientes | origenes_destinos`). AGREGAR dos nuevas pestañas: `transportistas` y `cargos`.

#### 1.7b. Agregar a `configFormularios`

```js
transportistas: [
  { key: 'nombre', label: 'Nombre', type: 'text' },
],
cargos: [
  { key: 'nombre', label: 'Nombre', type: 'text' },
],
```

#### 1.7c. Agregar endpoints correspondientes

Donde el componente determina el endpoint según la `vista` activa (probablemente un `switch` o un objeto de mapeo `vista → endpoint`), AGREGAR:

```js
transportistas: '/transportistas/',
cargos:         '/cargos/',
```

#### 1.7d. `TRADUCCIONES_COLUMNAS`

AGREGAR (si `nombre` ya está traducido como "Nombre" para otras pestañas, no duplicar la clave; ya aplica).

---

# FASE 2 — Columnas dependientes de catálogos

---

### PASO 2.1 — SQL en pgAdmin: columna `transportista` en `maniobras`

```sql
ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS transportista VARCHAR(255) NULL;
```

### PASO 2.2 — SQL en pgAdmin: columna `cargo` en `empleados`

```sql
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS cargo VARCHAR(255) NULL;
```

---

### PASO 2.3 — `api/models.py`: Agregar campos

#### 2.3a. En `Maniobra`, después de `destino`, AGREGAR:

```python
transportista = models.CharField(max_length=255, null=True, blank=True)
```

**Nota de posición:** el campo se declara después de `destino` en el modelo Python para mantener legibilidad, pero su posición en la UI (columna de tabla) se controla en el frontend vía el array `COLUMNAS`, no por el orden de declaración del modelo.

#### 2.3b. En `Empleado`, AGREGAR:

```python
cargo = models.CharField(max_length=255, null=True, blank=True)
```

---

### PASO 2.4 — Migración

```bash
python manage.py makemigrations api --name="add_transportista_maniobra_cargo_empleado"
python manage.py migrate
```

---

### PASO 2.5 — Serializers: verificar inclusión

`ManiobraSerializer` y `EmpleadoSerializer` — si usan `fields = '__all__'`, no requieren cambio.

---

### PASO 2.6 — Crear `src/components/TransportistaSelector/TransportistaSelector.jsx`

Mismo patrón que `ClienteSelector`, adaptado:

```jsx
import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../api/apiClient";
import "./TransportistaSelector.css";

export default function TransportistaSelector({ currentValue, onSelect, disabled }) {
  const [abierto, setAbierto] = useState(false);
  const [transportistas, setTransportistas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    apiClient
      .get("/transportistas/")
      .then((data) => setTransportistas(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => setError("Error al cargar transportistas"))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const handleKey = (e) => { if (e.key === "Escape") setAbierto(false); };
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [abierto]);

  const handleSeleccionar = (t) => {
    onSelect(t.nombre);
    setAbierto(false);
  };

  return (
    <div className="tsl-wrapper" ref={ref}>
      <button type="button" className="tsl-btn" disabled={disabled} onClick={() => setAbierto((v) => !v)}>
        {currentValue || "— Seleccionar transportista —"}
      </button>
      {abierto && (
        <div className="tsl-dropdown">
          {cargando && <div className="tsl-msg">Cargando...</div>}
          {error && <div className="tsl-msg tsl-error">{error}</div>}
          {!cargando && !error && transportistas.length === 0 && (
            <div className="tsl-msg">Sin transportistas registrados</div>
          )}
          {transportistas.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tsl-item ${t.nombre === currentValue ? "tsl-item--selected" : ""}`}
              onClick={() => handleSeleccionar(t)}
            >
              {t.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

`TransportistaSelector.css`: copiar el contenido de `ClienteSelector.css` reemplazando el prefijo `csl-` por `tsl-` (mismo diseño visual, sin cambios de estilo).

---

### PASO 2.7 — `src/pages/ManiobrasPage.jsx`: Agregar columna Transportista

#### 2.7a. Import del nuevo selector

AGREGAR:
```js
import TransportistaSelector from "../components/TransportistaSelector/TransportistaSelector";
```

#### 2.7b. Agregar a `COLUMNAS`

Localizar la entrada de `destino` en el array `COLUMNAS`:
```js
{ key: "destino", label: "Destino" },
```

AGREGAR inmediatamente DESPUÉS:
```js
{ key: "transportista", label: "Transportista", isTransportista: true },
```

#### 2.7c. Lógica de render de celda

En el bloque donde se discrimina `col.isPlacas`, `col.isOperador`, etc. (en FilaNueva y ModalEditar), AGREGAR un branch nuevo:

```js
col.isTransportista → <TransportistaSelector currentValue={...} onSelect={...} disabled={false} />
```

Seguir exactamente el mismo patrón de props que usan `isOperador` / `OperadorSelector` en ese mismo archivo.

#### 2.7d. `MANIOBRA_VACIA`

AGREGAR:
```js
transportista: "",
```

---

### PASO 2.8 — `src/components/CargoSelector/CargoSelector.jsx`

Idéntico patrón a `TransportistaSelector`, apuntando a `/cargos/`. Prefijo CSS `cgs-`.

```jsx
import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../api/apiClient";
import "./CargoSelector.css";

export default function CargoSelector({ currentValue, onSelect, disabled }) {
  const [abierto, setAbierto] = useState(false);
  const [cargos, setCargos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    apiClient
      .get("/cargos/")
      .then((data) => setCargos(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => setError("Error al cargar cargos"))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const handleKey = (e) => { if (e.key === "Escape") setAbierto(false); };
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [abierto]);

  const handleSeleccionar = (c) => {
    onSelect(c.nombre);
    setAbierto(false);
  };

  return (
    <div className="cgs-wrapper" ref={ref}>
      <button type="button" className="cgs-btn" disabled={disabled} onClick={() => setAbierto((v) => !v)}>
        {currentValue || "— Seleccionar cargo —"}
      </button>
      {abierto && (
        <div className="cgs-dropdown">
          {cargando && <div className="cgs-msg">Cargando...</div>}
          {error && <div className="cgs-msg cgs-error">{error}</div>}
          {!cargando && !error && cargos.length === 0 && (
            <div className="cgs-msg">Sin cargos registrados</div>
          )}
          {cargos.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cgs-item ${c.nombre === currentValue ? "cgs-item--selected" : ""}`}
              onClick={() => handleSeleccionar(c)}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

`CargoSelector.css`: copiar `ClienteSelector.css` reemplazando `csl-` por `cgs-`.

---

### PASO 2.9 — `src/pages/CatalogosPage.jsx`: Columna Cargo en pestaña Empleados

#### 2.9a. Import

AGREGAR:
```js
import CargoSelector from "../components/CargoSelector/CargoSelector";
```

#### 2.9b. `configFormularios.empleados`

AGREGAR al final del array de `empleados`:
```js
{ key: 'cargo', label: 'Cargo', type: 'selector', selector: 'cargo' }
```

#### 2.9c. Renderizado condicional en el formulario

En el bloque del PASO 7c del plan anterior (donde se discrimina `fieldType === 'date'`), AGREGAR un branch adicional ANTES del branch de texto:

```jsx
{fieldType === 'selector' && campo.selector === 'cargo' ? (
  <CargoSelector
    currentValue={formData[fieldKey] || ''}
    onSelect={(nombre) => setFormData({ ...formData, [fieldKey]: nombre })}
    disabled={false}
  />
) : fieldType === 'date' ? (
  /* ... bloque existente de fecha ... */
) : (
  /* ... bloque existente de texto ... */
)}
```

#### 2.9d. `TRADUCCIONES_COLUMNAS`

AGREGAR:
```js
cargo: 'Cargo',
```

---

# FASE 3 — Teléfono en Empleados

---

### PASO 3.1 — SQL en pgAdmin

```sql
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS telefono VARCHAR(20) NULL;
```

**Decisión de tipo de dato:** `VARCHAR(20)`, no `IntegerField`. Un número telefónico debe almacenarse como texto porque puede incluir el símbolo `+` de código de país, ceros a la izquierda significativos en algunos formatos, y nunca se opera aritméticamente sobre él. Se deja espacio para formato internacional completo (`+52XXXXXXXXXX` cabe en 20 caracteres). Esto es lo que la petición #11 pide como "tipo de dato preparado para usarse" — un E.164 válido cabe sin truncarse.

---

### PASO 3.2 — `api/models.py`: Campo en `Empleado`

AGREGAR:
```python
telefono = models.CharField(max_length=20, null=True, blank=True)
```

---

### PASO 3.3 — Migración

```bash
python manage.py makemigrations api --name="add_telefono_empleado"
python manage.py migrate
```

---

### PASO 3.4 — `src/pages/CatalogosPage.jsx`: Campo Teléfono en formulario de Empleados

#### 3.4a. `configFormularios.empleados`

AGREGAR:
```js
{ key: 'telefono', label: 'Teléfono', type: 'tel' }
```

#### 3.4b. Renderizado condicional

AGREGAR un branch para `fieldType === 'tel'` en el mismo bloque condicional del PASO 2.9c, ANTES del branch de texto genérico:

```jsx
{fieldType === 'tel' ? (
  <input
    type="tel"
    className={/* misma clase CSS existente */}
    value={formData[fieldKey] || ''}
    onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
    placeholder="+52XXXXXXXXXX"
    pattern="^\+?[0-9]{10,15}$"
  />
) : (
  /* resto de branches existentes */
)}
```

#### 3.4c. `TRADUCCIONES_COLUMNAS`

AGREGAR:
```js
telefono: 'Teléfono',
```

---

# FASE 4 — Tag en Tractos, Ruta Inicio/Fin en Maniobras

---

### PASO 4.1 — SQL en pgAdmin

```sql
ALTER TABLE tractos  ADD COLUMN IF NOT EXISTS tag VARCHAR(100) NULL;
ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS ruta_inicio TIMESTAMP NULL;
ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS ruta_fin    TIMESTAMP NULL;
```

---

### PASO 4.2 — `api/models.py`

#### 4.2a. En `Tracto`, AGREGAR (cualquier posición en el bloque de campos; el orden visual en UI lo controla el frontend):

```python
tag = models.CharField(max_length=100, null=True, blank=True)
```

#### 4.2b. En `Maniobra`, después de `ccp`, AGREGAR:

```python
ruta_inicio = models.DateTimeField(null=True, blank=True)
ruta_fin    = models.DateTimeField(null=True, blank=True)
```

---

### PASO 4.3 — Migración

```bash
python manage.py makemigrations api --name="add_tag_tracto_ruta_inicio_fin_maniobra"
python manage.py migrate
```

---

### PASO 4.4 — `src/pages/CatalogosPage.jsx`: Columna Tag en Tractos

#### 4.4a. `configFormularios.tractos`

Localizar el array actual:
```js
tractos: [no_eco, unidad, anio, placas, tipo]
```

REEMPLAZAR por (insertando `tag` entre `no_eco` y `unidad`):
```js
tractos: [
  { key: 'no_eco', label: 'No. Eco', type: 'text' },
  { key: 'tag',    label: 'Tag',     type: 'text' },
  { key: 'unidad', label: 'Unidad',  type: 'text' },
  { key: 'anio',   label: 'Año',     type: 'text' },
  { key: 'placas', label: 'Placas',  type: 'text' },
  { key: 'tipo',   label: 'Tipo',    type: 'text' },
]
```

**Importante:** verificar el formato real de los campos existentes en `configFormularios.tractos` antes de reemplazar — si actualmente son strings simples (`'no_eco'`) en vez de objetos, mantener el mismo formato simple e insertar `'tag'` en la posición 2 del array (índice 1), sin convertir a objetos los demás campos. Solo es obligatorio usar objeto si se requiere `type` distinto a texto; aquí `tag` es texto simple, así que puede integrarse como string si el resto del array lo es.

#### 4.4b. `TRADUCCIONES_COLUMNAS`

AGREGAR:
```js
tag: 'Tag',
```

#### 4.4c. Posición de columna en la tabla de catálogos

Si `CatalogosPage` también define un array de columnas visibles para la tabla (separado de `configFormularios`), localizarlo y AGREGAR `tag` entre `no_eco` y `unidad` siguiendo el mismo criterio que el formulario.

---

### PASO 4.5 — `src/pages/ManiobrasPage.jsx`: Columnas Ruta Inicio / Ruta Fin

#### 4.5a. Crear selector de hora

No existe actualmente un selector de hora en el proyecto. `react-datepicker` (ya en dependencias) soporta selección de hora vía props `showTimeSelect` y `showTimeSelectOnly`. Se usará directamente sin crear un componente nuevo — dos instancias de `<DatePicker>` por celda: una para fecha, otra para hora, combinadas en un solo valor `DateTime`.

**Decisión de UX:** para minimizar fricción, se usa UN SOLO `DatePicker` con `showTimeSelect` (selecciona fecha y hora en el mismo calendario desplegable), no dos botones separados. Esto es el patrón estándar de `react-datepicker` y reduce significativamente la complejidad de implementación frente a sincronizar dos pickers independientes.

#### 4.5b. Agregar a `COLUMNAS`

Al final del array `COLUMNAS`, después de la entrada de `ccp`:

```js
{ key: "ruta_inicio", label: "Ruta Inicio", isFechaHora: true },
{ key: "ruta_fin",    label: "Ruta Fin",    isFechaHora: true },
```

#### 4.5c. Lógica de render de celda (FilaNueva, filas existentes, ModalEditar)

AGREGAR un branch nuevo en la discriminación de columnas:

```jsx
{col.isFechaHora ? (
  <DatePicker
    selected={datos[col.key] ? new Date(datos[col.key]) : null}
    onChange={(date) => actualizarCampo(col.key, date ? date.toISOString() : null)}
    showTimeSelect
    timeFormat="HH:mm"
    timeIntervals={15}
    dateFormat="dd/MM/yyyy HH:mm"
    locale="es"
    placeholderText="dd/MM/yyyy HH:mm"
    className="(misma clase que usan los DatePicker existentes en este archivo)"
    isClearable
  />
) : (
  /* resto de branches existentes sin cambio */
)}
```

Para filas existentes con PATCH directo (igual que el resto de selectores en filas existentes), el `onChange` debe llamar al PATCH del registro en lugar de `actualizarCampo` de estado local, siguiendo el mismo patrón que usan `fecha_pis` y `fecha_entrega_mercancia` en ese mismo archivo.

#### 4.5d. `MANIOBRA_VACIA`

AGREGAR:
```js
ruta_inicio: null,
ruta_fin:    null,
```

---

# FASE 5 — Alertas: intermitencia sutil + umbrales separados

---

### PASO 5.1 — `api/views.py`: Separar umbrales en `AlertasVencimientoView`

Localizar la clase `AlertasVencimientoView`. REEMPLAZAR el cuerpo del método `get` completo con la siguiente versión (que usa dos umbrales distintos):

```python
def get(self, request):
    from datetime import timedelta
    hoy = date.today()

    UMBRAL_LICENCIA_DIAS = 30   # 1 mes
    UMBRAL_POLIZA_DIAS   = 14   # 2 semanas

    limite_licencia = hoy + timedelta(days=UMBRAL_LICENCIA_DIAS)
    limite_poliza    = hoy + timedelta(days=UMBRAL_POLIZA_DIAS)

    choferes_por_vencer = Chofer.objects.filter(
        fecha_vencimiento_licencia__isnull=False,
        fecha_vencimiento_licencia__gte=hoy,
        fecha_vencimiento_licencia__lte=limite_licencia,
    ).values('nombre', 'fecha_vencimiento_licencia')

    tractos_por_vencer = Tracto.objects.filter(
        fecha_vencimiento_poliza__isnull=False,
        fecha_vencimiento_poliza__gte=hoy,
        fecha_vencimiento_poliza__lte=limite_poliza,
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

    alertas.sort(key=lambda a: a['fecha_raw'])

    return Response(alertas)
```

**Único cambio respecto a la versión anterior:** se reemplaza la única variable `en_30_dias` compartida por dos variables `limite_licencia` (30 días) y `limite_poliza` (14 días), cada una aplicada a su filtro correspondiente. El resto de la lógica (orden, formato de salida) es idéntico.

---

### PASO 5.2 — `src/components/AlertaVencimiento/AlertaVencimiento.css`: Parpadeo sutil

REEMPLAZAR la regla `.av-urgente` existente:

```css
.av-urgente {
  color: #dc2626;
  font-weight: 700;
  font-size: 1rem;
  margin: 0 0 6px 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  animation: av-parpadeo 2.4s ease-in-out infinite;
}

@keyframes av-parpadeo {
  0%, 100% { opacity: 1;    }
  50%      { opacity: 0.45; }
}
```

**Justificación del valor elegido:** 2.4 segundos de ciclo con un mínimo de opacidad de 0.45 (nunca llega a 0, nunca desaparece del todo) y `ease-in-out` (transición suave, no abrupta) evita el efecto de parpadeo agresivo tipo "luz de emergencia" que puede ser problemático para fotosensibilidad. Las guías de accesibilidad WCAG 2.1 recomiendan evitar parpadeos de más de 3 veces por segundo; a 2.4s de ciclo completo este efecto está muy por debajo de ese umbral.

---

# FASE 6 — Bloqueo de operador con licencia vencida

---

## Backend

### PASO 6.1 — `api/views.py`: Endpoint de choferes con info de vencimiento

#### 6.1a. Verificar/extender `ChoferViewSet`

Localizar `ChoferViewSet`. El listado de choferes ya se consume desde `OperadorSelector` vía `GET /choferes/`. El frontend necesita saber, por cada chofer, si su licencia está vencida. Esto YA está disponible porque `ChoferSerializer` usa `fields = '__all__'`, que incluye `fecha_vencimiento_licencia`. **No se requiere ningún cambio en el backend de listado** — el frontend calculará si está vencida comparando esa fecha con `hoy` en el cliente.

#### 6.1b. Validación de integridad en el backend (capa de seguridad real)

El problema de validar "operador vigente" en el backend es que el campo `asignacion_operador_status` en `Maniobra` (y los campos equivalentes `operador` en `Vacio` y `MovimientoLocal`) son `CharField` de texto libre que almacenan el NOMBRE del chofer, no una FK. Esto significa que la validación debe hacerse por nombre, comparando contra la tabla `Chofer`.

AGREGAR el siguiente método de validación reutilizable como función de módulo en `api/views.py`, ANTES de las clases de ViewSets (junto a `_concat_placas_remolques`):

```python
def _validar_operador_vigente(nombre_operador):
    """
    Verifica que el operador (por nombre) no tenga licencia vencida.
    Devuelve (es_valido: bool, mensaje_error: str | None).
    Si el nombre no coincide con ningún chofer registrado, se permite
    (no se bloquea por datos no encontrados — solo se bloquea si SÍ
    se encuentra el chofer Y su licencia está vencida).
    """
    if not nombre_operador:
        return True, None

    chofer = Chofer.objects.filter(nombre=nombre_operador).first()
    if not chofer:
        return True, None

    if chofer.fecha_vencimiento_licencia and chofer.fecha_vencimiento_licencia < date.today():
        return False, (
            f"No se puede asignar a {nombre_operador}: "
            f"su licencia venció el {chofer.fecha_vencimiento_licencia.strftime('%d/%m/%Y')}."
        )

    return True, None
```

#### 6.1c. Aplicar la validación en `ManiobraViewSet`

Localizar la clase `ManiobraViewSet`. AGREGAR los métodos `create` y `update` (si no existen ya overrides de esos métodos; si ya existen, AGREGAR la validación al inicio del método existente en lugar de duplicar):

```python
def create(self, request, *args, **kwargs):
    operador = request.data.get('asignacion_operador_status', '')
    es_valido, mensaje = _validar_operador_vigente(operador)
    if not es_valido:
        return Response({'detail': mensaje}, status=400)
    return super().create(request, *args, **kwargs)

def update(self, request, *args, **kwargs):
    operador = request.data.get('asignacion_operador_status', None)
    if operador is not None:
        es_valido, mensaje = _validar_operador_vigente(operador)
        if not es_valido:
            return Response({'detail': mensaje}, status=400)
    return super().update(request, *args, **kwargs)
```

**Nota crítica:** `update` cubre tanto PUT como PATCH en DRF (`partial_update` llama internamente a `update` con `partial=True`). No es necesario sobreescribir `partial_update` por separado.

#### 6.1d. Aplicar la misma validación en `VacioViewSet`

Mismo patrón, usando el campo `operador` (no `asignacion_operador_status`):

```python
def create(self, request, *args, **kwargs):
    operador = request.data.get('operador', '')
    es_valido, mensaje = _validar_operador_vigente(operador)
    if not es_valido:
        return Response({'detail': mensaje}, status=400)
    return super().create(request, *args, **kwargs)

def update(self, request, *args, **kwargs):
    operador = request.data.get('operador', None)
    if operador is not None:
        es_valido, mensaje = _validar_operador_vigente(operador)
        if not es_valido:
            return Response({'detail': mensaje}, status=400)
    return super().update(request, *args, **kwargs)
```

#### 6.1e. Aplicar la misma validación en `MovimientoLocalViewSet`

Mismo patrón, usando el campo `operador`:

```python
def create(self, request, *args, **kwargs):
    operador = request.data.get('operador', '')
    es_valido, mensaje = _validar_operador_vigente(operador)
    if not es_valido:
        return Response({'detail': mensaje}, status=400)
    return super().create(request, *args, **kwargs)

def update(self, request, *args, **kwargs):
    operador = request.data.get('operador', None)
    if operador is not None:
        es_valido, mensaje = _validar_operador_vigente(operador)
        if not es_valido:
            return Response({'detail': mensaje}, status=400)
    return super().update(request, *args, **kwargs)
```

**Nota:** los documentos de viaje (`DocumentoBitacoraSuenoView`, `DocumentoCtaPortView`) usan el campo `operador` del formulario solo para imprimir el PDF, no para persistir un registro de asignación operativa nueva — no requieren esta validación porque no crean ni actualizan un registro de Maniobra/Vacio/MovimientoLocal; solo generan un documento de salida. Si en el futuro se requiere bloquear también la generación de documentos, se replicaría el mismo patrón ahí.

#### 6.1f. Verificar import de `Chofer` en `views.py`

Si `Chofer` no está ya importado (lo estará, porque `ChoferViewSet` ya existe), no se requiere cambio.

---

## Frontend

### PASO 6.2 — `src/components/OperadorSelector/OperadorSelector.jsx`: Filtrar/deshabilitar choferes vencidos

Localizar el componente `OperadorSelector.jsx`. Se modifican 3 partes:

#### 6.2a. Calcular vigencia al recibir los datos

Localizar el `useEffect` que hace `apiClient.get("/choferes/")`. REEMPLAZAR el `.then(...)` para anotar cada chofer con su estado de vigencia:

```js
.then((data) => {
  const lista = Array.isArray(data) ? data : (data?.results || []);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const conVigencia = lista.map((chofer) => {
    let vencida = false;
    if (chofer.fecha_vencimiento_licencia) {
      const fechaVenc = new Date(chofer.fecha_vencimiento_licencia + "T00:00:00");
      vencida = fechaVenc < hoy;
    }
    return { ...chofer, licenciaVencida: vencida };
  });

  setOperadores(conVigencia);
})
```

(Ajustar el nombre de la variable de estado `operadores` al nombre real usado en el componente si difiere.)

#### 6.2b. Deshabilitar visualmente la opción en el dropdown

Localizar donde se renderiza cada chofer como botón/opción dentro del dropdown. AGREGAR la condición de deshabilitado y un indicador visual:

```jsx
<button
  key={chofer.id}
  type="button"
  className={`(clases existentes) ${chofer.licenciaVencida ? "operador-item--vencido" : ""}`}
  disabled={chofer.licenciaVencida}
  onClick={() => !chofer.licenciaVencida && handleSeleccionar(chofer)}
  title={chofer.licenciaVencida ? "Licencia vencida — no se puede asignar" : ""}
>
  {chofer.nombre}
  {chofer.licenciaVencida && <span className="operador-item__badge"> (Licencia vencida)</span>}
</button>
```

#### 6.2c. Estilos para el estado deshabilitado

En el archivo CSS correspondiente (`OperadorSelector.css`), AGREGAR:

```css
.operador-item--vencido {
  opacity: 0.5;
  cursor: not-allowed;
  text-decoration: line-through;
}
.operador-item__badge {
  color: #dc2626;
  font-size: 0.7rem;
  font-weight: 600;
  text-decoration: none;
}
```

(Ajustar nombre de clase base si difiere del usado realmente en el componente — revisar el archivo antes de aplicar.)

---

### PASO 6.3 — Manejo de error 400 en los formularios que usan `OperadorSelector`

Como capa de seguridad adicional, si por cualquier motivo el frontend permite enviar un operador vencido (ej. condición de carrera, datos cacheados), el backend rechazará con 400 y el mensaje descriptivo del PASO 6.1b. Verificar que los `catch` de las llamadas `apiClient.post` / `apiClient.patch` en `ManiobrasPage.jsx`, `VaciosPage.jsx` y `MovimientosLocalesPage.jsx` ya muestren el mensaje de error del backend (`err.message` o `err.detail`) en la notificación de error existente. Si actualmente muestran un mensaje genérico fijo, AJUSTAR para que muestren el mensaje específico devuelto por el backend cuando esté disponible, siguiendo el patrón ya usado en `apiClient.download` (que extrae `err.detail` del JSON de respuesta).

---

## RESUMEN GENERAL DE ARCHIVOS AFECTADOS (TODAS LAS FASES)

### Archivos nuevos
```
src/components/TransportistaSelector/TransportistaSelector.jsx
src/components/TransportistaSelector/TransportistaSelector.css
src/components/CargoSelector/CargoSelector.jsx
src/components/CargoSelector/CargoSelector.css
```

### Archivos modificados
```
api/models.py        ← Transportista, Cargo, +transportista(Maniobra), +cargo(Empleado),
                        +telefono(Empleado), +tag(Tracto), +ruta_inicio/+ruta_fin(Maniobra)
api/Serializers.py    ← TransportistaSerializer, CargoSerializer
api/views.py          ← TransportistaViewSet, CargoViewSet, _validar_operador_vigente,
                         create/update overrides en ManiobraViewSet/VacioViewSet/MovimientoLocalViewSet,
                         AlertasVencimientoView con umbrales separados
api/urls.py           ← transportistas, cargos
src/pages/CatalogosPage.jsx       ← pestañas transportistas/cargos, columna tag en tractos,
                                     columna cargo y telefono en empleados
src/pages/ManiobrasPage.jsx       ← columna transportista, columnas ruta_inicio/ruta_fin
src/components/OperadorSelector/OperadorSelector.jsx  ← bloqueo visual de licencia vencida
src/components/OperadorSelector/OperadorSelector.css  ← estilos de estado vencido
src/components/AlertaVencimiento/AlertaVencimiento.css ← animación de parpadeo sutil
```

### SQL adicional (pgAdmin)
```sql
ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS transportista VARCHAR(255) NULL;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS cargo         VARCHAR(255) NULL;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS telefono      VARCHAR(20)  NULL;
ALTER TABLE tractos   ADD COLUMN IF NOT EXISTS tag           VARCHAR(100) NULL;
ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS ruta_inicio   TIMESTAMP    NULL;
ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS ruta_fin      TIMESTAMP    NULL;
```

---

## NOTAS CRÍTICAS PARA CLAUDE CODE

### Sobre el orden de ejecución entre fases
Respetar estrictamente: Fase 1 antes que Fase 2 (Transportistas/Cargos deben existir como tablas antes de que el selector pueda apuntar a ellas). Fases 3, 4 y 5 son independientes entre sí y pueden ejecutarse en cualquier orden relativo. Fase 6 depende de que `fecha_vencimiento_licencia` ya exista en `Chofer` (ya implementado en el plan anterior, PLAN_FECHAS_VENCIMIENTO_Y_ALERTAS.md).

### Sobre la validación de operador por nombre, no por FK
Toda la arquitectura actual usa `CharField` de texto libre para representar al operador en Maniobra/Vacio/MovimientoLocal, en lugar de una ForeignKey a `Chofer`. La validación del PASO 6.1b funciona por coincidencia exacta de `nombre`. Si dos choferes tienen el mismo nombre exacto, la validación tomará el primero que encuentre (`.first()`). Esto es una limitación inherente al diseño de datos actual, no un bug del plan — migrar a FK sería un cambio de arquitectura mucho mayor, fuera de alcance de esta petición.

### Sobre por qué no se bloquea a nivel de Serializer
Se eligió sobreescribir `create`/`update` del ViewSet en lugar de añadir un `validate_asignacion_operador_status` al Serializer porque el Serializer no tiene acceso directo y limpio al modelo `Chofer` sin un acoplamiento cruzado innecesario, y porque el mensaje de error de negocio ("licencia vencida") es más apropiado como respuesta HTTP 400 explícita del ViewSet que como `ValidationError` de campo individual.

### Sobre registros existentes con operador ya vencido
Conforme a lo confirmado: si un operador con licencia ya vencida está asignado a un registro existente, ESE registro no se toca ni se bloquea — solo se bloquea la asignación en operaciones `create`/`update` nuevas. Un PATCH que NO modifique el campo del operador (por ejemplo, actualizar solo el status de una maniobra) no dispara la validación porque el método `update` solo valida cuando `operador is not None` en el payload recibido.

### Sobre el DatePicker de Ruta Inicio/Fin
Se reutiliza `react-datepicker` ya presente en dependencias, evitando agregar una librería nueva solo para selección de hora. `showTimeSelect` + `timeFormat="HH:mm"` cubre el requerimiento sin componente adicional.

### Sobre RLS y migraciones data (RunPython)
Las políticas RLS del PASO 1.6 deben ejecutarse DESPUÉS de `migrate`, porque las tablas `api_transportista` y `api_cargo` no existen hasta que la migración corre. El dato semilla "FRABA CONTAINER" se inserta vía `RunPython` dentro de la misma migración, lo cual es ejecutado por el rol de conexión de Django configurado para migraciones (normalmente el rol admin/superuser), por lo que no es bloqueado por RLS aunque ya esté habilitado en una corrida posterior.
