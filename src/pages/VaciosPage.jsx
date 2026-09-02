import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { overlayMotion, contentMotion } from "../animations/modalMotion";
import { Trash2, SquarePen, Camera, Settings, X, FileText } from "lucide-react";
import { useVacios } from "../hooks/useVacios";
import { useAuthContext } from "../context/AuthContext";
import { useVacioStatusUpdate } from "../hooks/useVacioStatusUpdate";
import SearchBar from "../components/SearchBar/SearchBar";
import CeldaEditable from "../components/CeldaEditable/CeldaEditable";
// La Cita comparte los conversores de la celda editable: un solo ida y vuelta
// entre el instante del backend y el calendario, probado en fechaCelda.test.mjs.
import { aDateHora, aBackendHora, fechaHoraParaMostrar }
  from "../components/CeldaEditable/fechaCelda.mjs";
import BotonArriba from "../components/BotonArriba/BotonArriba";
import PinturaCeldas, { usePinturaCeldas } from "../components/PinturaCeldas/PinturaCeldas";
import BarraScrollTabla from "../components/BarraScrollTabla/BarraScrollTabla";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import { useNavigate } from "react-router-dom";
import VacioStatusSelector, { EIR_STATUSES } from "../components/VacioStatusSelector/VacioStatusSelector";
import ColorSelector from "../components/ColorSelector/ColorSelector";
import { esColorValido, textoSobre } from "../utils/colorFila.mjs";
import { filtrarBusqueda } from "../utils/buscar.mjs";
import OperadorSelector from "../components/OperadorSelector/OperadorSelector";
import PatioSelector from "../components/PatioSelector/PatioSelector";
// Mismo componente que usan Origen y Destino en Maniobras; el alias es para que
// aquí se lea por lo que hace y no por su nombre de fichero.
import CatalogoSelector from "../components/CiudadSelector/CiudadSelector";
import DatePicker from "react-datepicker";
import { shift } from "@floating-ui/react";
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from "react-datepicker";
import es from "date-fns/locale/es";
import FotoModal from "../components/FotoModal/FotoModal";
import ReporteVaciosModal from "../components/ReporteVaciosModal/ReporteVaciosModal";
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

// El calendario se saca del árbol a un portal colgado del <body>. Si no, lo
// recorta el overflow de la tabla en la fila nueva y el `overflow: hidden` del
// modal. Las filas YA guardadas no lo padecían: usan CeldaEditable, que trae su
// propio portal. Mismo remedio que Movimientos Locales (ml-fecha-portal) y
// CeldaEditable (celda-fecha-portal); react-datepicker crea el nodo solo si no
// existe. Id propio de esta página: los demás DatePicker del sistema no se tocan.
// El coordinador sale de los empleados con ese cargo. El filtro lo resuelve el
// backend (EmpleadoViewSet.get_queryset): la lista va paginada y filtrar en el
// navegador solo miraría los 60 primeros.
const ENDPOINT_COORDINADORES = "/empleados/?cargo=Coordinador";

const FECHA_PORTAL_ID = "vacios-fecha-portal";

// react-datepicker aplica flip() y offset(), pero NO shift(). flip solo voltea
// arriba/abajo: no corrige el eje horizontal, y esta tabla hace scroll lateral,
// así que en las últimas columnas el calendario se salía por la derecha.
// shift() lo desliza para mantenerlo dentro del viewport con 8px de margen.
const FECHA_MIDDLEWARE = [shift({ padding: 8 })];

