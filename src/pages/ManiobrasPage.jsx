import { useState, useEffect, useCallback } from "react";
import { Trash2, ArrowDown, Truck } from "lucide-react";
import { useManiobras } from "../hooks/useManiobras";
import { useStatusUpdate } from "../hooks/useStatusUpdate";
import { getStatusConfig, isValidStatus } from "../config/statusConfig";
import StatusSelector from "../components/StatusSelector/StatusSelector";
import "./ManiobrasPage.css";

// ── Constantes ────────────────────────────────────────────────────────────────

const COLUMNAS = [
  { key: "solicita",                    label: "Solicita" },
  { key: "agencia",                     label: "Agencia" },
  { key: "codigo_pis",                  label: "Código PIS",
    style: { color: "var(--primary-blue)", fontWeight: "bold", fontFamily: "monospace" } },
  { key: "terminal",                    label: "Terminal" },
  { key: "placas_pis",                  label: "Placas PIS" },
  { key: "fecha_pis",                   label: "Fecha PIS" },
  { key: "horario",                     label: "Horario" },
  { key: "tipo_y_peso",                 label: "Tipo y Peso" },
  { key: "contenedor",                  label: "Contenedor" },
  { key: "pedimento",                   label: "Pedimento" },
  { key: "cliente",                     label: "Cliente" },
  { key: "origen",                      label: "Origen" },
  { key: "destino",                     label: "Destino" },
  { key: "asignacion_operador_status",  label: "Operador" },
];

const MANIOBRA_VACIA = {
  solicita: "", agencia: "", codigo_pis: "", terminal: "", placas_pis: "",
  fecha_pis: "", horario: "", tipo_y_peso: "", contenedor: "", pedimento: "",
  cliente: "", origen: "", destino: "", asignacion_operador_status: "",
};

const MODAL_CERRADO = { abierto: false, datos: null };

// ── Sub-componente: fila de inputs para nueva maniobra ────────────────────────

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
      {/* Columna status vacía en fila nueva */}
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

