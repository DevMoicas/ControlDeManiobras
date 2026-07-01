import { useState, useEffect, useCallback } from "react";
import { Trash2, SquarePen, Truck, Camera } from "lucide-react";
import { useManiobras } from "../hooks/useManiobras";
import { useStatusUpdate } from "../hooks/useStatusUpdate";
import { getStatusConfig, isValidStatus } from "../config/statusConfig";
import StatusSelector from "../components/StatusSelector/StatusSelector";
import PlacasSelector from "../components/PlacasSelector/PlacasSelector";
import RemolqueSelector from "../components/RemolqueSelector/RemolqueSelector";
import OperadorSelector from "../components/OperadorSelector/OperadorSelector";
import TransportistaSelector from "../components/TransportistaSelector/TransportistaSelector";
import PatioSelector from "../components/PatioSelector/PatioSelector";
import ClienteSelector from "../components/ClienteSelector/ClienteSelector";
import CiudadSelector from "../components/CiudadSelector/CiudadSelector";
import VacioStatusSelector from "../components/VacioStatusSelector/VacioStatusSelector";
import "./ManiobrasPage.css";
import SearchBar from "../components/SearchBar/SearchBar";
import { useAuthContext } from "../context/AuthContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from "react-datepicker";
import es from "date-fns/locale/es";
import FotoModal from "../components/FotoModal/FotoModal";
registerLocale("es", es);

// ── Constantes ────────────────────────────────────────────────────────────────

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

const COLUMNAS = [
  { key: "solicita", label: "Solicita" },
  { key: "agencia", label: "Agencia" },
  {
    key: "codigo_pis", label: "Código PIS",
    style: { color: "var(--primary-blue)", fontWeight: "bold", fontFamily: "monospace" }
  },
  { key: "terminal", label: "Terminal" },
  { key: "placas_pis", label: "Placas PIS", isPlacas: true },
  { key: "fecha_pis", label: "Fecha PIS", sortable: true },
  { key: "horario", label: "Horario", isHora: true },
  { key: "tipo",  label: "Tipo", isTipo: true },
  { key: "peso",  label: "Peso" },
  { key: "contenedor", label: "Contenedor" },
  { key: "referencia", label: "Referencia" },
  { key: "pedimento", label: "Pedimento" },
  { key: "cliente", label: "Cliente", isCliente: true },
  { key: "origen", label: "Origen", isOrigen: true },
  { key: "destino", label: "Destino", isDestino: true },
  { key: "transportista", label: "Transportista", isTransportista: true },
  { key: "asignacion_operador_status", label: "Operador", isOperador: true },
  { key: "unidad", label: "Unidad", isPlacas: true },
  { key: "remolque",   label: "Remolque 1", isRemolque: true },
  { key: "remolque_2", label: "Remolque 2", isRemolque2: true },
  { key: "folio", label: "Folio" },
  { key: "vacio_patio", label: "Vacio Patio", isPatio: true },
  { key: "status_vacio", label: "Status Vacío", isStatusVacio: true },
  { key: "fecha_entrega_mercancia", label: "Entrega Mercancía", sortable: true },
  { key: "no_factura", label: "No. Factura" },
  { key: "ccp", label: "CCP" },
  { key: "ruta_inicio", label: "Ruta Inicio", isFechaHora: true },
  { key: "ruta_fin",    label: "Ruta Fin",    isFechaHora: true },
];

const MANIOBRA_VACIA = {
  solicita: "", agencia: "", codigo_pis: "", terminal: "", placas_pis: "",
  fecha_pis: "", horario: "", tipo: "", peso: "", contenedor: "", referencia: "", pedimento: "",
  cliente: "", origen: "", destino: "", transportista: "", asignacion_operador_status: "",
  unidad: "", remolque: "", remolque_2: "", folio: "", vacio_patio: "", status_vacio: "",
  fecha_entrega_mercancia: "", no_factura: "", ccp: "", ruta_inicio: "", ruta_fin: "",
};

