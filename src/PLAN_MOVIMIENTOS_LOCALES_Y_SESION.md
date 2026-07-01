# PLAN — Movimientos Locales + Gestión de Sesión por Inactividad

## Decisiones de diseño

### Movimientos Locales
- Inline editing de texto: click en celda → input con autoFocus → blur/Enter → PATCH → vuelve a texto.
- Escape en inline input → cancela sin guardar.
- Selectores en filas existentes (Fecha, Operador, Unidad, Status) → PATCH directo con optimistic update.
- Fila nueva: igual que el resto de páginas (FilaNueva al final de la tabla).
- ModalEditar disponible (botón Editar) para editar todos los campos a la vez.
- Fila con status `pagado` → fondo #b6d7a8.
- Fila con status `pendiente` → sin color.
- Filtros: Todos | Pendiente | Pagado (param `?status=` al backend).
- SearchBar: busca en `operador`, `movimiento`, `unidad`, `contenedor`.
- Eliminar: solo admin.
- PAGE_SIZE=60, infinite scroll via window scroll.

### Sesión por inactividad
- Eventos que cuentan como actividad: `mousemove`, `keydown`, `scroll`, `touchstart`. NO `click` ni `mousedown`.
- Timer empieza desde el último evento de actividad.
- A los 10 min de inactividad: modal de aviso "Tu sesión se cerrará si sigues inactivo" + botón Aceptar.
  - Aceptar solo cierra el modal. El timer NO se reinicia (Option B).
  - Si el usuario mueve el mouse/tecla/scroll DESPUÉS de cerrar el modal → timer sí se reinicia.
- A los 20 min de inactividad (acumulados, no reiniciados por Aceptar): forzar logout → modal "Tu sesión se cerrará por inactividad" + botón Aceptar → al hacer click: logout + navigate('/login').
- Token storage: cambiar de localStorage a sessionStorage → tokens desaparecen al cerrar el navegador/pestaña; sobreviven refresh de página.
- JWT lifetimes en Django: ACCESS=12h, REFRESH=12h → evita que el token expire durante una jornada normal.

---

## FEATURE 1: MOVIMIENTOS LOCALES

---

### PASO 1 — `api/models.py`: Agregar modelo `MovimientoLocal`

Al final del archivo, después del último modelo existente, AGREGAR:

```python
class MovimientoLocal(models.Model):
    PENDIENTE = 'pendiente'
    PAGADO    = 'pagado'
    STATUS_CHOICES = [
        (PENDIENTE, 'Pendiente'),
        (PAGADO,    'Pagado'),
    ]

    fecha      = models.DateField(null=True, blank=True)
    operador   = models.CharField(max_length=255, null=True, blank=True)
    movimiento = models.CharField(max_length=500, null=True, blank=True)
    unidad     = models.CharField(max_length=255, null=True, blank=True)
    contenedor = models.CharField(max_length=255, null=True, blank=True)
    status     = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=PENDIENTE,
        db_index=True,
    )

    class Meta:
        managed  = True
        ordering = ['-id']
```

---

### PASO 2 — `api/Serializers.py`: Agregar `MovimientoLocalSerializer`

Al final del archivo, después del último serializer existente, AGREGAR:

```python
class MovimientoLocalSerializer(serializers.ModelSerializer):
    class Meta:
        model  = MovimientoLocal
        fields = '__all__'
```

Verificar que `MovimientoLocal` esté importado desde `.models` (si el archivo usa imports explícitos). Si usa `from .models import *` o importa el módulo entero, no hace falta cambio.

---

### PASO 3 — `api/views.py`: Agregar `MovimientoLocalViewSet`

#### 3a. Verificar imports necesarios

Asegurarse de que los siguientes imports ya existan en `views.py`. Si faltan, AGREGAR a la sección de imports:

```python
from rest_framework import filters
from django_filters.rest_framework import DjangoFilterBackend
```

#### 3b. Agregar el ViewSet

Al final del archivo, antes de las vistas `DocumentoBitacoraSuenoView`, `DocumentoCtaPortView` y `DocumentoBitacoraGastosView` (o después, no importa el orden), AGREGAR:

```python
class MovimientoLocalViewSet(viewsets.ModelViewSet):
    queryset               = MovimientoLocal.objects.all()
    serializer_class       = MovimientoLocalSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    throttle_classes       = [UserRateThrottle, AnonRateThrottle]
    filter_backends        = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields       = ['status']
    search_fields          = ['operador', 'movimiento', 'unidad', 'contenedor']
    ordering_fields        = ['fecha', 'id']

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response(
                {'detail': 'No tienes permisos para eliminar registros.'},
                status=403,
            )
        return super().destroy(request, *args, **kwargs)
```

Verificar que `MovimientoLocal` y `MovimientoLocalSerializer` estén importados en `views.py`. Agregar si faltan:

```python
from .models import MovimientoLocal          # si el archivo importa modelos explícitamente
from .Serializers import MovimientoLocalSerializer  # idem
```

---

### PASO 4 — `api/urls.py`: Registrar el nuevo ViewSet

En la sección de imports, AGREGAR `MovimientoLocalViewSet`:

```python
from .views import (
    # ... todos los existentes ...
    MovimientoLocalViewSet,   # ← AGREGAR
)
```

En el bloque `router.register(...)`, AGREGAR:

```python
router.register(r'movimientos-locales', MovimientoLocalViewSet, basename='movimientos-locales')
```

---

### PASO 5 — Ejecutar migración

```bash
python manage.py makemigrations api --name="add_movimiento_local"
python manage.py migrate
```

Verificar que la migración corra sin errores.

---

### PASO 6 — SQL en pgAdmin: RLS para la nueva tabla

Ejecutar en pgAdmin DESPUÉS de la migración (la migración crea la tabla; este SQL habilita RLS):