// ── Sub-componente: modal de edición ──────────────────────────────────────────

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
                  value={datos[col.key] ?? ""}
                  onChange={(e) => onChange(col.key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="modal-acciones">
            <button type="button" className="btn-cancelar" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className="btn-guardar">
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ManiobrasPage() {
  const { maniobras, setManiobras, loading, error, eliminar, actualizar, agregar } = useManiobras();
  const { updatingId, updateStatus } = useStatusUpdate(setManiobras);

  const [modoAgregar, setModoAgregar]     = useState(false);
  const [nuevaManiobra, setNuevaManiobra] = useState(MANIOBRA_VACIA);
  const [modal, setModal]                 = useState(MODAL_CERRADO);
  const [notif, setNotif]                 = useState(null);
  const [filtroStatus, setFiltroStatus]   = useState("todos");

  // ── Auto-dismiss de notificaciones ──────────────────────────────────────────
  useEffect(() => {
    if (!notif) return;
    const t = setTimeout(() => setNotif(null), 3000);
    return () => clearTimeout(t);
  }, [notif]);

  // ── Handlers CRUD ────────────────────────────────────────────────────────────

  const handleEliminar = useCallback(async (id) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar esta maniobra?")) return;
    try {
      await eliminar(id);
      setNotif({ tipo: "ok", msg: "Maniobra eliminada correctamente." });
    } catch {
      setNotif({ tipo: "error", msg: "Error al eliminar la maniobra." });
    }
  }, [eliminar]);

  const handleAbrirEdicion = useCallback((maniobra) => {
    setModal({ abierto: true, datos: { ...maniobra } });
  }, []);

  const handleCambioModal = useCallback((key, value) => {
    setModal((prev) => ({ ...prev, datos: { ...prev.datos, [key]: value } }));
  }, []);

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

  const handleCambioNueva = useCallback((key, value) => {
    setNuevaManiobra((prev) => ({ ...prev, [key]: value }));
  }, []);

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

  // ── Handler de cambio de status ──────────────────────────────────────────────

  const handleStatusChange = useCallback(async (maniobra, newStatus) => {
    try {
      await updateStatus(maniobra, newStatus);
      setNotif({ tipo: "ok", msg: "Status actualizado." });
    } catch (err) {
      setNotif({ tipo: "error", msg: `Error al cambiar status: ${err.message}` });
    }
  }, [updateStatus]);

  // ── Estados de carga / error ─────────────────────────────────────────────────

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

  // ── Render principal ─────────────────────────────────────────────────────────

  const maniobrasFiltradas = maniobras.filter((m) => {
    if (filtroStatus === "todos") return true;
    if (filtroStatus === "activo") return m.status === "activo";
    if (filtroStatus === "pendiente") return m.status === "pendiente";
    if (filtroStatus === "quemada") return m.status === "quemada";
    if (filtroStatus === "por_salir") return m.status === "por_salir";
    // Si no tiene uno de los 4 status existentes, se considera "vacio"
    if (filtroStatus === "vacio") return !isValidStatus(m.status);
    return true;
  });

  return (
    <div className="maniobras-container">
      <h1 className="maniobras-title">
        <Truck size={36} className="title-icon" /> Control de Maniobras
      </h1>

      {notif && (
        <div className={`notif notif-${notif.tipo}`} role="alert" aria-live="polite">
          {notif.msg}
        </div>
      )}

      <div className="toolbar">
        <div className="filtros-status">
          <button
            className={`btn-filtro ${filtroStatus === "todos" ? "active" : ""}`}
            onClick={() => setFiltroStatus("todos")}
          >
            Todos
          </button>
          <button
            className={`btn-filtro ${filtroStatus === "activo" ? "active" : ""}`}
            onClick={() => setFiltroStatus("activo")}
          >
            Activos
          </button>
          <button
            className={`btn-filtro ${filtroStatus === "pendiente" ? "active" : ""}`}
            onClick={() => setFiltroStatus("pendiente")}
          >
            Pendientes
          </button>
          <button
            className={`btn-filtro ${filtroStatus === "quemada" ? "active" : ""}`}
            onClick={() => setFiltroStatus("quemada")}
          >
            Quemados
          </button>
          <button
            className={`btn-filtro ${filtroStatus === "por_salir" ? "active" : ""}`}
            onClick={() => setFiltroStatus("por_salir")}
          >
            Por salir
          </button>
          <button
            className={`btn-filtro ${filtroStatus === "vacio" ? "active" : ""}`}
            onClick={() => setFiltroStatus("vacio")}
          >
            Vacíos
          </button>
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
        <table className="maniobras-table">
          <thead>
            <tr>
              {COLUMNAS.map((col) => <th key={col.key}>{col.label}</th>)}
              <th style={{ textAlign: "center" }}>Status</th>
              <th style={{ textAlign: "center" }}>Acciones</th>
            </tr>
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
                  <tr
                    key={maniobra.id}
                    // Clase de color de fila según status; sin clase si status desconocido
                    className={statusConfig?.rowClass ?? ""}
                  >
                    {COLUMNAS.map((col) => (
                      <td key={col.key} style={col.style ?? {}}>
                        {maniobra[col.key]}
                      </td>
                    ))}

                    {/* ── Columna Status con selector inline ───────────── */}
                    <td style={{ whiteSpace: "nowrap" }}>
                      <StatusSelector
                        currentStatus={maniobra.status}
                        onSelect={(newStatus) => handleStatusChange(maniobra, newStatus)}
                        loading={updatingId === maniobra.id}
                      />
                    </td>

                    {/* ── Columna Acciones ─────────────────────────────── */}
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
                        <button
                          className="btn-icon btn-eliminar"
                          onClick={() => handleEliminar(maniobra.id)}
                          aria-label="Eliminar maniobra"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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