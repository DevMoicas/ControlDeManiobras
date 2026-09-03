import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { overlayMotion, contentMotion } from "../animations/modalMotion";
import { useAuthContext } from "../context/AuthContext";
import { useNavigate } from 'react-router-dom';
import { Trash2, SquarePen, Settings, X } from "lucide-react";
import { useGastos } from "../hooks/useGastos";
import FolioSelector from "../components/FolioSelector/FolioSelector";
import SearchBar from "../components/SearchBar/SearchBar";
import { filtrarBusqueda } from "../utils/buscar.mjs";
import { evaluarSuma } from "../utils/formulaSuma.mjs";
import CeldaEditable from "../components/CeldaEditable/CeldaEditable";
import ColorSelector from "../components/ColorSelector/ColorSelector";
import { esColorValido, textoSobre } from "../utils/colorFila.mjs";
import BotonArriba from "../components/BotonArriba/BotonArriba";
import PinturaCeldas, { usePinturaCeldas } from "../components/PinturaCeldas/PinturaCeldas";
import BarraScrollTabla from "../components/BarraScrollTabla/BarraScrollTabla";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
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


// ── Definición de Columnas según tu DB ────────────────────────────────────────

// Las columnas sin `isComputed` ni `maniobra` se editan con un clic en la propia
// celda (ver CeldaEditable). `gastos_totales` queda fuera: es read_only en el
// serializer, lo recalcula Gasto.save() sumando el resto.
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
  { key: "facturado", label: "Ingresos", max: 50, style: { fontWeight: 'bold', color: '#0b0c06' }  },
  { key: "utilidad_bruta", label: "Utilidad Bruta", isComputed: true, style: { fontWeight: 'bold', color: '#059669' } },
  { key: "descripcion_gastos", label: "Descripción" },
  // Operador y destino salen de la maniobra del folio elegido (read_only en el
  // GastoSerializer). No se editan aquí: se cambian en Maniobras.
  { key: "operador", label: "Operador", readOnly: true },
  { key: "destino", label: "Destino", readOnly: true },
  { key: "unidad", label: "Unidad", max: 100 },
];

// Columnas DecimalField: se muestran como moneda y, al vaciarlas, viajan como
// null — "" no es un número válido para DRF y devolvería un 400 opaco.
const COLUMNAS_MONEDA = [
  'casetas_ida', 'casetas_regreso', 'gastos_adicionales',
  'entregado', 'gasto_tag', 'gasto_diesel',
  'comision_operador', 'reparaciones', 'gastos_totales',
];

// INGRESOS y UTILIDAD BRUTA son el margen del viaje: solo las ve un usuario
// staff (rol admin). Esconderlas aqui es comodidad, no seguridad — quien de
// verdad las oculta es el backend, que no manda `facturado` a un usuario
// estandar (ver GastoSerializer.get_fields). UTILIDAD BRUTA ni siquiera existe
// en la base: se calcula restando, asi que se va con ella.
const SOLO_ADMIN = ["facturado", "utilidad_bruta"];

const columnasVisibles = (isAdmin) =>
  (isAdmin ? COLUMNAS : COLUMNAS.filter((col) => !SOLO_ADMIN.includes(col.key)));

const GASTO_VACIO = {
  maniobra: "",  // id de la maniobra elegida en el FolioSelector
  folio: "",     // folio visible; useGastos.agregar lo excluye del POST
  fecha_entrega_mercancia: "", casetas_ida: 0, casetas_regreso: 0,
  gastos_adicionales: 0, entregado: 0, gasto_tag: 0, gasto_diesel: 0,
  comision_operador: 0, reparaciones: 0, facturado: "", descripcion_gastos: "",
  // operador y destino los rellena el FolioSelector solo para verlos en la fila
  // nueva; el backend los ignora al escribir (read_only) y los devuelve al leer.
  operador: "", destino: "", unidad: ""
  // gastos_totales lo quitas porque es calculado
};

// Props de pintado de una fila. Mismo contrato que Maniobras y Vacíos: sin un
// color válido no hay clase ni variables, así que la fila vuelve al fondo normal
// y restablecer no tiene que recordar nada.
const propsPintado = (color) => (esColorValido(color)
  ? {
      className: "row-pintada",
      style: { "--color-fila": color, "--texto-fila": textoSobre(color) },
    }
  : {});

const MODAL_CERRADO = { abierto: false, datos: null };

// ── Sub-componente: fila de inputs para nuevo gasto ──────────────────────────