// `max` es el límite del modelo/serializer: cortar aquí evita un 400 que el
// apiClient solo sabe mostrar como "HTTP 400". Las columnas sin selector ni
// fecha se editan con un clic en la propia celda (ver CeldaEditable).
const COLUMNAS = [
  { key: "contenedor",                label: "Contenedor",        max: 255 },
  { key: "tipo_contenedor",           label: "Tipo",              max: 100 },
  { key: "patio",                     label: "Patio",             isPatio: true },
  { key: "fecha_maniobra",            label: "Fecha Maniobra",  isFecha: true },
  // La hora a la que hay que estar en la terminal. Va entre las dos fechas
  // porque es lo que pasa entre una y otra. Instante completo, no solo fecha:
  // se guarda en UTC y se lee en la hora del navegador (ver fechaCelda.mjs).
  { key: "cita",                      label: "Cita",            isFechaHora: true },
  { key: "fecha_entrega",             label: "Fecha Entrega",   isFecha: true },
  { key: "fecha_notificacion_cliente",label: "Comentarios",       max: 50 },
  { key: "status",                    label: "Status",            isStatus: true },
  { key: "reprogramado",              label: "Reprogramado",      isReprogramado: true },
  // Siempre presente en la cabecera; la celda queda vacía si el vacío no está
  // reprogramado (mismo patrón que `requiereOperador2` en Maniobras).
  { key: "fecha_reprogramacion",      label: "Fecha Reprogramación", isFecha: true, requiereReprogramado: true },
  { key: "status_eir",                label: "Status EIR",        isStatusEir: true },
  { key: "coordinador",               label: "Coordinador",       isCoordinador: true },
  { key: "operador",                  label: "OP del Viaje",      isOperador: true },
  // Texto libre, sin catálogo detrás: se escribe a mano como Contenedor o Cita.
  // El límite es el del modelo (Vacio.operador_entrega, 255).
  //
  // La columna Transportista se retiró de la vista (no resultó útil en la
  // práctica). El campo Vacio.transportista SIGUE existiendo en la base con sus
  // datos: quitarlo de aquí no borra nada y volver a mostrarlo es esta línea.
  { key: "operador_entrega",          label: "Entregó",           max: 255 },
  { key: "cd",                        label: "CD",                max: 255 },
];

// Vista por defecto: Pendientes (primero). El filtro se resuelve en backend
// (useVacios → ?status=…). "todos" no filtra.
const FILTROS = [
  { id: "pendiente",    label: "Pendientes" },
  { id: "todos",        label: "Todos" },
  { id: "entregado",    label: "Entregados" },
  // No es un valor de `status`: filtra por la columna propia (ver useVacios).
  { id: "reprogramado", label: "Reprogramados" },
];

// Props de pintado de una fila. Mismo contrato que Maniobras: sin un color
// válido no hay clase ni variables, así que la fila vuelve al fondo normal y
// restablecer no tiene que recordar nada.
const propsPintado = (color) => (esColorValido(color)
  ? {
      className: "row-pintada",
      style: { "--color-fila": color, "--texto-fila": textoSobre(color) },
    }
  : {});

// Las props de la fila: su color elegido a mano, más el parpadeo de un segundo
// que deja el refresco automático cuando otra persona acaba de tocarla. Van
// juntas porque las dos escriben en className y por separado se pisaban.
const propsFila = (vacio, resaltada) => {
  const pintado = propsPintado(vacio.color);
  const clases  = [pintado.className, resaltada && "fila-cambiada"].filter(Boolean).join(" ");
  return { ...pintado, className: clases || undefined };
};

// Sí / No de la columna REPROGRAMADO. Se reutiliza VacioStatusSelector, que ya
// acepta su juego de opciones por prop: mismo aspecto y mismo portal que las
// demás columnas de estado, sin un componente nuevo.
const REPROGRAMADO_OPCIONES = [
  { id: "si", label: "Sí", bg: "#ffedd5", fg: "#9a3412" },
  { id: "no", label: "No", bg: "#f3f4f6", fg: "#6b7280" },
];

// El selector manda "" al reelegir la misma opción (deseleccionar). Para un sí/no
// eso es simplemente "no": la columna es NOT NULL y no admite un tercer estado.
const aBooleano = (valor) => valor === "si";

const MODAL_CERRADO = { abierto: false, datos: null };

// ── Sub-componente: fila nueva ────────────────────────────────────────────────

