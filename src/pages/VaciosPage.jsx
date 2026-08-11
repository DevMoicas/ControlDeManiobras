import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { overlayMotion, contentMotion } from "../animations/modalMotion";
import { Trash2, SquarePen, Camera, Settings, X } from "lucide-react";
import { useVacios } from "../hooks/useVacios";
import { useAuthContext } from "../context/AuthContext";
import { useVacioStatusUpdate } from "../hooks/useVacioStatusUpdate";
import SearchBar from "../components/SearchBar/SearchBar";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import { useNavigate } from "react-router-dom";
import VacioStatusSelector, { EIR_STATUSES } from "../components/VacioStatusSelector/VacioStatusSelector";
import OperadorSelector from "../components/OperadorSelector/OperadorSelector";
import TransportistaSelector from "../components/TransportistaSelector/TransportistaSelector";
import PatioSelector from "../components/PatioSelector/PatioSelector";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from "react-datepicker";
import es from "date-fns/locale/es";
import FotoModal from "../components/FotoModal/FotoModal";
import "./VaciosPage.css";
registerLocale("es", es);

function fechaParaMostrar(valor) {
  if (!valor) return "";
  const [y, m, d] = valor.split("-");
  if (!y || !m || !d) return valor;
  return `${d}/${m}/${y}`;
}

function fechaParaBackend(valor) {
  if (!valor) return "";
  const [d, m, y] = valor.split("/");
  if (!y || !m || !d) return valor;
  return `${y}-${m}-${d}`;
}

function fechaADate(valorYYYYMMDD) {
  if (!valorYYYYMMDD) return null;
  const parts = valorYYYYMMDD.split("-");
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  if (isNaN(d.getTime())) return null;
  return d;
}