function FilaNueva({ datos, onChange, onGuardar, onCancelar, isSubmitting }) {
  const { isAdmin } = useAuthContext();
  const columnas = columnasVisibles(isAdmin);

  return (
    <tr>
      {/* Selector de carta porte: últimos folios de maniobras */}
      <td>
        <FolioSelector
          currentValue={datos.folio}
          disabled={isSubmitting}
          onSelect={(m) => {
            onChange("maniobra", m.id);
            onChange("folio", m.folio);
            onChange("operador", m.operador || "");
            onChange("destino", m.destino || "");
            // Si la maniobra no tiene fecha de entrega, se queda vacía y el
            // DatePicker sigue ahí para ponerla a mano.
            onChange("fecha_entrega_mercancia", m.fecha_entrega_mercancia || "");
          }}
        />
      </td>

      {/*Resto de columnas sin maniobra */}
      {columnas.slice(1).map((col) => (
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
          ) : col.readOnly ? (
            <input value={datos[col.key] ?? ""} aria-label={col.label} disabled />
          ) : (
            <input
              value={datos[col.key] ?? ""}
              onChange={(e) => onChange(col.key, e.target.value)}
              placeholder={col.label}
              aria-label={col.label}
              maxLength={col.max}
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

function ModalEditar({ datos, onChange, onGuardar, onCerrar, isSubmitting }) {
  const { isAdmin } = useAuthContext();
  const columnas = columnasVisibles(isAdmin);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
          <h2 id="modal-titulo" className="modal-titulo">Editar Gasto</h2>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={onGuardar} className="modal-form">
          <div className="modal-grid">
            {columnas.map((col) => (
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
                ) : col.readOnly ? (
                  <input id={`edit-${col.key}`} value={datos[col.key] ?? ""} disabled />
                ) : (
                  <input
                    id={`edit-${col.key}`}
                    value={datos[col.key] ?? ""}
                    onChange={(e) => onChange(col.key, e.target.value)}
                    maxLength={col.max}
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
      </motion.div>
    </motion.div>
  );
}

// ── Encabezado ────────────────────────────────────────────────────────────────
// Mismo patrón que Movimientos Locales y Documentos de Viaje: antetítulo, título
// y entradilla. Se reutiliza en los tres estados de la página (carga, error, tabla).
function Intro() {
  return (
    <header className="gp-intro">
      <p className="gp-eyebrow">Control de costos</p>
      <h1 className="gastos-title">Gastos</h1>
      <p className="gp-lead">
        Registra los gastos de cada servicio y compara lo facturado con lo gastado.
      </p>
    </header>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function GastosPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuthContext();
  const columnas = columnasVisibles(isAdmin);
  // Balde de celdas: modo pintura + paleta del clic derecho.
  const pintura = usePinturaCeldas();
  const {
    gastos, loading, loadingMore, hasMore, error,
    loadMore, eliminar, actualizar, agregar,
  } = useGastos();

  const [modoAgregar, setModoAgregar] = useState(false);
  const [nuevoGasto, setNuevoGasto] = useState(GASTO_VACIO);
  const [modal, setModal]                 = useState(MODAL_CERRADO);
  const setNotif = useAlerta();
  const preguntar = useConfirmacion();
  const [busqueda, setBusqueda] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tablaRef = useRef(null);

  // ── Scroll listener en window (mismo patrón que Maniobras/Vacíos) ──────────
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

  // ── Formateador de moneda ───────────────────────────────────────────────────
  const formatMoneda = (valor) => {
    if (valor == null || valor === "") return "";
    const num = Number(valor);
    if (isNaN(num)) return valor;
    return `$${num.toFixed(2)}`;
  };

  // ── Handlers CRUD ────────────────────────────────────────────────────────────

  const handleEliminar = useCallback(async (id) => {
  if (!isAdmin) {
    setNotif({ tipo: "error", msg: "No tienes permisos para eliminar." });
    return;
  }

  if (!await preguntar({
    titulo: "Eliminar gasto",
    mensaje: "Se borrará el registro de gastos. No se puede deshacer.",
    accion: "Eliminar",
    peligro: true,
  })) return;

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

  // Guardado desde la tabla. A diferencia de Maniobras y Vacíos, useGastos
  // escribe con PUT (objeto completo), así que se manda la fila entera con el
  // campo cambiado: exactamente el mismo payload que ya envía el modal.
  const handleGuardarCampo = useCallback(async (gasto, campo, valor) => {
    try {
      const limpio = COLUMNAS_MONEDA.includes(campo) && valor === "" ? null : valor;
      await actualizar(gasto.id, { ...gasto, [campo]: limpio });
      setNotif({
        tipo: "ok",
        msg: COLUMNAS.find((c) => c.key === campo)?.label ?? campo,
        // El aviso enseña el TOTAL, no la fórmula: es lo que se guardó.
        // El mapa de colores va aparte: evaluarSuma trabaja sobre texto, y un
        // objeto pintado crudo en el aviso reventaría el render.
        dato: (valor && typeof valor === "object" && !Array.isArray(valor))
          ? (Object.keys(valor).length
              ? `${Object.keys(valor).length} celda(s) pintada(s)`
              : "(sin pintar)")
          : (evaluarSuma(valor) || "(vacío)"),
      });
    } catch (err) {
      setNotif({ tipo: "error", msg: err.message || "Error al actualizar el campo." });
    }
  }, [actualizar]);

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
      <Intro />
      <div className="loading-box"><p className="loading-text">Cargando datos…</p></div>
    </div>
  );

  if (error) return (
    <div className="gastos-container">
      <Intro />
      <div className="error-box">
        <h2 className="error-title">No se pudo cargar</h2>
        <p className="error-text">No hay conexión con el servidor: {error}</p>
      </div>
    </div>
  );

  // ── Render principal ─────────────────────────────────────────────────────────

  // 🔹 FILTRO POR BÚSQUEDA
  // Acepta exclusiones ("-zuñiga") y frases entre comillas; ver utils/buscar.mjs.
  const gastosFiltrados = filtrarBusqueda(gastos, busqueda);

  return (
    <div className="gastos-container">
      {isAdmin && (
        <button className="gastos-admin-btn" onClick={() => navigate('../admin-gastos')}>
          <Settings size={16} /> Admin Gastos
        </button>
      )}

      <Intro />

      {/* BARRA DE BÚSQUEDA */}
      <div className="gp-search">
        <SearchBar
          value={busqueda}
          onChange={setBusqueda}
          placeholder='Buscar…  ("-" excluye. ej: -zuñiga/-"jose zuñiga")'
        />
      </div>

      <div className="toolbar">
        {/* Espaciador vacío para empujar el botón a la derecha igual que en Maniobras */}
        <div className="filtros-status"></div>

        {/* Mismo grupo de acciones que en Maniobras y Vacíos, para que el balde
            caiga en el mismo sitio en las tres tablas. */}
        <div className="toolbar-acciones">
          <PinturaCeldas pintura={pintura} />
          <button
            className="btn-agregar"
            onClick={() => setModoAgregar(true)}
            disabled={modoAgregar || isSubmitting}
          >
            + Agregar Registro
          </button>
        </div>
      </div>

      <div className="bst-zona">

      <BarraScrollTabla contenedorRef={tablaRef} />

      <div className="table-responsive tabla-cabecera-fija" ref={tablaRef}>
        <table className="gastos-table">
          <thead>
            <tr>
              {columnas.map((col) => <th key={col.key}>{col.label}</th>)}
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
              />
            )}

            {gastosFiltrados.length === 0 ? (
              <tr>
                <td
                  colSpan={columnas.length + 1}
                  style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}
                >
                  No hay gastos que mostrar con el filtro actual
                </td>
              </tr>
            ) : (
              gastosFiltrados.map((gasto) => (
                <tr key={gasto.id} {...propsPintado(gasto.color)}>
                  {columnas.map((col) => (
                    // Relleno propio de la celda + los dos gestos de pintura.
                    <td
                      key={col.key}
                      {...pintura.celda(gasto.colores, col.key,
                                        (colores) => handleGuardarCampo(gasto, "colores", colores),
                                        col.style)}
                    >
                      {col.key === "maniobra"
                        ? (gasto.folio || gasto.maniobra) /* folio del servicio; fallback al id para registros viejos */
                        : col.readOnly
                        ? (gasto[col.key] || "") /* viene de la maniobra: se edita en Maniobras, no aquí */
                        : col.isComputed
                        ? formatMoneda(Number(gasto.facturado || 0) - Number(gasto.gastos_totales || 0))
                        : col.key === "gastos_totales"
                        ? formatMoneda(gasto[col.key]) /* read_only: lo recalcula el backend */
                        : col.isFecha
                        ? <CeldaEditable
                            fecha
                            valor={gasto[col.key]}
                            texto={fechaParaMostrar(gasto[col.key])}
                            etiqueta={col.label}
                            onGuardar={(val) => handleGuardarCampo(gasto, col.key, val)}
                          />
                        : <CeldaEditable
                            /* Como en Excel: la tabla enseña el total y al abrir
                               la celda aparece el desglose que se escribió. */
                            valor={gasto.formulas?.[col.key] ?? gasto[col.key]}
                            texto={COLUMNAS_MONEDA.includes(col.key) ? formatMoneda(gasto[col.key]) : undefined}
                            max={col.max}
                            etiqueta={col.label}
                            onGuardar={(val) => handleGuardarCampo(gasto, col.key, val)}
                          />
                      }
                    </td>
                  ))}

                  {/* ── Columna Acciones ─────────────────────────────── */}
                  <td>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>

                      {/* PINTAR LA FILA → TODOS. Mismo balde que Maniobras y
                          Vacíos; el color se guarda en la fila (columna `color`). */}
                      <ColorSelector
                        color={gasto.color}
                        onSelect={(valor) => handleGuardarCampo(gasto, "color", valor)}
                      />

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

      </div>

      {loadingMore && (
        <div className="loading-more" aria-live="polite">
          <span className="loading-more-spinner" />
          Cargando más registros…
        </div>
      )}

      {!hasMore && gastos.length > 0 && !loadingMore && (
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
      <BotonArriba />
    </div>
  );
}