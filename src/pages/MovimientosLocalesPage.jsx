import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { overlayMotion, contentMotion } from "../animations/modalMotion";
import DatePicker, { registerLocale } from "react-datepicker";
import { es } from "date-fns/locale";
import { format, parseISO } from "date-fns";
import { Trash2, SquarePen } from "lucide-react";
import { useAuthContext } from "../context/AuthContext";
import { useMovimientosLocales } from "../hooks/useMovimientosLocales";
import SearchBar from "../components/SearchBar/SearchBar";
import BotonArriba from "../components/BotonArriba/BotonArriba";
import BarraScrollTabla from "../components/BarraScrollTabla/BarraScrollTabla";
import OperadorSelector from "../components/OperadorSelector/OperadorSelector";
import PlacasSelector from "../components/PlacasSelector/PlacasSelector";
import PendientePagadoSelector from "../components/PendientePagadoSelector/PendientePagadoSelector";
import { shift } from "@floating-ui/react";
import "react-datepicker/dist/react-datepicker.css";
import "./MovimientosLocalesPage.css";

registerLocale("es", es);

// ── Constantes ───────────────────────────────────────────────────────────────

// El calendario se saca del árbol a un portal colgado del <body>. Si no, el
// `overflow: hidden` del panel de la tabla —que es deliberado, redondea las
// esquinas— lo recorta, y con una sola fila apenas se veía nada. Es el mismo
// truco que ya usan los selectores de operador y unidad (createPortal).
// react-datepicker crea el nodo solo si no existe.
// Acotado a esta página a propósito: DatePicker se usa en 7 sitios más y no
// se toca ninguno.
const FECHA_PORTAL_ID = "ml-fecha-portal";

// react-datepicker aplica flip() y offset(), pero NO shift(). flip solo voltea
// arriba/abajo: no corrige el eje horizontal, así que en pantallas estrechas el
// calendario se salía por la izquierda y lunes y martes quedaban fuera de la
// pantalla, irrecuperables. shift() lo desliza para mantenerlo dentro del
// viewport con 8px de margen. Se pasa por popperModifiers, que la librería
// añade a su propia lista de middleware de floating-ui.
const FECHA_MIDDLEWARE = [shift({ padding: 8 })];

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
  const { isAdmin } = useAuthContext();

  const {
    movimientos,
    cargando,
    hayMas,
    fetchMovimientos,
    agregar,
    actualizar,
    eliminar,
  } = useMovimientosLocales();

  // ── Filtros y búsqueda ────────────────────────────────────────────────────
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busqueda,     setBusqueda]     = useState("");
  const busquedaRef = useRef(busqueda);
  busquedaRef.current = busqueda;
  const panelRef = useRef(null);

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
          className="ml-input ml-input--fecha"
          isClearable
          portalId={FECHA_PORTAL_ID}
          popperModifiers={FECHA_MIDDLEWARE}
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
          className="ml-input ml-input--inline ml-input--fecha"
          isClearable
          portalId={FECHA_PORTAL_ID}
          popperModifiers={FECHA_MIDDLEWARE}
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
          className="ml-input ml-input--fecha"
          isClearable
          portalId={FECHA_PORTAL_ID}
          popperModifiers={FECHA_MIDDLEWARE}
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
      <div className="ml-wrap">
        {/* Intro */}
        <header className="ml-intro">
          <p className="ml-eyebrow">Bitácora local</p>
          <h1 className="ml-title">Movimientos Locales</h1>
          <p className="ml-lead">
            Registra y controla los movimientos locales pendientes y pagados.
          </p>
        </header>

        {/* Controles: búsqueda + filtros + registrar */}
        <div className="ml-controls">
          <div className="ml-search">
            <SearchBar value={busqueda} onChange={setBusqueda} />
          </div>
          <div className="ml-toolbar">
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
            <button type="button" className="ml-btn-agregar" onClick={abrirFilaNueva} disabled={!!filaNueva}>
              + Registrar movimiento
            </button>
          </div>
        </div>

        {/* Notificación */}

        {/* Tabla */}
        <div className="bst-zona">
        <BarraScrollTabla contenedorRef={panelRef} />
        <div className="ml-panel" ref={panelRef}>
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

          {cargando && <p className="ml-cargando">Cargando movimientos…</p>}
          {!cargando && movimientos.length === 0 && (
            <p className="ml-vacio">Aún no hay movimientos. Registra el primero.</p>
          )}
        </div>
        </div>
      </div>

      {/* Modal Editar */}
      <AnimatePresence>
        {modal.abierto && (
        <motion.div
          className="ml-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) cerrarModal(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ml-modal-titulo"
          {...overlayMotion}
        >
          <motion.div className="ml-modal" {...contentMotion}>
            <div className="ml-modal-header">
              <h2 id="ml-modal-titulo" className="ml-modal-titulo">Editar Movimiento</h2>
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
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
      <BotonArriba />
    </div>
  );
}