const MODAL_CERRADO = { abierto: false, datos: null };

// Convierte YYYY-MM-DD (backend) → DD/MM/YYYY (lo que ve el usuario)
function fechaParaMostrar(valor) {
  if (!valor) return "";
  const [y, m, d] = valor.split("-");
  if (!y || !m || !d) return valor;
  return `${d}/${m}/${y}`;
}

// Convierte ISO datetime (backend) → DD/MM/YYYY HH:mm para mostrar en la tabla
function fechaHoraParaMostrar(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Convierte "HH:mm" (backend) → objeto Date (hoy con esa hora) para el DatePicker
function horaADate(valor) {
  if (!valor) return null;
  const [h, m] = String(valor).split(":");
  if (h === undefined || m === undefined) return null;
  const d = new Date();
  d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
  if (isNaN(d.getTime())) return null;
  return d;
}

// Convierte objeto Date → "HH:mm" para el backend
function dateAHora(date) {
  if (!date) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(date.getHours())}:${p(date.getMinutes())}`;
}

// Convierte DD/MM/YYYY (input del usuario) → YYYY-MM-DD (backend)
function fechaParaBackend(valor) {
  if (!valor) return "";
  const [d, m, y] = valor.split("/");
  if (!y || !m || !d) return valor;
  return `${y}-${m}-${d}`;
}

// Convierte YYYY-MM-DD → objeto Date para el DatePicker
function fechaADate(valorYYYYMMDD) {
  if (!valorYYYYMMDD) return null;
  const parts = valorYYYYMMDD.split("-");
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  if (isNaN(d.getTime())) return null;
  return d;
}

// Convierte objeto Date → YYYY-MM-DD para el backend
function dateAFechaBackend(dateObject) {
  if (!dateObject) return "";
  const y = dateObject.getFullYear();
  const m = String(dateObject.getMonth() + 1).padStart(2, "0");
  const d = String(dateObject.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function vacioStatusStyle(status) {
  if (status === "pendiente") return { background: "#fef9c3", color: "#854d0e" };
  if (status === "entregado") return { background: "#dcfce7", color: "#166534" };
  return { background: "#f3f4f6", color: "#6b7280" };
}

function vacioStatusLabel(status) {
  if (status === "pendiente") return "Pendiente";
  if (status === "entregado") return "Entregado";
  return status || "—";
}

const FILTROS = [
  { id: "todos",     label: "Todos" },
  { id: "activo",    label: "Activos" },
  { id: "pendiente", label: "Pendientes" },
  { id: "quemada",   label: "Quemados" },
  { id: "por_salir", label: "Lázaro" },
  { id: "vacio",     label: "Vacíos" },
];

// Columnas del header — reutilizadas en ambas tablas
function HeaderRow({ ordenFecha, onOrdenar }) {
  const iconoFlecha = ordenFecha === "asc" ? "↑" : "↓";
  return (
    <tr>
      {COLUMNAS.map((col) => (
        <th key={col.key}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {col.label}
            {col.sortable && (
              <button
                className="btn-ordenar"
                onClick={() => onOrdenar(col.key)}
                title={ordenFecha === "asc" ? "Más reciente primero" : "Más antiguo primero"}
              >
                {iconoFlecha}
              </button>
            )}
          </div>
        </th>
      ))}
      <th style={{ textAlign: "center" }}>Status</th>
      <th style={{ textAlign: "center" }}>Acciones</th>
    </tr>
  );
}

// ── Sub-componente: fila nueva ────────────────────────────────────────────────

function FilaNueva({ datos, onChange, onGuardar, onCancelar, isSubmitting }) {
  return (
    <tr>
      {COLUMNAS.map((col) => (
        <td key={col.key}>
          {col.sortable ? (
            <DatePicker
              locale="es"
              dateFormat="dd/MM/yyyy"
              selected={fechaADate(datos[col.key])}
              onChange={(date) => onChange(col.key, dateAFechaBackend(date))}
              placeholderText="DD/MM/YYYY"
              className="date-picker-input"
              isClearable
            />
          ) : col.isPlacas ? (
            <PlacasSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
              transportista={col.key === "unidad" ? datos.transportista : undefined}
              todas={col.key === "placas_pis"}
            />
          ) : col.isOperador ? (
            <OperadorSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
              transportista={datos.transportista}
            />
          ) : col.isTransportista ? (
            <TransportistaSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
          ) : col.isFechaHora ? (
            <DatePicker
              locale="es"
              selected={datos[col.key] ? new Date(datos[col.key]) : null}
              onChange={(date) => onChange(col.key, date ? date.toISOString() : "")}
              showTimeSelect
              timeFormat="HH:mm"
              timeIntervals={15}
              dateFormat="dd/MM/yyyy HH:mm"
              placeholderText="DD/MM/YYYY HH:mm"
              className="date-picker-input"
              isClearable
            />
          ) : col.isHora ? (
            <DatePicker
              selected={horaADate(datos[col.key])}
              onChange={(date) => onChange(col.key, dateAHora(date))}
              showTimeSelect
              showTimeSelectOnly
              timeIntervals={15}
              timeCaption="Hora"
              timeFormat="HH:mm"
              dateFormat="HH:mm"
              placeholderText="HH:mm"
              className="date-picker-input"
              isClearable
            />
          ) : col.isCliente ? (
            <ClienteSelector
              currentValue={datos[col.key]}
              onSelect={(c) => onChange(col.key, c.nombre_cliente)}
              disabled={isSubmitting}
            />
          ) : col.isOrigen ? (
            <CiudadSelector
              endpoint="/origenes/"
              placeholder="— Seleccionar origen —"
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
          ) : col.isDestino ? (
            <CiudadSelector
              endpoint="/destinos/"
              placeholder="— Seleccionar destino —"
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
          ) : col.isPatio ? (
            <PatioSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
          ) : col.isStatusVacio ? (
            <VacioStatusSelector
              currentStatus={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              loading={false}
            />
          ) : col.isRemolque ? (
            <RemolqueSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
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
        </td>
      ))}
      <td />
      <td>
        <div style={{ display: "flex", gap: "4px" }}>
          <button className="btn-accion btn-guardar-fila" onClick={onGuardar} disabled={isSubmitting}>{isSubmitting ? '...' : 'Guardar'}</button>
          <button className="btn-accion btn-cancelar-fila" onClick={onCancelar} disabled={isSubmitting}>Cancelar</button>
        </div>
      </td>
    </tr>
  );
}

// ── Sub-componente: modal edición ─────────────────────────────────────────────

function ModalEditar({ datos, onChange, onGuardar, onCerrar, isSubmitting }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-titulo"
    >
      <div className="modal-content">
        <h2 id="modal-titulo" className="modal-titulo">Editar Maniobra</h2>
        <form onSubmit={onGuardar} className="modal-form">
          <div className="modal-grid">
            {COLUMNAS.map((col) => (
              <div key={col.key} className="modal-campo">
                <label htmlFor={`edit-${col.key}`}>{col.label}</label>
                {col.sortable ? (
                  <DatePicker
                    id={`edit-${col.key}`}
                    locale="es"
                    dateFormat="dd/MM/yyyy"
                    selected={fechaADate(datos[col.key] ?? "")}
                    onChange={(date) => onChange(col.key, dateAFechaBackend(date))}
                    placeholderText="DD/MM/YYYY"
                    className="date-picker-input"
                    isClearable
                  />
                ) : col.isPlacas ? (
                  <PlacasSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                    transportista={col.key === "unidad" ? datos.transportista : undefined}
                    todas={col.key === "placas_pis"}
                  />
                ) : col.isOperador ? (
                  <OperadorSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                    transportista={datos.transportista}
                  />
                ) : col.isTransportista ? (
                  <TransportistaSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isFechaHora ? (
                  <DatePicker
                    id={`edit-${col.key}`}
                    locale="es"
                    selected={datos[col.key] ? new Date(datos[col.key]) : null}
                    onChange={(date) => onChange(col.key, date ? date.toISOString() : "")}
                    showTimeSelect
                    timeFormat="HH:mm"
                    timeIntervals={15}
                    dateFormat="dd/MM/yyyy HH:mm"
                    placeholderText="DD/MM/YYYY HH:mm"
                    className="date-picker-input"
                    isClearable
                  />
                ) : col.isHora ? (
                  <DatePicker
                    id={`edit-${col.key}`}
                    selected={horaADate(datos[col.key] ?? "")}
                    onChange={(date) => onChange(col.key, dateAHora(date))}
                    showTimeSelect
                    showTimeSelectOnly
                    timeIntervals={15}
                    timeCaption="Hora"
                    timeFormat="HH:mm"
                    dateFormat="HH:mm"
                    placeholderText="HH:mm"
                    className="date-picker-input"
                    isClearable
                  />
                ) : col.isCliente ? (
                  <ClienteSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(c) => onChange(col.key, c.nombre_cliente)}
                    disabled={isSubmitting}
                  />
                ) : col.isOrigen ? (
                  <CiudadSelector
                    endpoint="/origenes/"
                    placeholder="— Seleccionar origen —"
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isDestino ? (
                  <CiudadSelector
                    endpoint="/destinos/"
                    placeholder="— Seleccionar destino —"
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isPatio ? (
                  <PatioSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isStatusVacio ? (
                  <VacioStatusSelector
                    currentStatus={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    loading={false}
                  />
                ) : col.isRemolque ? (
                  <RemolqueSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
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
              </div>
            ))}
          </div>
          <div className="modal-acciones">
            <button type="button" className="btn-cancelar" onClick={onCerrar} disabled={isSubmitting}>Cancelar</button>
            <button type="submit" className="btn-guardar" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar Cambios'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ManiobrasPage() {
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busqueda,     setBusqueda]     = useState("");
  const [ordenFecha, setOrdenFecha] = useState("desc");
  const handleOrdenar = useCallback((campo) => {
  setOrdenFecha((prev) => {
    const nuevo = prev === "desc" ? "asc" : "desc";
    return nuevo;
  });
}, []);

  const {
    maniobras, setManiobras,
    loading, loadingMore, hasMore, error,
    loadMore, eliminar, actualizar, agregar,
  } = useManiobras(filtroStatus, ordenFecha);

  const { updatingId, updateStatus } = useStatusUpdate(setManiobras);
  const { isAdmin } = useAuthContext();

  const [modoAgregar,   setModoAgregar]   = useState(false);
  const [nuevaManiobra, setNuevaManiobra] = useState(MANIOBRA_VACIA);
  const [modal,         setModal]         = useState(MODAL_CERRADO);
  const [notif,         setNotif]         = useState(null);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [fotoModal,     setFotoModal]     = useState(null); // { registroId } | null

  // ── Scroll listener en window ─────────────────────────────────────────────
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const scrolled  = window.scrollY + window.innerHeight;
        const threshold = document.documentElement.scrollHeight - 300;
        if (scrolled >= threshold && hasMore && !loadingMore) loadMore();
        ticking = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasMore, loadingMore, loadMore]);

  // ── Auto-dismiss notificaciones ───────────────────────────────────────────
  useEffect(() => {
    if (!notif) return;
    const t = setTimeout(() => setNotif(null), 3000);
    return () => clearTimeout(t);
  }, [notif]);

  // ── Handlers CRUD ─────────────────────────────────────────────────────────

  const handleEliminar = useCallback(async (id) => {
    if (!isAdmin) {
      setNotif({ tipo: "error", msg: "No tienes permisos para eliminar." });
      return;
    }
    if (!window.confirm("¿Estás seguro de que deseas eliminar esta maniobra?")) return;
    setIsSubmitting(true);
    try {
      await eliminar(id);
      setNotif({ tipo: "ok", msg: "Maniobra eliminada correctamente." });
    } catch {
      setNotif({ tipo: "error", msg: "Error al eliminar la maniobra." });
    } finally {
      setIsSubmitting(false);
    }
  }, [eliminar, isAdmin]);

  const handleAbrirEdicion  = useCallback((m) => setModal({ abierto: true, datos: { ...m } }), []);
  const handleCambioModal   = useCallback((key, value) =>
    setModal((prev) => ({ ...prev, datos: { ...prev.datos, [key]: value } })), []);

  const handleGuardarEdicion = useCallback(async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await actualizar(modal.datos.id, modal.datos);
      setNotif({ tipo: "ok", msg: "Maniobra actualizada correctamente." });
      setModal(MODAL_CERRADO);
    } catch (err) {
      setNotif({ tipo: "error", msg: err.message || "Error al actualizar la maniobra." });
    } finally {
      setIsSubmitting(false);
    }
  }, [modal.datos, actualizar]);

  const handleCambioNueva = useCallback((key, value) =>
    setNuevaManiobra((prev) => ({ ...prev, [key]: value })), []);

  const handleGuardarNueva = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await agregar(nuevaManiobra);
      setNuevaManiobra(MANIOBRA_VACIA);
      setModoAgregar(false);
      setNotif({ tipo: "ok", msg: "Maniobra agregada correctamente." });
    } catch (err) {
      setNotif({ tipo: "error", msg: err.message || "Error al agregar la maniobra." });
    } finally {
      setIsSubmitting(false);
    }
  }, [nuevaManiobra, agregar]);

  const handleCancelarNueva = useCallback(() => {
    setModoAgregar(false);
    setNuevaManiobra(MANIOBRA_VACIA);
  }, []);

  const handleStatusChange = useCallback(async (maniobra, newStatus) => {
    try {
      await updateStatus(maniobra, newStatus);
      setNotif({ tipo: "ok", msg: "Status actualizado." });
    } catch (err) {
      setNotif({ tipo: "error", msg: `Error al cambiar status: ${err.message}` });
    }
  }, [updateStatus]);

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const maniobrasFiltradas = filtroStatus === "vacio"
    ? maniobras.filter((m) => !isValidStatus(m.status))
    : maniobras.filter((m) =>
        !busqueda ||
        Object.values(m).some((v) =>
          String(v).toLowerCase().includes(busqueda.toLowerCase())
        )
      );

  // ── Estados de carga / error ──────────────────────────────────────────────

  if (loading) return (
    <div className="maniobras-container">
      <h1 className="maniobras-title"><Truck size={36} className="title-icon" /> Control de Maniobras</h1>
      <div className="loading-box"><p className="loading-text">Cargando datos…</p></div>
    </div>
  );

  if (error) return (
    <div className="maniobras-container">
      <h1 className="maniobras-title"><Truck size={36} className="title-icon" /> Control de Maniobras</h1>
      <div className="error-box">
        <h2 className="error-title">¡Ups!</h2>
        <p className="error-text">Error al conectar con el servidor: {error}</p>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="maniobras-container">
      <h1 className="maniobras-title">
        <Truck size={45} className="title-icon" /> Control de Maniobras
      </h1>

      <SearchBar value={busqueda} onChange={setBusqueda} />

      {notif && (
        <div className={`notif notif-${notif.tipo}`} role="alert" aria-live="polite">
          {notif.msg}
        </div>
      )}

      <div className="toolbar">
        <div className="filtros-status">
          {FILTROS.map(({ id, label }) => (
            <button
              key={id}
              className={`btn-filtro ${filtroStatus === id ? "active" : ""}`}
              onClick={() => setFiltroStatus(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="btn-agregar"
          onClick={() => setModoAgregar(true)}
          disabled={modoAgregar || isSubmitting}
        >
          + Agregar Registro
        </button>
      </div>

      <div className="table-responsive">

        {/* ── BODY — scroll horizontal + vertical ── */}
        <div className="table-scroll-wrapper">
          <table className="maniobras-table">
            {/* thead fantasma para sincronizar anchos de columna */}
            <thead className="thead-ghost">
              <HeaderRow ordenFecha={ordenFecha} onOrdenar={handleOrdenar} />
            </thead>
            <tbody>
              {modoAgregar && (
                <FilaNueva
                  datos={nuevaManiobra}
                  onChange={handleCambioNueva}
                  onGuardar={handleGuardarNueva}
                  onCancelar={handleCancelarNueva}
                  isSubmitting={isSubmitting}
                />
              )}

              {maniobrasFiltradas.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNAS.length + 2}
                    style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}
                  >
                    No hay maniobras que mostrar con el filtro actual
                  </td>
                </tr>
              ) : (
                maniobrasFiltradas.map((maniobra) => {
                  const statusConfig = getStatusConfig(maniobra.status);
                  return (
                    <tr key={maniobra.id} className={statusConfig?.rowClass ?? ""}>
                      {COLUMNAS.map((col) => (
                        <td key={col.key} style={col.style ?? {}}>
                          {col.sortable ? (
                            fechaParaMostrar(maniobra[col.key])
                          ) : col.isFechaHora ? (
                            fechaHoraParaMostrar(maniobra[col.key])
                          ) : col.isStatusVacio ? (
                            <span style={{ ...vacioStatusStyle(maniobra[col.key]), padding: "3px 10px", borderRadius: "6px", fontSize: "0.82rem", fontWeight: "600", display: "inline-block" }}>
                              {vacioStatusLabel(maniobra[col.key])}
                            </span>
                          ) : (
                            maniobra[col.key]
                          )}
                        </td>
                      ))}
                      <td style={{ whiteSpace: "nowrap" }}>
                        <StatusSelector
                          currentStatus={maniobra.status}
                          onSelect={(newStatus) => handleStatusChange(maniobra, newStatus)}
                          loading={updatingId === maniobra.id}
                        />
                      </td>
                      <td>
                        <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
                          <button
                            className="btn-icon btn-editar"
                            onClick={() => handleAbrirEdicion(maniobra)}
                            aria-label="Editar maniobra"
                            title="Editar"
                            disabled={isSubmitting}
                          >
                            <SquarePen size={18} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon btn-foto"
                            onClick={() => setFotoModal({ registroId: maniobra.id })}
                            aria-label="Ver fotos de la maniobra"
                            title="Fotos"
                            disabled={isSubmitting}
                          >
                            <Camera size={18} />
                          </button>
                          {isAdmin && (
                            <button
                              className="btn-icon btn-eliminar"
                              onClick={() => handleEliminar(maniobra.id)}
                              aria-label="Eliminar maniobra"
                              title="Eliminar"
                              disabled={isSubmitting}
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {loadingMore && (
        <div className="loading-more" aria-live="polite">
          <span className="loading-more-spinner" />
          Cargando más registros…
        </div>
      )}

      {!hasMore && maniobras.length > 0 && !loadingMore && (
        <p className="end-of-list">— Todos los registros cargados —</p>
      )}

      {modal.abierto && modal.datos && (
        <ModalEditar
          datos={modal.datos}
          onChange={handleCambioModal}
          onGuardar={handleGuardarEdicion}
          onCerrar={() => setModal(MODAL_CERRADO)}
          isSubmitting={isSubmitting}
        />
      )}

      {fotoModal && (
        <FotoModal
          tipo="maniobra"
          registroId={fotoModal.registroId}
          onCerrar={() => setFotoModal(null)}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}