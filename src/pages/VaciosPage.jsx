import { useState, useEffect, useCallback } from "react";
import { Trash2, ArrowDown, Package } from "lucide-react";
import { useVacios } from "../hooks/useVacios";
import { useAuthContext } from "../context/AuthContext";
import SearchBar from "../components/SearchBar/SearchBar";
import { useNavigate } from "react-router-dom";
import "./VaciosPage.css";

const COLUMNAS = [
  { key: "contenedor",                label: "Contenedor" },
  { key: "patio",                     label: "Patio" },
  { key: "fecha_maniobra",            label: "Fecha Maniobra" },
  { key: "fecha_entrega",             label: "Fecha Entrega" },
  { key: "fecha_notificacion_cliente",label: "Notific. Cliente" },
  { key: "status",                    label: "Status" },
  { key: "operador",                  label: "Operador" },
  { key: "cita",                      label: "Cita" },
  { key: "cd",                        label: "CD" },
];

const MODAL_CERRADO = { abierto: false, datos: null };

// ── Sub-componente: fila nueva ────────────────────────────────────────────────

function FilaNueva({ datos, onChange, onGuardar, onCancelar }) {
  return (
    <tr>
      {COLUMNAS.map((col) => (
        <td key={col.key}>
          <input
            value={datos[col.key] || ""}
            onChange={(e) => onChange(col.key, e.target.value)}
            placeholder={col.label}
            aria-label={col.label}
          />
        </td>
      ))}
      <td>
        <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
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
        <h2 id="modal-titulo" className="modal-titulo">Editar Vacío</h2>
        <form onSubmit={onGuardar} className="modal-form">
          <div className="modal-grid">
            {COLUMNAS.map((col) => (
              <div key={col.key} className="modal-campo">
                <label htmlFor={`edit-${col.key}`}>{col.label}</label>
                <input
                  id={`edit-${col.key}`}
                  value={datos[col.key] || ""}
                  onChange={(e) => onChange(col.key, e.target.value)}
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

export default function VaciosPage() {
  const navigate = useNavigate();
  const {
    vacios, loading, loadingMore, hasMore, error,
    loadMore, eliminar, actualizar, agregar, VACIO_VACIO,
  } = useVacios();
  const { isAdmin } = useAuthContext();

  const [modoAgregar, setModoAgregar] = useState(false);
  const [nuevoVacio,  setNuevoVacio]  = useState(VACIO_VACIO);
  const [modal,       setModal]       = useState(MODAL_CERRADO);
  const [notif,       setNotif]       = useState(null);
  const [busqueda,    setBusqueda]    = useState("");

  // ── Scroll listener en window ─────────────────────────────────────────────
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const scrolled   = window.scrollY + window.innerHeight;
        const threshold  = document.documentElement.scrollHeight - 300;

        if (scrolled >= threshold && hasMore && !loadingMore) {
          loadMore();
        }
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
    if (!window.confirm("¿Estás seguro de que deseas eliminar este vacío?")) return;
    try {
      await eliminar(id);
      setNotif({ tipo: "ok", msg: "Vacío eliminado correctamente." });
    } catch {
      setNotif({ tipo: "error", msg: "Error al eliminar el vacío." });
    }
  }, [eliminar, isAdmin]);

  const handleAbrirEdicion  = useCallback((v) => setModal({ abierto: true, datos: { ...v } }), []);
  const handleCambioModal   = useCallback((key, value) =>
    setModal((prev) => ({ ...prev, datos: { ...prev.datos, [key]: value } })), []);

  const handleGuardarEdicion = useCallback(async (e) => {
    e.preventDefault();
    try {
      await actualizar(modal.datos.id, modal.datos);
      setNotif({ tipo: "ok", msg: "Vacío actualizado correctamente." });
      setModal(MODAL_CERRADO);
    } catch {
      setNotif({ tipo: "error", msg: "Error al actualizar el vacío." });
    }
  }, [modal.datos, actualizar]);

  const handleCambioNuevo = useCallback((key, value) =>
    setNuevoVacio((prev) => ({ ...prev, [key]: value })), []);

  const handleGuardarNuevo = useCallback(async () => {
    try {
      await agregar(nuevoVacio);
      setNuevoVacio(VACIO_VACIO);
      setModoAgregar(false);
      setNotif({ tipo: "ok", msg: "Vacío agregado correctamente." });
    } catch {
      setNotif({ tipo: "error", msg: "Error al agregar el vacío." });
    }
  }, [nuevoVacio, agregar, VACIO_VACIO]);

  const handleCancelarNuevo = useCallback(() => {
    setModoAgregar(false);
    setNuevoVacio(VACIO_VACIO);
  }, [VACIO_VACIO]);

  // ── Filtro por búsqueda — solo sobre datos ya cargados ────────────────────
  const vaciosFiltrados = busqueda
    ? vacios.filter((v) =>
        Object.values(v).some((val) =>
          String(val).toLowerCase().includes(busqueda.toLowerCase())
        )
      )
    : vacios;

  // ── Estados de carga / error ──────────────────────────────────────────────

  if (loading) return (
    <div className="vacios-container">
      <h1 className="vacios-title"><Package size={36} className="title-icon" /> Vacíos</h1>
      <div className="loading-box"><p className="loading-text">Cargando datos…</p></div>
    </div>
  );

  if (error) return (
    <div className="vacios-container">
      <h1 className="vacios-title"><Package size={36} className="title-icon" /> Vacíos</h1>
      <div className="error-box">
        <h2 className="error-title">¡Ups!</h2>
        <p className="error-text">Error al conectar con el servidor: {error}</p>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="vacios-container">
      {isAdmin && (
        <button
          className="vacios-admin-btn"
          onClick={() => navigate("../admin-vacios")}
        >
          ⚙ Admin Vacíos
        </button>
      )}

      <h1 className="vacios-title">
        <Package size={36} className="title-icon" /> Vacíos
      </h1>

      <SearchBar value={busqueda} onChange={setBusqueda} />

      {notif && (
        <div className={`notif notif-${notif.tipo}`} role="alert" aria-live="polite">
          {notif.msg}
        </div>
      )}

      <div className="toolbar">
        <div className="filtros-status" />
        <button
          className="btn-agregar"
          onClick={() => setModoAgregar(true)}
          disabled={modoAgregar}
        >
          + Agregar Vacío
        </button>
      </div>

      <div className="table-responsive">
        <table className="vacios-table">
          <thead>
            <tr>
              {COLUMNAS.map((col) => <th key={col.key}>{col.label}</th>)}
              <th style={{ textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {modoAgregar && (
              <FilaNueva
                datos={nuevoVacio}
                onChange={handleCambioNuevo}
                onGuardar={handleGuardarNuevo}
                onCancelar={handleCancelarNuevo}
              />
            )}

            {vaciosFiltrados.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNAS.length + 1}
                  style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}
                >
                  No hay vacíos que mostrar
                </td>
              </tr>
            ) : (
              vaciosFiltrados.map((vacio) => (
                <tr key={vacio.id}>
                  {COLUMNAS.map((col) => (
                    <td key={col.key}>{vacio[col.key]}</td>
                  ))}
                  <td>
                    <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
                      <button
                        className="btn-icon btn-editar"
                        onClick={() => handleAbrirEdicion(vacio)}
                        aria-label="Editar vacío"
                        title="Editar"
                      >
                        <ArrowDown size={18} />
                      </button>
                      {isAdmin && (
                        <button
                          className="btn-icon btn-eliminar"
                          onClick={() => handleEliminar(vacio.id)}
                          aria-label="Eliminar vacío"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {loadingMore && (
        <div className="loading-more" aria-live="polite">
          <span className="loading-more-spinner" />
          Cargando más registros…
        </div>
      )}

      {!hasMore && vacios.length > 0 && !loadingMore && (
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