```sql
-- Habilitar RLS en la nueva tabla
ALTER TABLE api_movimientolocal ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_movimientolocal FORCE ROW LEVEL SECURITY;

-- Permisos para el rol estándar (SELECT, INSERT, UPDATE — sin DELETE, igual que las demás tablas)
GRANT SELECT, INSERT, UPDATE ON api_movimientolocal TO django_standard_role;

-- Política de acceso para el rol estándar
CREATE POLICY standard_ml_access ON api_movimientolocal
    FOR ALL
    TO django_standard_role
    USING (true)
    WITH CHECK (true);
```

---

### PASO 7 — Crear `src/hooks/useMovimientosLocales.js`

Crear el archivo con el siguiente contenido:

```js
import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "../api/apiClient";

const PAGE_SIZE = 60;

export function useMovimientosLocales() {
  const [movimientos,   setMovimientos]   = useState([]);
  const [cargando,      setCargando]      = useState(false);
  const [hayMas,        setHayMas]        = useState(true);
  const [pagina,        setPagina]        = useState(1);
  const [notif,         setNotif]         = useState(null);
  const notifTimer = useRef(null);

  const mostrarNotif = useCallback((msg, tipo = "exito") => {
    clearTimeout(notifTimer.current);
    setNotif({ msg, tipo });
    notifTimer.current = setTimeout(() => setNotif(null), 3000);
  }, []);

  // ── Fetch con filtro de status y búsqueda ─────────────────────────────────
  const fetchMovimientos = useCallback(
    async ({ reset = false, status = "todos", search = "" } = {}) => {
      if (cargando) return;
      const paginaActual = reset ? 1 : pagina;
      setCargando(true);
      try {
        const params = new URLSearchParams();
        params.set("page",      paginaActual);
        params.set("page_size", PAGE_SIZE);
        if (status && status !== "todos") params.set("status", status);
        if (search.trim()) params.set("search", search.trim());

        const data = await apiClient.get(`/movimientos-locales/?${params.toString()}`);

        const resultados = Array.isArray(data) ? data : (data?.results ?? []);
        const total      = data?.count ?? resultados.length;

        if (reset) {
          setMovimientos(resultados);
          setPagina(2);
        } else {
          setMovimientos((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            return [...prev, ...resultados.filter((m) => !ids.has(m.id))];
          });
          setPagina((p) => p + 1);
        }
        setHayMas(resultados.length === PAGE_SIZE && movimientos.length + resultados.length < total);
      } catch {
        mostrarNotif("Error al cargar movimientos.", "error");
      } finally {
        setCargando(false);
      }
    },
    [cargando, pagina, movimientos.length, mostrarNotif]
  );

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const agregar = useCallback(
    async (datos) => {
      try {
        const nuevo = await apiClient.post("/movimientos-locales/", datos);
        setMovimientos((prev) => [nuevo, ...prev]);
        mostrarNotif("Movimiento agregado.");
        return nuevo;
      } catch {
        mostrarNotif("Error al agregar movimiento.", "error");
        return null;
      }
    },
    [mostrarNotif]
  );

  const actualizar = useCallback(
    async (id, cambios) => {
      try {
        const actualizado = await apiClient.patch(`/movimientos-locales/${id}/`, cambios);
        setMovimientos((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...actualizado } : m))
        );
        mostrarNotif("Movimiento actualizado.");
        return actualizado;
      } catch {
        mostrarNotif("Error al actualizar movimiento.", "error");
        return null;
      }
    },
    [mostrarNotif]
  );

  const eliminar = useCallback(
    async (id) => {
      try {
        await apiClient.delete(`/movimientos-locales/${id}/`);
        setMovimientos((prev) => prev.filter((m) => m.id !== id));
        mostrarNotif("Movimiento eliminado.");
      } catch {
        mostrarNotif("Error al eliminar movimiento.", "error");
      }
    },
    [mostrarNotif]
  );

  useEffect(() => () => clearTimeout(notifTimer.current), []);

  return {
    movimientos,
    cargando,
    hayMas,
    fetchMovimientos,
    agregar,
    actualizar,
    eliminar,
    notif,
  };
}
```

---

### PASO 8 — Crear `src/components/PendientePagadoSelector/PendientePagadoSelector.jsx`

```jsx
import { useState, useEffect, useRef } from "react";
import "./PendientePagadoSelector.css";

const OPCIONES = [
  { value: "pendiente", label: "Pendiente" },
  { value: "pagado",    label: "Pagado"    },
];

/**
 * PendientePagadoSelector
 * Selector de dos estados: pendiente / pagado.
 * Hace PATCH directo al seleccionar (igual que otros selectores inline).
 *
 * Props:
 *   currentStatus  'pendiente' | 'pagado'
 *   onSelect       function(nuevoStatus: string)
 *   loading        boolean
 */
export default function PendientePagadoSelector({ currentStatus, onSelect, loading }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const handleKey   = (e) => { if (e.key === "Escape") setAbierto(false); };
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("keydown",   handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown",   handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [abierto]);

  const handleSelect = (value) => {
    onSelect(value);
    setAbierto(false);
  };

  const label = OPCIONES.find((o) => o.value === currentStatus)?.label ?? "—";

  return (
    <div className="pps-wrapper" ref={ref}>
      <button
        type="button"
        className={`pps-btn pps-btn--${currentStatus ?? "pendiente"}`}
        onClick={() => setAbierto((v) => !v)}
        disabled={loading}
      >
        {loading ? "..." : label}
      </button>

      {abierto && (
        <div className="pps-dropdown">
          {OPCIONES.map((op) => (
            <button
              key={op.value}
              type="button"
              className={`pps-item pps-item--${op.value} ${op.value === currentStatus ? "pps-item--selected" : ""}`}
              onClick={() => handleSelect(op.value)}
            >
              {op.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### PASO 9 — Crear `src/components/PendientePagadoSelector/PendientePagadoSelector.css`

```css
.pps-wrapper {
  position: relative;
  display: inline-block;
}