function dateAFechaBackend(dateObject) {
  if (!dateObject) return "";
  const y = dateObject.getFullYear();
  const m = String(dateObject.getMonth() + 1).padStart(2, "0");
  const d = String(dateObject.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const COLUMNAS = [
  { key: "contenedor",                label: "Contenedor" },
  { key: "patio",                     label: "Patio",             isPatio: true },
  { key: "fecha_maniobra",            label: "Fecha Maniobra",  isFecha: true },
  { key: "fecha_entrega",             label: "Fecha Entrega",   isFecha: true },
  { key: "fecha_notificacion_cliente",label: "Cometarios" },
  { key: "status",                    label: "Status",            isStatus: true },
  { key: "status_eir",                label: "Status EIR",        isStatusEir: true },
  { key: "operador",                  label: "OP del Viaje",      isOperador: true },
  { key: "transportista",             label: "Transportista",     isTransportista: true },
  { key: "operador_entrega",          label: "Entregó",           isOperadorEntrega: true },
  { key: "cita",                      label: "Cita" },
  { key: "cd",                        label: "CD" },
];

// Vista por defecto: Pendientes (primero). El filtro se resuelve en backend
// (useVacios → ?status=…). "todos" no filtra.
const FILTROS = [
  { id: "pendiente", label: "Pendientes" },
  { id: "todos",     label: "Todos" },
  { id: "entregado", label: "Entregados" },
];

const MODAL_CERRADO = { abierto: false, datos: null };

// ── Sub-componente: fila nueva ────────────────────────────────────────────────

function FilaNueva({ datos, onChange, onGuardar, onCancelar, isSubmitting }) {
  return (
    <tr>
      {COLUMNAS.map((col) => (
        <td key={col.key}>
          {col.isFecha ? (
            <DatePicker
              locale="es"
              dateFormat="dd/MM/yyyy"
              selected={fechaADate(datos[col.key])}
              onChange={(date) => onChange(col.key, dateAFechaBackend(date))}
              placeholderText="DD/MM/YYYY"
              className="date-picker-input"
              isClearable
              disabled={isSubmitting}
            />
          ) : col.isStatus ? (
            <VacioStatusSelector
              currentStatus={datos[col.key] || ""}
              onSelect={(val) => onChange(col.key, val)}
              loading={false}
            />
          ) : col.isStatusEir ? (
            <VacioStatusSelector
              opciones={EIR_STATUSES}
              currentStatus={datos[col.key] || ""}
              onSelect={(val) => onChange(col.key, val)}
              loading={false}
            />
          ) : col.isOperador ? (
            <OperadorSelector
              currentValue={datos[col.key] || ""}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
              opcionesExtra={["Tercero"]}
            />
          ) : col.isTransportista ? (
            <TransportistaSelector
              currentValue={datos[col.key] || ""}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
          ) : col.isOperadorEntrega ? (
            <OperadorSelector
              currentValue={datos[col.key] || ""}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
              transportista={datos.transportista}
            />
          ) : col.isPatio ? (
            <PatioSelector
              currentValue={datos[col.key] || ""}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
          ) : (
            <input
              value={datos[col.key] || ""}
              onChange={(e) => onChange(col.key, e.target.value)}
              placeholder={col.label}
              aria-label={col.label}
            />
          )}
        </td>
      ))}
      <td>
        <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
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
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-titulo"
      {...overlayMotion}
    >
      <motion.div className="modal-content" {...contentMotion}>
        <div className="modal-header">
          <h2 id="modal-titulo" className="modal-titulo">Editar Vacío</h2>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={onGuardar} className="modal-form">
          <div className="modal-grid">
            {COLUMNAS.map((col) => (
              <div key={col.key} className="modal-campo">
                <label htmlFor={`edit-${col.key}`}>{col.label}</label>
                {col.isFecha ? (
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
                ) : col.isStatus ? (
                  <VacioStatusSelector
                    currentStatus={datos[col.key] || ""}
                    onSelect={(val) => onChange(col.key, val)}
                    loading={false}
                  />
                ) : col.isStatusEir ? (
                  <VacioStatusSelector
                    opciones={EIR_STATUSES}
                    currentStatus={datos[col.key] || ""}
                    onSelect={(val) => onChange(col.key, val)}
                    loading={false}
                  />
                ) : col.isOperador ? (
                  <OperadorSelector
                    currentValue={datos[col.key] || ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                    opcionesExtra={["Tercero"]}
                  />
                ) : col.isTransportista ? (
                  <TransportistaSelector
                    currentValue={datos[col.key] || ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isOperadorEntrega ? (
                  <OperadorSelector
                    currentValue={datos[col.key] || ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                    transportista={datos.transportista}
                  />
                ) : col.isPatio ? (
                  <PatioSelector
                    currentValue={datos[col.key] || ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : (
                  <input
                    id={`edit-${col.key}`}
                    value={datos[col.key] || ""}
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
      </motion.div>
    </motion.div>
  );
}

// ── Encabezado ────────────────────────────────────────────────────────────────
// Mismo patrón que Movimientos Locales y Documentos de Viaje: antetítulo, título
// y entradilla. Se reutiliza en los tres estados de la página (carga, error, tabla).
function Intro() {
  return (
    <header className="vp-intro">
      <p className="vp-eyebrow">Patio de contenedores</p>
      <h1 className="vacios-title">Vacíos</h1>
      <p className="vp-lead">
        Controla la entrada y salida de contenedores vacíos y su estado en patio.
      </p>
    </header>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function VaciosPage() {
  const navigate = useNavigate();
  const [filtroStatus, setFiltroStatus] = useState("pendiente");
  const {
    vacios, setVacios, loading, loadingMore, hasMore, error,
    loadMore, eliminar, actualizar, agregar, VACIO_VACIO,
  } = useVacios(filtroStatus);
  const { isAdmin } = useAuthContext();
  const { updatingId, updateStatus } = useVacioStatusUpdate(setVacios);
  // Mismo hook genérico apuntando a la otra columna de status del vacío: PATCH
  // /vacios/{id}/ { status_eir }, optimista y con rollback.
  const {
    updatingId: updatingEirId,
    updateStatus: updateEirStatus,
  } = useVacioStatusUpdate(setVacios, { campo: "status_eir" });

  const [modoAgregar, setModoAgregar] = useState(false);
  const [nuevoVacio,  setNuevoVacio]  = useState(VACIO_VACIO);
  const [modal,       setModal]       = useState(MODAL_CERRADO);
  const setNotif = useAlerta();
  const preguntar = useConfirmacion();
  const [busqueda,    setBusqueda]    = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fotoModal,   setFotoModal]   = useState(null); // { registroId } | null

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

  // ── Handlers CRUD ─────────────────────────────────────────────────────────

  const handleEliminar = useCallback(async (id) => {
    if (!isAdmin) {
      setNotif({ tipo: "error", msg: "No tienes permisos para eliminar." });
      return;
    }
    if (!await preguntar({
      titulo: "Eliminar vacío",
      mensaje: "Se borrará el registro completo. No se puede deshacer.",
      accion: "Eliminar",
      peligro: true,
    })) return;
    setIsSubmitting(true);
    try {
      await eliminar(id);
      setNotif({ tipo: "ok", msg: "Vacío eliminado correctamente." });
    } catch {
      setNotif({ tipo: "error", msg: "Error al eliminar el vacío." });
    } finally {
      setIsSubmitting(false);
    }
  }, [eliminar, isAdmin]);

  const handleAbrirEdicion  = useCallback((v) => setModal({ abierto: true, datos: { ...v } }), []);
  const handleCambioModal   = useCallback((key, value) =>
    setModal((prev) => ({ ...prev, datos: { ...prev.datos, [key]: value } })), []);

  const handleGuardarEdicion = useCallback(async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await actualizar(modal.datos.id, modal.datos);
      setNotif({ tipo: "ok", msg: "Vacío actualizado correctamente." });
      setModal(MODAL_CERRADO);
    } catch (err) {
      setNotif({ tipo: "error", msg: err.message || "Error al actualizar el vacío." });
    } finally {
      setIsSubmitting(false);
    }
  }, [modal.datos, actualizar]);

  const handleCambioNuevo = useCallback((key, value) =>
    setNuevoVacio((prev) => ({ ...prev, [key]: value })), []);

  const handleGuardarNuevo = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await agregar(nuevoVacio);
      setNuevoVacio(VACIO_VACIO);
      setModoAgregar(false);
      setNotif({ tipo: "ok", msg: "Vacío agregado correctamente." });
    } catch (err) {
      setNotif({ tipo: "error", msg: err.message || "Error al agregar el vacío." });
    } finally {
      setIsSubmitting(false);
    }
  }, [nuevoVacio, agregar, VACIO_VACIO]);

  const handleCancelarNuevo = useCallback(() => {
    setModoAgregar(false);
    setNuevoVacio(VACIO_VACIO);
  }, [VACIO_VACIO]);

  const handleStatusChange = useCallback(async (vacio, nuevoStatus) => {
    try {
      await updateStatus(vacio, nuevoStatus);
      setNotif({ tipo: "ok", msg: "Status actualizado." });
    } catch (err) {
      setNotif({ tipo: "error", msg: `Error al cambiar status: ${err.message}` });
    }
  }, [updateStatus]);

  const handleEirStatusChange = useCallback(async (vacio, nuevoStatus) => {
    try {
      await updateEirStatus(vacio, nuevoStatus);
      setNotif({ tipo: "ok", msg: "Status EIR actualizado." });
    } catch (err) {
      setNotif({ tipo: "error", msg: `Error al cambiar status EIR: ${err.message}` });
    }
  }, [updateEirStatus]);

  const handleOperadorChange = useCallback(async (vacio, nombreSeleccionado) => {
    const prevOperador = vacio.operador;
    setVacios((prev) =>
      prev.map((v) => (v.id === vacio.id ? { ...v, operador: nombreSeleccionado } : v))
    );
    try {
      await actualizar(vacio.id, { ...vacio, operador: nombreSeleccionado });
      setNotif({ tipo: "ok", msg: "Operador actualizado." });
    } catch (err) {
      setVacios((prev) =>
        prev.map((v) => (v.id === vacio.id ? { ...v, operador: prevOperador } : v))
      );
      setNotif({ tipo: "error", msg: `Error al cambiar operador: ${err.message}` });
    }
  }, [actualizar, setVacios]);

  const handlePatioChange = useCallback(async (vacio, nombreSeleccionado) => {
    const prevPatio = vacio.patio;
    setVacios((prev) =>
      prev.map((v) => (v.id === vacio.id ? { ...v, patio: nombreSeleccionado } : v))
    );
    try {
      await actualizar(vacio.id, { ...vacio, patio: nombreSeleccionado });
      setNotif({ tipo: "ok", msg: "Patio actualizado." });
    } catch (err) {
      setVacios((prev) =>
        prev.map((v) => (v.id === vacio.id ? { ...v, patio: prevPatio } : v))
      );
      setNotif({ tipo: "error", msg: `Error al cambiar patio: ${err.message}` });
    }
  }, [actualizar, setVacios]);

  const handleTransportistaChange = useCallback(async (vacio, nombreSeleccionado) => {
    const prevTransportista = vacio.transportista;
    setVacios((prev) =>
      prev.map((v) => (v.id === vacio.id ? { ...v, transportista: nombreSeleccionado } : v))
    );
    try {
      await actualizar(vacio.id, { ...vacio, transportista: nombreSeleccionado });
      setNotif({ tipo: "ok", msg: "Transportista actualizado." });
    } catch (err) {
      setVacios((prev) =>
        prev.map((v) => (v.id === vacio.id ? { ...v, transportista: prevTransportista } : v))
      );
      setNotif({ tipo: "error", msg: `Error al cambiar transportista: ${err.message}` });
    }
  }, [actualizar, setVacios]);

  const handleOperadorEntregaChange = useCallback(async (vacio, nombreSeleccionado) => {
    const prevOperadorEntrega = vacio.operador_entrega;
    setVacios((prev) =>
      prev.map((v) => (v.id === vacio.id ? { ...v, operador_entrega: nombreSeleccionado } : v))
    );
    try {
      await actualizar(vacio.id, { ...vacio, operador_entrega: nombreSeleccionado });
      setNotif({ tipo: "ok", msg: "Operador de entrega actualizado." });
    } catch (err) {
      setVacios((prev) =>
        prev.map((v) => (v.id === vacio.id ? { ...v, operador_entrega: prevOperadorEntrega } : v))
      );
      setNotif({ tipo: "error", msg: `Error al cambiar operador: ${err.message}` });
    }
  }, [actualizar, setVacios]);

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
      <Intro />
      <div className="loading-box"><p className="loading-text">Cargando datos…</p></div>
    </div>
  );

  if (error) return (
    <div className="vacios-container">
      <Intro />
      <div className="error-box">
        <h2 className="error-title">No se pudo cargar</h2>
        <p className="error-text">No hay conexión con el servidor: {error}</p>
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
          <Settings size={16} /> Admin Vacíos
        </button>
      )}

      <Intro />

      <div className="vp-search">
        <SearchBar value={busqueda} onChange={setBusqueda} />
      </div>

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
                isSubmitting={isSubmitting}
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
                    <td key={col.key}>
                      {col.isStatus ? (
                        <VacioStatusSelector
                          currentStatus={vacio.status}
                          onSelect={(nuevoStatus) => handleStatusChange(vacio, nuevoStatus)}
                          loading={updatingId === vacio.id}
                        />
                      ) : col.isStatusEir ? (
                        <VacioStatusSelector
                          opciones={EIR_STATUSES}
                          currentStatus={vacio.status_eir}
                          onSelect={(nuevoStatus) => handleEirStatusChange(vacio, nuevoStatus)}
                          loading={updatingEirId === vacio.id}
                        />
                      ) : col.isOperador ? (
                        <OperadorSelector
                          currentValue={vacio.operador}
                          onSelect={(nombre) => handleOperadorChange(vacio, nombre)}
                          opcionesExtra={["Tercero"]}
                        />
                      ) : col.isTransportista ? (
                        <TransportistaSelector
                          currentValue={vacio.transportista || ""}
                          onSelect={(nombre) => handleTransportistaChange(vacio, nombre)}
                        />
                      ) : col.isOperadorEntrega ? (
                        <OperadorSelector
                          currentValue={vacio.operador_entrega || ""}
                          onSelect={(nombre) => handleOperadorEntregaChange(vacio, nombre)}
                          transportista={vacio.transportista}
                        />
                      ) : col.isPatio ? (
                        <PatioSelector
                          currentValue={vacio.patio}
                          onSelect={(nombre) => handlePatioChange(vacio, nombre)}
                        />
                      ) : col.isFecha ? (
                        fechaParaMostrar(vacio[col.key])
                      ) : (
                        vacio[col.key]
                      )}
                    </td>
                  ))}
                  <td>
                    <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
                      <button
                        className="btn-icon btn-editar"
                        onClick={() => handleAbrirEdicion(vacio)}
                        aria-label="Editar vacío"
                        title="Editar"
                        disabled={isSubmitting}
                      >
                        <SquarePen size={18} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon btn-foto"
                        onClick={() => setFotoModal({ registroId: vacio.id })}
                        aria-label="Ver fotos del vacío"
                        title="Fotos"
                        disabled={isSubmitting}
                      >
                        <Camera size={18} />
                      </button>
                      {isAdmin && (
                        <button
                          className="btn-icon btn-eliminar"
                          onClick={() => handleEliminar(vacio.id)}
                          aria-label="Eliminar vacío"
                          title="Eliminar"
                          disabled={isSubmitting}
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

      <AnimatePresence>
        {modal.abierto && modal.datos && (
          <ModalEditar
            datos={modal.datos}
            onChange={handleCambioModal}
            onGuardar={handleGuardarEdicion}
            onCerrar={() => setModal(MODAL_CERRADO)}
            isSubmitting={isSubmitting}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fotoModal && (
          <FotoModal
            tipo="vacio"
            registroId={fotoModal.registroId}
            onCerrar={() => setFotoModal(null)}
            isAdmin={isAdmin}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
