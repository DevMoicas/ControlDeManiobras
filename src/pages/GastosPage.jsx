import { useState, useEffect, useCallback } from "react";
import { useAuthContext } from "../context/AuthContext";
import { useNavigate } from 'react-router-dom';
import { Receipt, Trash2, SquarePen, CircleDollarSign } from "lucide-react";
import { useGastos } from "../hooks/useGastos";
import SearchBar from "../components/SearchBar/SearchBar";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from "react-datepicker";
import es from "date-fns/locale/es";
import "./GastosPage.css";
registerLocale("es", es);

function fechaParaMostrar(valor) {
  if (!valor) return "";
  const [y, m, d] = valor.split("-");
  if (!y || !m || !d) return valor;
  return `${d}/${m}/${y}`;
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


//Hook para cargar maniobras disponibles
function useManiobras() {
  const [maniobras, setManiobras] = useState([]);
  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/maniobras/")
    .then(r => r.json())
    .then(data => setManiobras(Array.isArray(data) ? data : data.results || []))
    .catch(() => {});
  }, []);
  return maniobras;
}
// ── Definición de Columnas según tu DB ────────────────────────────────────────

const COLUMNAS = [
  { key: "maniobra", label: "carta_porte" },
  { key: "fecha_entrega_mercancia", label: "Fecha Entrega", isFecha: true },
  { key: "casetas_ida", label: "Casetas Ida" },
  { key: "casetas_regreso", label: "Casetas Regreso" },
  { key: "gastos_adicionales", label: "G. Adicionales" },
  { key: "entregado", label: "Entregado" },
  { key: "gasto_tag", label: "Tag" },
  { key: "gasto_diesel", label: "Diesel" },
  { key: "comision_operador", label: "Comisión Op." },
  { key: "reparaciones", label: "Reparaciones" },
  { key: "gastos_totales", label: "G. Totales", style: { fontWeight: 'bold', color: '#d61b1b' } },
  { key: "facturado", label: "Ingresos", style: { fontWeight: 'bold', color: '#0b0c06' }  },
  { key: "utilidad_bruta", label: "Utilidad Bruta", isComputed: true, style: { fontWeight: 'bold', color: '#059669' } },
  { key: "descripcion_gastos", label: "Descripción" },
];

const GASTO_VACIO = {
  maniobra: "",  // el usuario escribe el ID de la maniobra
  fecha_entrega_mercancia: "", casetas_ida: 0, casetas_regreso: 0,
  gastos_adicionales: 0, entregado: 0, gasto_tag: 0, gasto_diesel: 0,
  comision_operador: 0, reparaciones: 0, facturado: "", descripcion_gastos: ""
  // gastos_totales lo quitas porque es calculado
};

const MODAL_CERRADO = { abierto: false, datos: null };

// ── Sub-componente: fila de inputs para nuevo gasto ──────────────────────────

function FilaNueva({ datos, onChange, onGuardar, onCancelar, isSubmitting, maniobras }) {
  return (
    <tr>
      {/* Dropdown para carta porte */}
      <td>
        <select
        value= {datos.maniobra}
        onChange={(e) => onChange("maniobra", e.target.value)}
        aria-label="Carta Porte"
        >
          <option value="">Seleccionar...</option>
          {maniobras.map((m) => (
            <option key={m.id} value={m.id}>
              {m.folio || `ID ${m.id}`}
            </option>
          ))}
        </select>
      </td>

      {/*Resto de columnas sin maniobra */}
      {COLUMNAS.slice(1).map((col) => (
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
          ) : col.isComputed ? (
            <input
              value={(() => {
                const ingreso = Number(datos.facturado || 0);
                const total = Number(datos.gastos_totales || 0);
                const utilidad = ingreso - total;
                return isNaN(utilidad) ? "" : `$${utilidad.toFixed(2)}`;
              })()}
              aria-label={col.label}
              disabled
              style={{ color: '#059669', fontWeight: 'bold' }}
            />
          ) : (
            <input
              value={datos[col.key] ?? ""}
              onChange={(e) => onChange(col.key, e.target.value)}
              placeholder={col.label}
              aria-label={col.label}
              disabled={col.key === "gastos_totales"}
            />
          )}
        </td>
      ))}

      <td>
        <div style={{ display: "flex", gap: "4px" }}>
          <button className="btn-accion btn-guardar-fila" onClick={onGuardar} disabled={isSubmitting}>
            {isSubmitting ? '...' : 'Guardar'}
          </button>
          <button className="btn-accion btn-cancelar-fila" onClick={onCancelar} disabled={isSubmitting}>
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Sub-componente: modal de edición ──────────────────────────────────────────