.pps-btn {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s;
  white-space: nowrap;
}
.pps-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pps-btn--pendiente { background: #fef3c7; color: #92400e; }
.pps-btn--pagado    { background: #b6d7a8; color: #166534; }

.pps-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  overflow: hidden;
  min-width: 110px;
}

.pps-item {
  display: block;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  transition: background 0.1s;
}
.pps-item:hover         { background: #f3f4f6; }
.pps-item--selected     { font-weight: 700; }
.pps-item--pendiente    { color: #92400e; }
.pps-item--pagado       { color: #166534; }
```

---

### PASO 10 — Crear `src/pages/MovimientosLocalesPage.jsx`

```jsx
import { useState, useEffect, useCallback, useRef } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import { es } from "date-fns/locale";
import { format, parseISO } from "date-fns";
import { Truck, Trash2, SquarePen } from "lucide-react";
import { useAuthContext } from "../context/AuthContext";
import { useMovimientosLocales } from "../hooks/useMovimientosLocales";
import SearchBar from "../components/SearchBar/SearchBar";
import OperadorSelector from "../components/OperadorSelector/OperadorSelector";
import PlacasSelector from "../components/PlacasSelector/PlacasSelector";
import PendientePagadoSelector from "../components/PendientePagadoSelector/PendientePagadoSelector";
import "react-datepicker/dist/react-datepicker.css";
import "./MovimientosLocalesPage.css";

registerLocale("es", es);

// ── Constantes ───────────────────────────────────────────────────────────────

const COLUMNAS = [
  { key: "fecha",      label: "Fecha",             isFecha:        true },
  { key: "operador",   label: "Operador",          isOperador:     true },
  { key: "movimiento", label: "Movimiento",        isTextoInline:  true },
  { key: "unidad",     label: "Unidad",            isPlacas:       true },
  { key: "contenedor", label: "Contenedor",        isTextoInline:  true },
  { key: "status",     label: "Pendiente/Pagado",  isStatus:       true },
];

const ML_VACIO = {
  fecha:      "",
  operador:   "",
  movimiento: "",
  unidad:     "",
  contenedor: "",
  status:     "pendiente",
};

const MODAL_CERRADO = { abierto: false, datos: null };

const FILTROS_STATUS = ["todos", "pendiente", "pagado"];

// ── Utilidades ───────────────────────────────────────────────────────────────

const parsearFecha = (valor) => {
  if (!valor) return null;
  try { return parseISO(valor); } catch { return null; }
};

const formatearFecha = (date) =>
  date ? format(date, "yyyy-MM-dd") : "";

// ── Componente principal ─────────────────────────────────────────────────────

export default function MovimientosLocalesPage() {
  const { user } = useAuthContext();
  const isAdmin   = user?.role === "admin" || user?.is_staff;

  const {
    movimientos,
    cargando,
    hayMas,
    fetchMovimientos,
    agregar,
    actualizar,
    eliminar,
    notif,
  } = useMovimientosLocales();

  // ── Filtros y búsqueda ────────────────────────────────────────────────────
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busqueda,     setBusqueda]     = useState("");
  const busquedaRef = useRef(busqueda);
  busquedaRef.current = busqueda;

  // Carga inicial y cuando cambian filtros
  useEffect(() => {
    fetchMovimientos({ reset: true, status: filtroStatus, search: busqueda });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus]);

  // Búsqueda con debounce
  useEffect(() => {
    const t = setTimeout(() => {
      fetchMovimientos({ reset: true, status: filtroStatus, search: busqueda });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  // Infinite scroll
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      requestAnimationFrame(() => {
        const cerca = window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;
        if (cerca && !cargando && hayMas) {
          fetchMovimientos({ status: filtroStatus, search: busquedaRef.current });
        }
        ticking = false;
      });
      ticking = true;
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [cargando, hayMas, filtroStatus, fetchMovimientos]);

  // ── Estado de la fila nueva ───────────────────────────────────────────────
  const [filaNueva, setFilaNueva]   = useState(null);
  const [guardando, setGuardando]   = useState(false);

  const abrirFilaNueva = () => setFilaNueva({ ...ML_VACIO });

  const cancelarFilaNueva = () => setFilaNueva(null);

  const actualizarFilaNueva = (key, value) =>
    setFilaNueva((p) => ({ ...p, [key]: value }));

  const guardarFilaNueva = async () => {
    setGuardando(true);
    await agregar(filaNueva);
    setFilaNueva(null);
    setGuardando(false);
  };

  // ── Modal editar ──────────────────────────────────────────────────────────
  const [modal, setModal] = useState(MODAL_CERRADO);

  const abrirModal = (mov) => setModal({ abierto: true, datos: { ...mov } });

  const cerrarModal = () => setModal(MODAL_CERRADO);

  const actualizarModal = (key, value) =>
    setModal((p) => ({ ...p, datos: { ...p.datos, [key]: value } }));

  const guardarModal = async () => {
    setGuardando(true);
    await actualizar(modal.datos.id, modal.datos);
    cerrarModal();
    setGuardando(false);
  };

  useEffect(() => {
    if (!modal.abierto) return;
    const h = (e) => { if (e.key === "Escape") cerrarModal(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [modal.abierto]);

  // ── Edición inline de texto ───────────────────────────────────────────────
  const [editandoCelda, setEditandoCelda] = useState(null); // { id, key }
  const [valorEditando, setValorEditando] = useState("");

  const iniciarEdicion = (id, key, valorActual) => {
    setEditandoCelda({ id, key });
    setValorEditando(valorActual ?? "");
  };

  const cancelarEdicion = () => setEditandoCelda(null);

  const confirmarEdicion = useCallback(
    async (id, key) => {
      const movOriginal = movimientos.find((m) => m.id === id);
      if (movOriginal && valorEditando !== (movOriginal[key] ?? "")) {
        await actualizar(id, { [key]: valorEditando });
      }
      setEditandoCelda(null);
    },
    [valorEditando, movimientos, actualizar]
  );

  // ── Render de celda en fila nueva ─────────────────────────────────────────
  const renderCeldaFilaNueva = (col) => {
    const val = filaNueva[col.key];

    if (col.isFecha) {
      return (
        <DatePicker
          selected={val ? parsearFecha(val) : null}
          onChange={(d) => actualizarFilaNueva(col.key, formatearFecha(d))}
          locale="es"
          dateFormat="dd/MM/yyyy"
          placeholderText="dd/MM/yyyy"
          className="ml-input"
          isClearable
        />
      );
    }
    if (col.isOperador) {
      return (
        <OperadorSelector
          currentValue={val}
          onSelect={(nombre) => actualizarFilaNueva(col.key, nombre)}
          disabled={false}
        />
      );
    }
    if (col.isPlacas) {
      // PlacasSelector puede devolver objeto tracto o string de placas.
      // Se normaliza siempre a string de placas.
      return (
        <PlacasSelector
          currentValue={val}
          onSelect={(v) =>
            actualizarFilaNueva(col.key, typeof v === "object" ? v.placas : v)
          }
          disabled={false}
        />
      );
    }
    if (col.isStatus) {
      return (
        <PendientePagadoSelector
          currentStatus={val || "pendiente"}
          onSelect={(s) => actualizarFilaNueva(col.key, s)}
          loading={false}
        />
      );
    }
    // isTextoInline en fila nueva → input normal
    return (
      <input
        type="text"
        className="ml-input"
        value={val ?? ""}
        onChange={(e) => actualizarFilaNueva(col.key, e.target.value)}
        placeholder={col.label}
      />
    );
  };

  // ── Render de celda en fila existente ─────────────────────────────────────
  const renderCeldaExistente = (mov, col) => {
    const val = mov[col.key];

    if (col.isFecha) {
      return (
        <DatePicker
          selected={val ? parsearFecha(val) : null}
          onChange={(d) => actualizar(mov.id, { [col.key]: formatearFecha(d) })}
          locale="es"
          dateFormat="dd/MM/yyyy"
          placeholderText="—"
          className="ml-input ml-input--inline"
          isClearable
        />
      );
    }
    if (col.isOperador) {
      return (
        <OperadorSelector
          currentValue={val}
          onSelect={(nombre) => actualizar(mov.id, { [col.key]: nombre })}
          disabled={false}
        />
      );
    }
    if (col.isPlacas) {
      return (
        <PlacasSelector
          currentValue={val}
          onSelect={(v) =>
            actualizar(mov.id, { [col.key]: typeof v === "object" ? v.placas : v })
          }
          disabled={false}
        />
      );
    }
    if (col.isStatus) {
      return (
        <PendientePagadoSelector
          currentStatus={val || "pendiente"}
          onSelect={(s) => actualizar(mov.id, { [col.key]: s })}
          loading={false}
        />
      );
    }
    // isTextoInline → edición inline
    if (col.isTextoInline) {
      const editando = editandoCelda?.id === mov.id && editandoCelda?.key === col.key;
      if (editando) {
        return (
          <input
            type="text"
            className="ml-input ml-input--inline-edit"
            value={valorEditando}
            autoFocus
            onChange={(e) => setValorEditando(e.target.value)}
            onBlur={() => confirmarEdicion(mov.id, col.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  confirmarEdicion(mov.id, col.key);
              if (e.key === "Escape") cancelarEdicion();
            }}
          />
        );
      }
      return (
        <span
          className="ml-celda-texto"
          title="Click para editar"
          onClick={() => iniciarEdicion(mov.id, col.key, val)}
        >
          {val || <em className="ml-placeholder">—</em>}
        </span>
      );
    }
    return val ?? "—";
  };

  // ── Render de celda en ModalEditar ────────────────────────────────────────
  const renderCeldaModal = (col) => {
    const val = modal.datos[col.key];

    if (col.isFecha) {
      return (
        <DatePicker
          selected={val ? parsearFecha(val) : null}
          onChange={(d) => actualizarModal(col.key, formatearFecha(d))}
          locale="es"
          dateFormat="dd/MM/yyyy"
          placeholderText="dd/MM/yyyy"
          className="ml-input"
          isClearable
        />
      );
    }
    if (col.isOperador) {
      return (
        <OperadorSelector
          currentValue={val}
          onSelect={(nombre) => actualizarModal(col.key, nombre)}
          disabled={false}
        />
      );
    }
    if (col.isPlacas) {
      return (
        <PlacasSelector
          currentValue={val}
          onSelect={(v) =>
            actualizarModal(col.key, typeof v === "object" ? v.placas : v)
          }
          disabled={false}
        />
      );
    }
    if (col.isStatus) {
      return (
        <PendientePagadoSelector
          currentStatus={val || "pendiente"}
          onSelect={(s) => actualizarModal(col.key, s)}
          loading={false}
        />
      );
    }
    return (
      <input
        type="text"
        className="ml-input"
        value={val ?? ""}
        onChange={(e) => actualizarModal(col.key, e.target.value)}
        placeholder={col.label}
      />
    );
  };

  // ── Render principal ──────────────────────────────────────────────────────

  return (
    <div className="ml-page">
      {/* Header */}
      <div className="ml-header">
        <div className="ml-header-top">
          <div className="ml-titulo-wrap">
            <Truck size={24} />
            <h1 className="ml-titulo">Movimientos Locales</h1>
          </div>
          <button type="button" className="ml-btn-agregar" onClick={abrirFilaNueva} disabled={!!filaNueva}>
            + Agregar
          </button>
        </div>

        {/* Búsqueda y filtros */}
        <div className="ml-controles">
          <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Buscar por operador, movimiento, unidad, contenedor..." />
          <div className="ml-filtros">
            {FILTROS_STATUS.map((f) => (
              <button
                key={f}
                type="button"
                className={`ml-filtro-btn ${filtroStatus === f ? "ml-filtro-btn--activo" : ""}`}
                onClick={() => setFiltroStatus(f)}
              >
                {f === "todos" ? "Todos" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notificación */}
      {notif && (
        <div className={`ml-notif ml-notif--${notif.tipo}`}>{notif.msg}</div>
      )}

      {/* Tabla */}
      <div className="ml-tabla-wrapper">
        <table className="ml-tabla">
          <thead>
            <tr>
              {COLUMNAS.map((col) => (
                <th key={col.key} className="ml-th">{col.label}</th>
              ))}
              <th className="ml-th">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {/* Fila nueva */}
            {filaNueva && (
              <tr className="ml-fila ml-fila--nueva">
                {COLUMNAS.map((col) => (
                  <td key={col.key} className="ml-td">
                    {renderCeldaFilaNueva(col)}
                  </td>
                ))}
                <td className="ml-td ml-td--acciones">
                  <button
                    type="button"
                    className="ml-btn-guardar"
                    onClick={guardarFilaNueva}
                    disabled={guardando}
                  >
                    {guardando ? "..." : "Guardar"}
                  </button>
                  <button
                    type="button"
                    className="ml-btn-cancelar"
                    onClick={cancelarFilaNueva}
                  >
                    Cancelar
                  </button>
                </td>
              </tr>
            )}

            {/* Filas existentes */}
            {movimientos.map((mov) => (
              <tr
                key={mov.id}
                className={`ml-fila ${mov.status === "pagado" ? "ml-fila--pagada" : ""}`}
              >
                {COLUMNAS.map((col) => (
                  <td key={col.key} className="ml-td">
                    {renderCeldaExistente(mov, col)}
                  </td>
                ))}
                <td className="ml-td ml-td--acciones">
                  <button
                    type="button"
                    className="ml-btn-accion ml-btn-editar"
                    onClick={() => abrirModal(mov)}
                    title="Editar"
                  >
                    <SquarePen size={16} />
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className="ml-btn-accion ml-btn-eliminar"
                      onClick={() => eliminar(mov.id)}
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {cargando && <p className="ml-cargando">Cargando...</p>}
        {!cargando && movimientos.length === 0 && (
          <p className="ml-vacio">No hay movimientos registrados.</p>
        )}
      </div>

      {/* Modal Editar */}
      {modal.abierto && (
        <div
          className="ml-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) cerrarModal(); }}
        >
          <div className="ml-modal">
            <div className="ml-modal-header">
              <h2 className="ml-modal-titulo">Editar Movimiento</h2>
              <button type="button" className="ml-modal-cerrar" onClick={cerrarModal}>✕</button>
            </div>
            <div className="ml-modal-body">
              {COLUMNAS.map((col) => (
                <div key={col.key} className="ml-modal-campo">
                  <label className="ml-modal-label">{col.label}</label>
                  {renderCeldaModal(col)}
                </div>
              ))}
            </div>
            <div className="ml-modal-footer">
              <button type="button" className="ml-btn-cancelar" onClick={cerrarModal}>
                Cancelar
              </button>
              <button
                type="button"
                className="ml-btn-guardar"
                onClick={guardarModal}
                disabled={guardando}
              >
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### PASO 11 — Crear `src/pages/MovimientosLocalesPage.css`

```css
/* ── Layout ──────────────────────────────────────────────────────────────── */
.ml-page {
  padding: 20px;
  max-width: 100%;
}

.ml-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.ml-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ml-titulo-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--primary, #2563eb);
}

.ml-titulo {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text, #1f2937);
  margin: 0;
}

.ml-controles {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ml-filtros {
  display: flex;
  gap: 6px;
}

.ml-filtro-btn {
  padding: 5px 14px;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  font-size: 0.8rem;
  cursor: pointer;
  color: var(--text-light, #6b7280);
  transition: all 0.15s;
}
.ml-filtro-btn--activo {
  background: var(--primary, #2563eb);
  color: #fff;
  border-color: var(--primary, #2563eb);
  font-weight: 600;
}

/* ── Botón agregar ───────────────────────────────────────────────────────── */
.ml-btn-agregar {
  padding: 7px 18px;
  border: none;
  border-radius: 7px;
  background: var(--primary, #2563eb);
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.ml-btn-agregar:hover:not(:disabled) { background: #1d4ed8; }
.ml-btn-agregar:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Notificación ────────────────────────────────────────────────────────── */
.ml-notif {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  margin-bottom: 12px;
}
.ml-notif--exito { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
.ml-notif--error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

/* ── Tabla ───────────────────────────────────────────────────────────────── */
.ml-tabla-wrapper {
  overflow-x: auto;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 8px rgba(0,0,0,0.07);
}

.ml-tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.ml-th {
  padding: 10px 12px;
  background: var(--primary, #2563eb);
  color: #fff;
  font-weight: 700;
  text-align: left;
  white-space: nowrap;
  font-size: 0.8rem;
}

.ml-td {
  padding: 8px 10px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
  color: var(--text, #1f2937);
}

/* ── Color de fila por status ────────────────────────────────────────────── */
.ml-fila--pagada td {
  background-color: #b6d7a8;
}
.ml-fila--nueva td {
  background: #f0f9ff;
}

/* ── Inputs ──────────────────────────────────────────────────────────────── */
.ml-input {
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.82rem;
  width: 100%;
  box-sizing: border-box;
  color: var(--text, #1f2937);
}
.ml-input:focus {
  outline: none;
  border-color: var(--primary, #2563eb);
  box-shadow: 0 0 0 2px rgba(37,99,235,0.12);
}
.ml-input--inline {
  border-color: transparent;
  background: transparent;
}
.ml-input--inline:hover,
.ml-input--inline:focus {
  border-color: #d1d5db;
  background: #fff;
}
.ml-input--inline-edit {
  background: #fff;
}

/* ── Celda de texto inline editable ─────────────────────────────────────── */
.ml-celda-texto {
  cursor: pointer;
  display: block;
  min-width: 80px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.1s;
}
.ml-celda-texto:hover {
  background: #f3f4f6;
  outline: 1px dashed #d1d5db;
}
.ml-placeholder {
  color: var(--text-light, #6b7280);
  font-style: normal;
}

/* ── Acciones ────────────────────────────────────────────────────────────── */
.ml-td--acciones {
  white-space: nowrap;
  display: flex;
  gap: 6px;
  align-items: center;
}

.ml-btn-accion {
  padding: 5px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  background: transparent;
  transition: background 0.15s;
}
.ml-btn-editar    { color: var(--primary, #2563eb); }
.ml-btn-editar:hover { background: #eff6ff; }
.ml-btn-eliminar  { color: #dc2626; }
.ml-btn-eliminar:hover { background: #fef2f2; }

.ml-btn-guardar {
  padding: 5px 14px;
  border: none;
  border-radius: 6px;
  background: var(--primary, #2563eb);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.ml-btn-guardar:hover:not(:disabled) { background: #1d4ed8; }
.ml-btn-guardar:disabled { opacity: 0.6; cursor: not-allowed; }

.ml-btn-cancelar {
  padding: 5px 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: var(--text, #1f2937);
  font-size: 0.8rem;
  cursor: pointer;
}
.ml-btn-cancelar:hover { background: #f3f4f6; }

/* ── Estados de carga / vacío ────────────────────────────────────────────── */
.ml-cargando,
.ml-vacio {
  text-align: center;
  padding: 24px;
  color: var(--text-light, #6b7280);
  font-size: 0.875rem;
}

/* ── Modal ───────────────────────────────────────────────────────────────── */
.ml-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.ml-modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
}

.ml-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid #e5e7eb;
}
.ml-modal-titulo {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
  color: var(--text, #1f2937);
}
.ml-modal-cerrar {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
  color: var(--text-light, #6b7280);
  padding: 4px 8px;
  border-radius: 6px;
}
.ml-modal-cerrar:hover { background: #f3f4f6; }

.ml-modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ml-modal-campo {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ml-modal-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text, #1f2937);
}

.ml-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px 16px;
  border-top: 1px solid #e5e7eb;
}
```

---

### PASO 12 — `src/App.jsx`: Agregar ruta y tarjeta de Movimientos Locales

#### 12a. Agregar import de la nueva página

En la sección de imports de `App.jsx`, AGREGAR:

```js
import MovimientosLocalesPage from "./pages/MovimientosLocalesPage";
```

#### 12b. Agregar la ruta

En el bloque de `<Routes>`, AGREGAR la siguiente ruta junto a las demás páginas (antes de las rutas de admin):

```jsx
<Route
  path="movimientos-locales"
  element={
    <ProtectedRoute>
      <MovimientosLocalesPage />
    </ProtectedRoute>
  }
/>
```

#### 12c. Agregar tarjeta en el Home

Localizar el array o bloque donde están definidas las tarjetas del Home (las cards de Maniobras, Gastos, Vacíos, etc.). AGREGAR la siguiente tarjeta junto a las demás:

```jsx
{
  emoji: "🚛",
  titulo: "MOVIMIENTOS LOCALES",
  ruta: "movimientos-locales"
}
```

Si las cards se renderizan con un componente o en JSX inline, agregar en el mismo formato que las demás. El orden recomendado es después de "VACÍOS" y antes de "CATÁLOGOS".

---

## FEATURE 2: GESTIÓN DE SESIÓN POR INACTIVIDAD

---

### PASO 13 — `config/settings.py`: Aumentar lifetime de tokens JWT

Localizar el diccionario `SIMPLE_JWT` en `config/settings.py`.

Verificar que `from datetime import timedelta` esté importado al inicio del archivo. Si no está, AGREGAR.

En `SIMPLE_JWT`, REEMPLAZAR los valores de `ACCESS_TOKEN_LIFETIME` y `REFRESH_TOKEN_LIFETIME` con:

```python
SIMPLE_JWT = {
    # ... todos los demás campos sin cambio ...
    'ACCESS_TOKEN_LIFETIME':  timedelta(hours=12),
    'REFRESH_TOKEN_LIFETIME': timedelta(hours=12),
    # ... resto sin cambio ...
}
```

**Por qué 12 horas:** sessionStorage elimina los tokens al cerrar el navegador. El timer de inactividad cierra la sesión a los 20 minutos. En uso normal ninguna jornada excede 12 horas, así que los tokens nunca expirarán de forma inesperada durante uso activo.

---

### PASO 14 — `AuthContext.jsx`: Cambiar de `localStorage` a `sessionStorage`

Localizar en `src/context/AuthContext.jsx` la definición del objeto `tokenStore` (o donde se usen directamente `localStorage.getItem`, `localStorage.setItem`, `localStorage.removeItem` con las claves `'accessToken'` y `'refreshToken'`).

**REEMPLAZAR** todas las ocurrencias de `localStorage` dentro del contexto de manejo de tokens con `sessionStorage`:

| Antes                                       | Después                                        |
|---------------------------------------------|------------------------------------------------|
| `localStorage.getItem('accessToken')`       | `sessionStorage.getItem('accessToken')`        |
| `localStorage.getItem('refreshToken')`      | `sessionStorage.getItem('refreshToken')`       |
| `localStorage.setItem('accessToken', val)`  | `sessionStorage.setItem('accessToken', val)`   |
| `localStorage.setItem('refreshToken', val)` | `sessionStorage.setItem('refreshToken', val)`  |
| `localStorage.removeItem('accessToken')`    | `sessionStorage.removeItem('accessToken')`     |
| `localStorage.removeItem('refreshToken')`   | `sessionStorage.removeItem('refreshToken')`    |

**Importante:** hacer el reemplazo SOLO en las líneas relacionadas con `accessToken` y `refreshToken`. No cambiar ningún otro uso de `localStorage` que pueda existir por otras razones.

**Efecto:** al cerrar el navegador o la pestaña, los tokens desaparecen. Al refrescar la página, los tokens persisten (sessionStorage sobrevive F5 en la misma pestaña).

---

### PASO 15 — Crear `src/hooks/useInactivityTimer.js`

```js
import { useEffect, useRef, useCallback } from "react";

const WARN_MS    = 10 * 60 * 1000;  // 10 minutos
const EXPIRE_MS  = 20 * 60 * 1000;  // 20 minutos
const TICK_MS    = 10_000;           // verificar cada 10 segundos

// Eventos que cuentan como actividad del usuario.
// Deliberadamente NO incluye 'click' ni 'mousedown' para que
// hacer click en "Aceptar" del modal de aviso NO reinicie el timer (Option B).
const ACTIVITY_EVENTS = ["mousemove", "keydown", "scroll", "touchstart"];

/**
 * useInactivityTimer
 *
 * Detecta inactividad del usuario y llama callbacks al llegar a los umbrales.
 *
 * Props:
 *   enabled   boolean  — activa/desactiva el timer (solo cuando hay sesión)
 *   onWarn    function(boolean) — llamado con true al llegar a 10 min,
 *                                 con false cuando el usuario se vuelve activo
 *   onExpire  function() — llamado al llegar a 20 min de inactividad
 */
export function useInactivityTimer({ enabled, onWarn, onExpire }) {
  const lastActivityRef = useRef(Date.now());
  const warnedRef       = useRef(false);
  const expiredRef      = useRef(false);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (warnedRef.current) {
      // Si había aviso visible, ocultarlo al detectar actividad real
      warnedRef.current = false;
      onWarn(false);
    }
  }, [onWarn]);

  useEffect(() => {
    if (!enabled) {
      // Resetear estado interno si el timer se desactiva (logout)
      lastActivityRef.current = Date.now();
      warnedRef.current       = false;
      expiredRef.current      = false;
      return;
    }

    // Registrar listeners de actividad
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, resetActivity, { passive: true })
    );

    // Tick periódico para verificar inactividad
    const tick = setInterval(() => {
      if (expiredRef.current) return; // ya expiró, no seguir verificando

      const elapsed = Date.now() - lastActivityRef.current;

      if (elapsed >= EXPIRE_MS) {
        expiredRef.current = true;
        onExpire();
      } else if (elapsed >= WARN_MS && !warnedRef.current) {
        warnedRef.current = true;
        onWarn(true);
      }
    }, TICK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, resetActivity)
      );
      clearInterval(tick);
    };
  }, [enabled, resetActivity, onWarn, onExpire]);
}
```

---

### PASO 16 — Crear `src/components/InactivityModal/InactivityModal.jsx`

```jsx
import "./InactivityModal.css";

/**
 * InactivityModal
 * Muestra dos variantes según el tipo:
 *   - 'warn':    aviso de inactividad próxima (10 min). Aceptar solo cierra.
 *   - 'expired': sesión expirada (20 min). Aceptar redirige al login.
 *
 * Props:
 *   tipo       'warn' | 'expired'
 *   onAceptar  function — callback al hacer click en Aceptar
 */
export default function InactivityModal({ tipo, onAceptar }) {
  const esAviso = tipo === "warn";

  return (
    <div className="im-overlay">
      <div className={`im-modal im-modal--${tipo}`}>
        <div className="im-icono">{esAviso ? "⚠️" : "🔒"}</div>
        <p className="im-mensaje">
          {esAviso
            ? "Tu sesión se cerrará si sigues inactivo"
            : "Tu sesión se cerrará por inactividad"}
        </p>
        <button
          type="button"
          className="im-btn-aceptar"
          onClick={onAceptar}
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}
```

---

### PASO 17 — Crear `src/components/InactivityModal/InactivityModal.css`

```css
.im-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;  /* por encima de cualquier otro modal */
}

.im-modal {
  background: #fff;
  border-radius: 14px;
  padding: 36px 32px;
  max-width: 360px;
  width: 90%;
  text-align: center;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.im-icono {
  font-size: 2.5rem;
  line-height: 1;
}

.im-mensaje {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text, #1f2937);
  margin: 0;
  line-height: 1.4;
}

.im-btn-aceptar {
  padding: 10px 32px;
  border: none;
  border-radius: 8px;
  background: var(--primary, #2563eb);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.im-btn-aceptar:hover { background: #1d4ed8; }

/* Variante expired: borde rojo sutil */
.im-modal--expired {
  border: 2px solid #fecaca;
}
.im-modal--expired .im-btn-aceptar {
  background: #dc2626;
}
.im-modal--expired .im-btn-aceptar:hover {
  background: #b91c1c;
}
```

---

### PASO 18 — `src/App.jsx`: Integrar timer y modales de inactividad

#### 18a. Agregar imports

En la sección de imports de `App.jsx`, AGREGAR:

```js
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useInactivityTimer } from "./hooks/useInactivityTimer";
import InactivityModal from "./components/InactivityModal/InactivityModal";
```

Si `useState`, `useCallback` o `useNavigate` ya están importados, no duplicar.

#### 18b. Integrar en el cuerpo del componente `App`

Dentro del componente `App` (o el componente raíz que envuelve las rutas), AGREGAR el siguiente bloque de código DESPUÉS de la línea donde se obtiene `user` y `logout` desde `useAuthContext()`:

```js
const navigate = useNavigate();

// ── Estado de los modales de inactividad ───────────────────────────────────
const [showWarnModal,    setShowWarnModal]    = useState(false);
const [showExpiredModal, setShowExpiredModal] = useState(false);

// ── Callback de expiración: muestra el modal SIN hacer logout todavía.
// El logout ocurre al hacer click en Aceptar para garantizar que el modal
// sea visible antes de redirigir.
const handleExpire = useCallback(() => {
  setShowWarnModal(false);   // ocultar aviso si estaba visible
  setShowExpiredModal(true);
}, []);

// ── Activar timer solo cuando hay sesión activa (user !== null)
useInactivityTimer({
  enabled: !!user,
  onWarn:  setShowWarnModal,
  onExpire: handleExpire,
});

// ── Handler del botón Aceptar en modal de aviso (10 min)
// Solo cierra el modal. El timer NO se reinicia (Option B).
const handleWarnAceptar = () => {
  setShowWarnModal(false);
};

// ── Handler del botón Aceptar en modal de expiración (20 min)
// Ejecuta logout completo y redirige al login.
const handleExpiredAceptar = useCallback(() => {
  setShowExpiredModal(false);
  logout();            // limpia tokens y user state
  navigate("/login");
}, [logout, navigate]);
```

#### 18c. Agregar los modales al JSX del return

En el `return` del componente App, AGREGAR los siguientes dos modales al final del JSX, ANTES del cierre del fragmento o div raíz (pero dentro de él):

```jsx
{/* Modal de aviso de inactividad (10 min) */}
{showWarnModal && (
  <InactivityModal tipo="warn" onAceptar={handleWarnAceptar} />
)}

{/* Modal de sesión expirada (20 min) */}
{showExpiredModal && (
  <InactivityModal tipo="expired" onAceptar={handleExpiredAceptar} />
)}
```

---

## RESUMEN DE ARCHIVOS AFECTADOS

### Archivos nuevos (crear)
```
src/hooks/useMovimientosLocales.js
src/hooks/useInactivityTimer.js
src/components/PendientePagadoSelector/PendientePagadoSelector.jsx
src/components/PendientePagadoSelector/PendientePagadoSelector.css
src/components/InactivityModal/InactivityModal.jsx
src/components/InactivityModal/InactivityModal.css
src/pages/MovimientosLocalesPage.jsx
src/pages/MovimientosLocalesPage.css
```

### Archivos existentes a modificar
```
api/models.py          ← agregar MovimientoLocal
api/Serializers.py     ← agregar MovimientoLocalSerializer
api/views.py           ← agregar MovimientoLocalViewSet
api/urls.py            ← registrar movimientos-locales
config/settings.py     ← JWT lifetimes a 12h
src/context/AuthContext.jsx  ← localStorage → sessionStorage
src/App.jsx            ← ruta movimientos-locales, card home,
                          useInactivityTimer, modales InactivityModal
```

### SQL adicional (pgAdmin, después de migración)
```sql
-- RLS para api_movimientolocal (ver PASO 6)
```

---

## NOTAS CRÍTICAS PARA CLAUDE CODE

### Sobre PlacasSelector en MovimientosLocalesPage
PlacasSelector puede haber sido modificado en el plan anterior para devolver el objeto tracto completo (`onSelect(tracto)`) en lugar de solo el string de placas. En MovimientosLocalesPage se normaliza siempre con:
```js
onSelect={(v) => typeof v === "object" ? v.placas : v}
```
Esto es compatible con ambas versiones del componente.

### Sobre el color de fila pagada y la celda de acciones
La regla CSS `.ml-fila--pagada td` aplica `background-color: #b6d7a8` a todas las `td`. La celda de acciones (`.ml-td--acciones`) también se pintará, lo cual es correcto y consistente visualmente.

### Sobre el timer y la actividad del Aceptar del aviso
`useInactivityTimer` NO escucha el evento `click`. El botón Aceptar del modal de aviso se activa con un click de ratón, lo cual NO dispara `mousemove`, `keydown`, `scroll` ni `touchstart`. Por lo tanto, hacer click en Aceptar no reinicia el timer. Solo si el usuario mueve el ratón DESPUÉS de hacer click, el `mousemove` reinicia el timer. Este comportamiento implementa correctamente la Option B.

### Sobre el orden de logout en modal expired
En `handleExpiredAceptar`, primero se oculta el modal (`setShowExpiredModal(false)`), luego se llama `logout()` que limpia tokens y establece `user = null`. `ProtectedRoute` detecta `user === null` y redireccionaría, pero el `navigate('/login')` explícito garantiza la redirección inmediata independientemente de `ProtectedRoute`.

### Sobre sessionStorage y múltiples pestañas
Cada pestaña tiene su propio `sessionStorage`. Si el usuario abre la app en dos pestañas, cada pestaña tiene su propia sesión independiente. Cerrar una pestaña no afecta la otra. Esto es el comportamiento esperado y correcto.

### Sobre el SearchBar en MovimientosLocalesPage
Verificar que el componente `SearchBar` existente reciba props `value` y `onChange` en el mismo formato. Si usa props diferentes (ej. `query` y `onSearch`), adaptar la llamada en MovimientosLocalesPage al API real del componente existente.

### Sobre `useNavigate` en App.jsx
`useNavigate` de react-router-dom funciona dentro del contexto de un `Router`. Si `App.jsx` ES el componente que renderiza `<BrowserRouter>` (o `<Router>`), `useNavigate` debe usarse DENTRO de los hijos del Router, no en el mismo componente que lo define. Si ese fuera el caso, mover la lógica de inactividad a un componente hijo que esté dentro del Router, por ejemplo en un componente `AppLayout` o `AuthenticatedLayout`.