function FilaNueva({ datos, onChange, onGuardar, onCancelar, isSubmitting }) {
  return (
    <tr>
      {COLUMNAS.map((col) => (
        <td key={col.key}>
          {col.requiereReprogramado && !datos.reprogramado ? null : col.isReprogramado ? (
            <VacioStatusSelector
              opciones={REPROGRAMADO_OPCIONES}
              currentStatus={datos[col.key] ? "si" : "no"}
              onSelect={(val) => onChange(col.key, aBooleano(val))}
              loading={false}
            />
          ) : col.isFechaHora ? (
            <DatePicker
              locale="es"
              showTimeSelect
              timeFormat="HH:mm"
              timeIntervals={15}
              dateFormat="dd/MM/yyyy HH:mm"
              placeholderText="DD/MM/YYYY HH:mm"
              className="date-picker-input"
              isClearable
              portalId={FECHA_PORTAL_ID}
              popperModifiers={FECHA_MIDDLEWARE}
              selected={aDateHora(datos[col.key])}
              onChange={(d) => onChange(col.key, aBackendHora(d))}
            />
          ) : col.isFecha ? (
            <DatePicker
              locale="es"
              dateFormat="dd/MM/yyyy"
              selected={fechaADate(datos[col.key])}
              onChange={(date) => onChange(col.key, dateAFechaBackend(date))}
              placeholderText="DD/MM/YYYY"
              className="date-picker-input"
              isClearable
              disabled={isSubmitting}
              portalId={FECHA_PORTAL_ID}
              popperModifiers={FECHA_MIDDLEWARE}
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
          ) : col.isCoordinador ? (
            <CatalogoSelector
              endpoint={ENDPOINT_COORDINADORES}
              campo="nombre_trabajador"
              placeholder="— Asignar —"
              currentValue={datos[col.key] || ""}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
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
                {col.requiereReprogramado && !datos.reprogramado ? null : col.isReprogramado ? (
                  <VacioStatusSelector
                    opciones={REPROGRAMADO_OPCIONES}
                    currentStatus={datos[col.key] ? "si" : "no"}
                    onSelect={(val) => onChange(col.key, aBooleano(val))}
                    loading={false}
                  />
                ) : col.isFechaHora ? (
                  <DatePicker
                    id={`edit-${col.key}`}
                    locale="es"
                    showTimeSelect
                    timeFormat="HH:mm"
                    timeIntervals={15}
                    dateFormat="dd/MM/yyyy HH:mm"
                    placeholderText="DD/MM/YYYY HH:mm"
                    className="date-picker-input"
                    isClearable
                    portalId={FECHA_PORTAL_ID}
                    popperModifiers={FECHA_MIDDLEWARE}
                    selected={aDateHora(datos[col.key] ?? "")}
                    onChange={(d) => onChange(col.key, aBackendHora(d))}
                  />
                ) : col.isFecha ? (
                  <DatePicker
                    id={`edit-${col.key}`}
                    locale="es"
                    dateFormat="dd/MM/yyyy"
                    selected={fechaADate(datos[col.key] ?? "")}
                    onChange={(date) => onChange(col.key, dateAFechaBackend(date))}
                    placeholderText="DD/MM/YYYY"
                    className="date-picker-input"
                    isClearable
                    portalId={FECHA_PORTAL_ID}
                    popperModifiers={FECHA_MIDDLEWARE}
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
                ) : col.isCoordinador ? (
                  <CatalogoSelector
                    endpoint={ENDPOINT_COORDINADORES}
                    campo="nombre_trabajador"
                    placeholder="— Asignar —"
                    currentValue={datos[col.key] || ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
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
    loadMore, eliminar, actualizar, agregar, VACIO_VACIO, recienCambiados,
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
  const tablaRef = useRef(null);
  const [fotoModal,   setFotoModal]   = useState(null); // { registroId } | null
  // Modal del reporte en PDF: solo elige coordinador, el filtro lo hace el backend.
  const [modalReporte, setModalReporte] = useState(false);
  // Balde de celdas: modo pintura + paleta del clic derecho.
  const pintura = usePinturaCeldas();

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

  // Guardado desde la tabla: PATCH de un solo campo, igual que Maniobras. Se
  // confirma QUÉ se escribió (el valor va en la línea monoespaciada del aviso)
  // porque son códigos que hay que poder verificar de un vistazo.
  const handleGuardarCampo = useCallback(async (vacio, campo, valor) => {
    try {
      await actualizar(vacio.id, { [campo]: valor });
      setNotif({
        tipo: "ok",
        msg: COLUMNAS.find((c) => c.key === campo)?.label ?? campo,
        // Reprogramado guarda un booleano: React no pinta `true` y `false` caería
        // en "(vacío)", así que el aviso diría lo contrario de lo que se guardó.
        // Y un mapa de colores tampoco: React no renderiza un objeto, lo lanza
        // como error y se cae la tabla.
        dato: typeof valor === "boolean" ? (valor ? "Sí" : "No")
          : (valor && typeof valor === "object" && !Array.isArray(valor))
          ? (Object.keys(valor).length
              ? `${Object.keys(valor).length} celda(s) pintada(s)`
              : "(sin pintar)")
          : (valor || "(vacío)"),
      });
    } catch (err) {
      setNotif({ tipo: "error", msg: err.message || "Error al actualizar el campo." });
    }
  }, [actualizar]);

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

  // ── Filtro por búsqueda — solo sobre datos ya cargados ────────────────────
  // Acepta exclusiones ("-zuñiga") y frases entre comillas; ver utils/buscar.mjs.
  const vaciosFiltrados = filtrarBusqueda(vacios, busqueda);

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
        <SearchBar
            value={busqueda}
            onChange={setBusqueda}
            placeholder='Buscar…  ("-" excluye. ej: -zuñiga/-"jose zuñiga")'
          />
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
        <div className="toolbar-acciones">
          <PinturaCeldas pintura={pintura} />
          <button
            className="btn-reporte"
            onClick={() => setModalReporte(true)}
            title="Lista de vacíos pendientes de un coordinador, en PDF"
          >
            <FileText size={16} /> Reporte Vacíos
          </button>
          <button
            className="btn-agregar"
            onClick={() => setModoAgregar(true)}
            disabled={modoAgregar || isSubmitting}
          >
            + Agregar Vacío
          </button>
        </div>
      </div>

      <div className="bst-zona">

      <BarraScrollTabla contenedorRef={tablaRef} />

      <div className="table-responsive" ref={tablaRef}>
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
                <tr key={vacio.id} {...propsFila(vacio, recienCambiados.includes(vacio.id))}>
                  {COLUMNAS.map((col) => (
                    // Relleno propio de la celda + los dos gestos de pintura.
                    <td
                      key={col.key}
                      {...pintura.celda(vacio.colores, col.key,
                                        (colores) => handleGuardarCampo(vacio, "colores", colores))}
                    >
                      {col.requiereReprogramado && !vacio.reprogramado ? null : col.isReprogramado ? (
                        <VacioStatusSelector
                          opciones={REPROGRAMADO_OPCIONES}
                          currentStatus={vacio[col.key] ? "si" : "no"}
                          onSelect={(val) => handleGuardarCampo(vacio, col.key, aBooleano(val))}
                        />
                      ) : col.isStatus ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <VacioStatusSelector
                            currentStatus={vacio.status}
                            onSelect={(nuevoStatus) => handleStatusChange(vacio, nuevoStatus)}
                            loading={updatingId === vacio.id}
                          />
                          <ColorSelector
                            color={vacio.color}
                            onSelect={(valor) => handleGuardarCampo(vacio, "color", valor)}
                          />
                        </div>
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
                      ) : col.isCoordinador ? (
                        <CatalogoSelector
                          endpoint={ENDPOINT_COORDINADORES}
                          campo="nombre_trabajador"
                          placeholder="— Asignar —"
                          currentValue={vacio.coordinador || ""}
                          onSelect={(nombre) => handleGuardarCampo(vacio, "coordinador", nombre)}
                        />
                      ) : col.isPatio ? (
                        <PatioSelector
                          currentValue={vacio.patio}
                          onSelect={(nombre) => handlePatioChange(vacio, nombre)}
                        />
                      ) : col.isFechaHora ? (
                        <CeldaEditable
                          fechaHora
                          valor={vacio[col.key]}
                          texto={fechaHoraParaMostrar(vacio[col.key])}
                          etiqueta={col.label}
                          onGuardar={(val) => handleGuardarCampo(vacio, col.key, val)}
                        />
                      ) : col.isFecha ? (
                        <CeldaEditable
                          fecha
                          valor={vacio[col.key]}
                          texto={fechaParaMostrar(vacio[col.key])}
                          etiqueta={col.label}
                          onGuardar={(val) => handleGuardarCampo(vacio, col.key, val)}
                        />
                      ) : (
                        <CeldaEditable
                          valor={vacio[col.key]}
                          max={col.max}
                          etiqueta={col.label}
                          onGuardar={(val) => handleGuardarCampo(vacio, col.key, val)}
                        />
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
        {modalReporte && (
          <ReporteVaciosModal
            endpoint={ENDPOINT_COORDINADORES}
            onCerrar={() => setModalReporte(false)}
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
      <BotonArriba />
    </div>
  );
}
