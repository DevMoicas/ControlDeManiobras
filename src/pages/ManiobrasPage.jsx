import { useState, useEffect, useCallback } from "react";
import { Trash2, ArrowDown, Truck } from "lucide-react";
import { useManiobras } from "../hooks/useManiobras";
import { useStatusUpdate } from "../hooks/useStatusUpdate";
import { getStatusConfig, isValidStatus } from "../config/statusConfig";
import StatusSelector from "../components/StatusSelector/StatusSelector";
import "./ManiobrasPage.css";
import SearchBar from "../components/SearchBar/SearchBar";
import { useAuthContext } from "../context/AuthContext";

// ── Constantes ────────────────────────────────────────────────────────────────

const COLUMNAS = [
  { key: "solicita", label: "Solicita" },
  { key: "agencia", label: "Agencia" },
  {
    key: "codigo_pis", label: "Código PIS",
    style: { color: "var(--primary-blue)", fontWeight: "bold", fontFamily: "monospace" }
  },
  { key: "terminal", label: "Terminal" },
  { key: "placas_pis", label: "Placas PIS" },
  { key: "fecha_pis", label: "Fecha PIS", sortable: true },
  { key: "horario", label: "Horario" },
  { key: "tipo_y_peso", label: "Tipo y Peso" },
  { key: "contenedor", label: "Contenedor" },
  { key: "pedimento", label: "Pedimento" },
  { key: "cliente", label: "Cliente" },
  { key: "origen", label: "Origen" },
  { key: "destino", label: "Destino" },
  { key: "asignacion_operador_status", label: "Operador" },
  { key: "unidad", label: "Unidad" },
  { key: "folio", label: "Folio" },
  { key: "vacio_patio", label: "Vacio Patio" },
  { key: "status_vacio", label: "Status Vacío" },
  { key: "fecha_entrega_mercancia", label: "Entrega Mercancía", sortable: true },
  { key: "no_factura", label: "No. Factura" },
  { key: "ccp", label: "CCP" },
];

const MANIOBRA_VACIA = {
  solicita: "", agencia: "", codigo_pis: "", terminal: "", placas_pis: "",
  fecha_pis: "", horario: "", tipo_y_peso: "", contenedor: "", pedimento: "",
  cliente: "", origen: "", destino: "", asignacion_operador_status: "",
  unidad: "", folio: "", vacio_patio: "", status_vacio: "",
  fecha_entrega_mercancia: "", no_factura: "", ccp: "",
};

const MODAL_CERRADO = { abierto: false, datos: null };

// Convierte YYYY-MM-DD (backend) → DD/MM/YYYY (lo que ve el usuario)
function fechaParaMostrar(valor) {
  if (!valor) return "";
  const [y, m, d] = valor.split("-");
  if (!y || !m || !d) return valor;
  return `${d}/${m}/${y}`;
}

// Convierte DD/MM/YYYY (input del usuario) → YYYY-MM-DD (backend)
function fechaParaBackend(valor) {
  if (!valor) return "";
  const [d, m, y] = valor.split("/");
  if (!y || !m || !d) return valor;
  return `${y}-${m}-${d}`;
}

const FILTROS = [
  { id: "todos",     label: "Todos" },
  { id: "activo",    label: "Activos" },
  { id: "pendiente", label: "Pendientes" },
  { id: "quemada",   label: "Quemados" },
  { id: "por_salir", label: "Por salir" },
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

function FilaNueva({ datos, onChange, onGuardar, onCancelar }) {
  return (
    <tr>
      {COLUMNAS.map((col) => (
        <td key={col.key}>
          <input
            value={datos[col.key]}
            onChange={(e) => onChange(col.key, e.target.value)}
            placeholder={col.label}
            aria-label={col.label}
          />
        </td>
      ))}
      <td />
      <td>
        <div style={{ display: "flex", gap: "4px" }}>
          <button className="btn-accion btn-guardar-fila" onClick={onGuardar}>Guardar</button>
          <button className="btn-accion btn-cancelar-fila" onClick={onCancelar}>Cancelar</button>
        </div>
      </td>
    </tr>
  );
}

// ── Sub-componente: modal edición ─────────────────────────────────────────────

function ModalEditar({ datos, onChange, onGuardar, onCerrar }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-titulo"
      onClick={onCerrar}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 id="modal-titulo" className="modal-titulo">Editar Maniobra</h2>
        <form onSubmit={onGuardar} className="modal-form">
          <div className="modal-grid">
            {COLUMNAS.map((col) => (
              <div key={col.key} className="modal-campo">
                <label htmlFor={`edit-${col.key}`}>{col.label}</label>
                <input
                  id={`edit-${col.key}`}
                  value={col.sortable ? fechaParaMostrar(datos[col.key] ?? "") : (datos[col.key] ?? "")}
                  onChange={(e) =>
                    onChange(col.key, col.sortable ? fechaParaBackend(e.target.value) : e.target.value)}
                  placeholder={col.sortable ? "DD/MM/YYYY" : ""}
                />
              </div>
            ))}
          </div>
          <div className="modal-acciones">
            <button type="button" className="btn-cancelar" onClick={onCerrar}>Cancelar</button>
            <button type="submit" className="btn-guardar">Guardar Cambios</button>
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
    try {
      await eliminar(id);
      setNotif({ tipo: "ok", msg: "Maniobra eliminada correctamente." });
    } catch {
      setNotif({ tipo: "error", msg: "Error al eliminar la maniobra." });
    }
  }, [eliminar, isAdmin]);

  const handleAbrirEdicion  = useCallback((m) => setModal({ abierto: true, datos: { ...m } }), []);
  const handleCambioModal   = useCallback((key, value) =>
    setModal((prev) => ({ ...prev, datos: { ...prev.datos, [key]: value } })), []);

  const handleGuardarEdicion = useCallback(async (e) => {
    e.preventDefault();
    try {
      await actualizar(modal.datos.id, modal.datos);
      setNotif({ tipo: "ok", msg: "Maniobra actualizada correctamente." });
      setModal(MODAL_CERRADO);
    } catch {
      setNotif({ tipo: "error", msg: "Error al actualizar la maniobra." });
    }
  }, [modal.datos, actualizar]);

  const handleCambioNueva = useCallback((key, value) =>
    setNuevaManiobra((prev) => ({ ...prev, [key]: value })), []);

  const handleGuardarNueva = useCallback(async () => {
    try {
      await agregar(nuevaManiobra);
      setNuevaManiobra(MANIOBRA_VACIA);
      setModoAgregar(false);
      setNotif({ tipo: "ok", msg: "Maniobra agregada correctamente." });
    } catch {
      setNotif({ tipo: "error", msg: "Error al agregar la maniobra." });
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
        <Truck size={36} className="title-icon" /> Control de Maniobras
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
          disabled={modoAgregar}
        >
          + Agregar Registro
        </button>
      </div>

      <div className="table-responsive">

        {/* ── HEADER STICKY — fuera del scroll horizontal ── */}
        <div className="table-header-wrapper">
          <table className="maniobras-table">
            <thead>
              <HeaderRow ordenFecha={ordenFecha} onOrdenar={handleOrdenar} />
            </thead>
          </table>
        </div>

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
                          {col.sortable ? fechaParaMostrar(maniobra[col.key]) : maniobra[col.key]}
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
                          >
                            <ArrowDown size={18} />
                          </button>
                          {isAdmin && (
                            <button
                              className="btn-icon btn-eliminar"
                              onClick={() => handleEliminar(maniobra.id)}
                              aria-label="Eliminar maniobra"
                              title="Eliminar"
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
        />
      )}
    </div>
  );
}