function ModalEditar({ datos, onChange, onGuardar, onCerrar, isSubmitting, maniobras }) {
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
        <h2 id="modal-titulo" className="modal-titulo">Editar Gasto</h2>
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
                ) : col.isComputed ? (
                  <input
                    id={`edit-${col.key}`}
                    value={(() => {
                      const ingreso = Number(datos.facturado || 0);
                      const total = Number(datos.gastos_totales || 0);
                      const utilidad = ingreso - total;
                      return isNaN(utilidad) ? "" : `$${utilidad.toFixed(2)}`;
                    })()}
                    aria-label={col.label}
                    disabled
                    style={{ color: '#059669', fontWeight: 'bold' }}
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
            <button type="button" className="btn-cancelar" onClick={onCerrar} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="btn-guardar" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function GastosPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuthContext();
  const { gastos, loading, error, eliminar, actualizar, agregar } = useGastos();

  const [modoAgregar, setModoAgregar] = useState(false);
  const [nuevoGasto, setNuevoGasto] = useState(GASTO_VACIO);
  const [modal, setModal]                 = useState(MODAL_CERRADO);
  const [notif, setNotif]                 = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const maniobras = useManiobras();

  // ── Formateador de moneda ───────────────────────────────────────────────────
  const formatMoneda = (valor) => {
    if (valor == null || valor === "") return "";
    const num = Number(valor);
    if (isNaN(num)) return valor;
    return `$${num.toFixed(2)}`;
  };

  const columnasMoneda = [
    'casetas_ida', 'casetas_regreso', 'gastos_adicionales', 
    'entregado', 'gasto_tag', 'gasto_diesel', 
    'comision_operador', 'reparaciones', 'gastos_totales'
  ];

  // ── Auto-dismiss de notificaciones ──────────────────────────────────────────
  useEffect(() => {
    if (!notif) return;
    const t = setTimeout(() => setNotif(null), 3000);
    return () => clearTimeout(t);
  }, [notif]);

  // ── Handlers CRUD ────────────────────────────────────────────────────────────

  const handleEliminar = useCallback(async (id) => {
  if (!isAdmin) {
    setNotif({ tipo: "error", msg: "No tienes permisos para eliminar." });
    return;
  }

  if (!window.confirm("¿Estás seguro de que deseas eliminar este gasto?")) return;

  setIsSubmitting(true);
  try {
    await eliminar(id);
    setNotif({ tipo: "ok", msg: "Gasto eliminado correctamente." });
  } catch {
    setNotif({ tipo: "error", msg: "Error al eliminar el gasto." });
  } finally {
    setIsSubmitting(false);
  }
}, [eliminar, isAdmin]);

  const handleAbrirEdicion = useCallback((gasto) => {
    setModal({ abierto: true, datos: { ...gasto } });
  }, []);

  const handleCambioModal = useCallback((key, value) => {
    setModal((prev) => ({ ...prev, datos: { ...prev.datos, [key]: value } }));
  }, []);

  const handleGuardarEdicion = useCallback(async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await actualizar(modal.datos.id, modal.datos);
      setNotif({ tipo: "ok", msg: "Gasto actualizado correctamente." });
      setModal(MODAL_CERRADO);
    } catch {
      setNotif({ tipo: "error", msg: "Error al actualizar el gasto." });
    } finally {
      setIsSubmitting(false);
    }
  }, [modal.datos, actualizar]);

  const handleCambioNueva = useCallback((key, value) => {
    setNuevoGasto((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleGuardarNueva = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await agregar(nuevoGasto);
      setNuevoGasto(GASTO_VACIO);
      setModoAgregar(false);
      setNotif({ tipo: "ok", msg: "Gasto agregado correctamente." });
    } catch {
      setNotif({ tipo: "error", msg: "Error al agregar el gasto." });
    } finally {
      setIsSubmitting(false);
    }
  }, [nuevoGasto, agregar]);

  const handleCancelarNueva = useCallback(() => {
    setModoAgregar(false);
    setNuevoGasto(GASTO_VACIO);
  }, []);

  // ── Estados de carga / error ─────────────────────────────────────────────────

  if (loading) return (
    <div className="gastos-container">
      <h1 className="gastos-title"><Receipt size={36} className="title-icon" /> Gastos</h1>
      <div className="loading-box"><p className="loading-text">Cargando datos…</p></div>
    </div>
  );

  if (error) return (
    <div className="gastos-container">
      <h1 className="gastos-title"><Receipt size={36} className="title-icon" /> Gastos</h1>
      <div className="error-box">
        <h2 className="error-title">¡Ups!</h2>
        <p className="error-text">Error al conectar con el servidor: {error}</p>
      </div>
    </div>
  );

  // ── Render principal ─────────────────────────────────────────────────────────

  const gastosFiltrados = gastos.filter((g) => {
    // 🔹 FILTRO POR BÚSQUEDA
    const cumpleBusqueda = !busqueda || Object.values(g).some((valor) =>
      String(valor).toLowerCase().includes(busqueda.toLowerCase())
    );

    return cumpleBusqueda;
  });

  return (
    <div className="gastos-container">
      {isAdmin && (
        <button className="gastos-admin-btn" onClick={() => navigate('../admin-gastos')}>
          ⚙ Admin Gastos
        </button>
      )}

      <h1 className="gastos-title">
        <CircleDollarSign size={45} className="title-icon" /> GASTOS
      </h1>
      
      {/* BARRA DE BÚSQUEDA */}
      <SearchBar value={busqueda} onChange={setBusqueda} />
      
      {notif && (
        <div className={`notif notif-${notif.tipo}`} role="alert" aria-live="polite">
          {notif.msg}
        </div>
      )}

      <div className="toolbar">
        {/* Espaciador vacío para empujar el botón a la derecha igual que en Maniobras */}
        <div className="filtros-status"></div>

        <button
          className="btn-agregar"
          onClick={() => setModoAgregar(true)}
          disabled={modoAgregar || isSubmitting}
        >
          + Agregar Registro
        </button>
      </div>

      <div className="table-responsive">
        <table className="gastos-table">
          <thead>
            <tr>
              {COLUMNAS.map((col) => <th key={col.key}>{col.label}</th>)}
              <th style={{ textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {modoAgregar && (
              <FilaNueva
                datos={nuevoGasto}
                onChange={handleCambioNueva}
                onGuardar={handleGuardarNueva}
                onCancelar={handleCancelarNueva}
                isSubmitting={isSubmitting}
                maniobras={maniobras}
              />
            )}

            {gastosFiltrados.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNAS.length + 1}
                  style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}
                >
                  No hay gastos que mostrar con el filtro actual
                </td>
              </tr>
            ) : (
              gastosFiltrados.map((gasto) => (
                <tr key={gasto.id}>
                  {COLUMNAS.map((col) => (
                    <td key={col.key} style={col.style ?? {}}>
                      {col.isComputed
                        ? formatMoneda(Number(gasto.facturado || 0) - Number(gasto.gastos_totales || 0))
                        : col.isFecha
                        ? fechaParaMostrar(gasto[col.key])
                        : columnasMoneda.includes(col.key)
                        ? formatMoneda(gasto[col.key])
                        : gasto[col.key]
                      }
                    </td>
                  ))}

                  {/* ── Columna Acciones ─────────────────────────────── */}
                  <td>
                    <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
                      
                      {/* EDITAR → TODOS */}
                      <button
                        className="btn-icon btn-editar"
                        onClick={() => handleAbrirEdicion(gasto)}
                        aria-label="Editar gasto"
                        title="Editar"
                        disabled={isSubmitting}
                      >
                        <SquarePen size={18} />
                      </button>

                      {/* ELIMINAR → SOLO ADMIN */}
                      {isAdmin && (
                        <button
                          className="btn-icon btn-eliminar"
                          onClick={() => handleEliminar(gasto.id)}
                          aria-label="Eliminar gasto"
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

      {modal.abierto && modal.datos && (
        <ModalEditar
          datos={modal.datos}
          onChange={handleCambioModal}
          onGuardar={handleGuardarEdicion}
          onCerrar={() => setModal(MODAL_CERRADO)}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}