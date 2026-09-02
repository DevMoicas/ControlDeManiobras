import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { overlayMotion, contentMotion } from "../animations/modalMotion";
import { apiClient } from "../api/apiClient";
import { SquarePen, Trash2, Settings, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import "./CatalogosPage.css";
import SearchBar from "../components/SearchBar/SearchBar";
import BarraScrollTabla from "../components/BarraScrollTabla/BarraScrollTabla";
import BotonArriba from "../components/BotonArriba/BotonArriba";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import CargoSelector from "../components/CargoSelector/CargoSelector";
import TransportistaSelector from "../components/TransportistaSelector/TransportistaSelector";
import DocumentoCelda from "../components/DocumentoCelda/DocumentoCelda";

// Todas las tablas de catálogos se muestran estrictamente por id ascendente.
const porId = (arr) => [...arr].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

// Columnas que el backend manda como fecha ISO y aquí se leen como DD/MM/AAAA.
// Lista explícita y no "toda clave que empiece por fecha_": `fecha_ingreso` de
// empleados es texto libre en la base y no siempre trae una fecha; estas dos sí
// son DateField (Tracto.fecha_vencimiento_poliza, Chofer.fecha_vencimiento_licencia).
const COLUMNAS_FECHA = new Set([
  "fecha_vencimiento_poliza",
  "fecha_vencimiento_licencia",
  "fecha_vencimiento_permisos_full",
  "fecha_vencimiento_fisico_mecanica",
  "fecha_vencimiento_humo",
]);

// Columnas con documento adjunto. La FECHA es una columna del modelo y se pinta
// sola; el clip se cuelga de ESA MISMA celda en vez de abrir una columna aparte,
// porque el permiso y su vencimiento son un solo concepto y la tabla ya es
// ancha. Los huecos son los del backend: Permisos Full lleva dos hojas.
const DOCUMENTOS_EN_FECHA = {
  tractos: {
    fecha_vencimiento_permisos_full:   { tipo: "tracto_full",   etiqueta: "Permisos Full",   huecos: 2 },
    fecha_vencimiento_fisico_mecanica: { tipo: "tracto_fisico", etiqueta: "Físico Mecánica", huecos: 1 },
    fecha_vencimiento_humo:            { tipo: "tracto_humo",   etiqueta: "Humo",            huecos: 1 },
  },
  remolques: {
    fecha_vencimiento_permisos_full:   { tipo: "remolque_full",   etiqueta: "Permisos Full",   huecos: 2 },
    fecha_vencimiento_fisico_mecanica: { tipo: "remolque_fisico", etiqueta: "Físico Mecánica", huecos: 1 },
  },
};

// La Tarjeta de Circulación no vence en el sistema —se decidió que fuera solo el
// archivo—, así que no tiene columna de fecha donde colgarse y lleva la suya.
const DOCUMENTOS_SUELTOS = {
  tractos: [{ tipo: "tracto_tarjeta", etiqueta: "Tarjeta de Circulación", huecos: 1 }],
};

// "2026-12-31" → "31/12/2026". Cualquier otra cosa (vacío, texto suelto) sale
// tal cual: la celda nunca debe tragarse un dato por no saber interpretarlo.
function valorParaMostrar(clave, valor) {
  if (!COLUMNAS_FECHA.has(clave)) return valor;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : valor;
}

export default function NoEcoPage() {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const navigate = useNavigate();
  const { isAdmin } = useAuthContext();

  const [vista, setVista] = useState("tractos");
  // Una barra de scroll por tarjeta: cada tabla tiene su propio overflow. Solo
  // se muestra la de la tabla cuyo pie queda bajo el pliegue, así que nunca
  // aparecen dos a la vez (ver BarraScrollTabla).
  const refOrigenes = useRef(null);
  const refDestinos = useRef(null);
  const refUnidades = useRef(null);
  const refOperadores = useRef(null);
  const refPrincipal = useRef(null);
  const [data, setData] = useState([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [formData, setFormData] = useState({});
  const [editando, setEditando] = useState(false);
  const [registroEditando, setRegistroEditando] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataOrigenes, setDataOrigenes] = useState([]);
  const [dataDestinos, setDataDestinos] = useState([]);
  const [dataUnidades, setDataUnidades] = useState([]);
  const [dataOperadores, setDataOperadores] = useState([]);
  const [subVista, setSubVista] = useState(null);
  const TRADUCCIONES_COLUMNAS = {
    no_eco: "No. Eco",
    anio: "Año",
    unidad: "Unidad",
    placas: "Placas",
    tipo: "Tipo",
    id: "ID",
    nombre_trabajador: "Nombre del Trabajador",
    fecha_ingreso: "Fecha de Ingreso",
    nss: "NSS",
    nombre: "Nombre",
    nombre_cliente: "Nombre del Cliente",
    domicilio: "Domicilio",
    colonia: "Colonia",
    ciudad: "Ciudad",
    fecha_vencimiento_licencia: "Fecha Vencimiento Licencia",
    poliza: "Póliza",
    fecha_vencimiento_poliza: "Fecha Vencimiento Póliza",
    tag: "Tag",
    cargo: "Cargo",
    telefono: "Teléfono",
    transportista: "Transportista",
    con_cita: "Con Cita",
    // Se leen por el concepto y no por el nombre de la columna: la celda enseña
    // la fecha de vencimiento y el clip de su documento.
    fecha_vencimiento_permisos_full: "Permisos Full",
    fecha_vencimiento_fisico_mecanica: "Físico Mecánica",
    fecha_vencimiento_humo: "Humo",
  };

  const configFormularios = {
    tractos: [
      { name: "no_eco", label: "No. Eco", type: "text" },
      { name: "tag", label: "Tag", type: "text", required: false },
      { name: "unidad", label: "Unidad", type: "text" },
      { name: "anio", label: "Año", type: "number" },
      { name: "placas", label: "Placas", type: "text" },
      { name: "tipo", label: "Tipo", type: "text" },
      { name: "poliza", label: "Póliza", type: "text", required: false },
      { name: "fecha_vencimiento_poliza", label: "Fecha Vencimiento Póliza", type: "date", required: false },
      // El archivo de cada uno se sube desde el clip de su celda, no desde aquí:
      // subirlo necesita que el tracto ya exista y tenga id.
      { name: "fecha_vencimiento_permisos_full", label: "Vencimiento Permisos Full", type: "date", required: false },
      { name: "fecha_vencimiento_fisico_mecanica", label: "Vencimiento Físico Mecánica", type: "date", required: false },
      { name: "fecha_vencimiento_humo", label: "Vencimiento Humo", type: "date", required: false }
    ],
    remolques: [
      { name: "color", label: "Color", type: "text" },
      { name: "tipo", label: "Tipo de remolque", type: "text" },
      { name: "placas", label: "Placas del remolque", type: "text" },
      { name: "fecha_vencimiento_permisos_full", label: "Vencimiento Permisos Full", type: "date", required: false },
      { name: "fecha_vencimiento_fisico_mecanica", label: "Vencimiento Físico Mecánica", type: "date", required: false }
    ],
    choferes: [
      { name: "nombre", label: "Nombre Completo", type: "text" },
      { name: "rfc", label: "RFC del operador", type: "text", required: false },
      { name: "licencia", label: "Número de Licencia", type: "text", required: false },
      { name: "fecha_vencimiento_licencia", label: "Fecha Vencimiento Licencia", type: "date", required: false }
    ],
    // Obligatorios solo Nombre y Cargo; el resto queda opcional. El modelo ya
    // aceptaba vacío en fecha_ingreso, nss y teléfono — la obligatoriedad vivía
    // únicamente en este formulario.
    empleados: [
      { name: "nombre_trabajador", label: "Nombre del Trabajador", type: "text" },
      { name: "fecha_ingreso", label: "Fecha de Ingreso", type: "date", required: false },
      { name: "nss", label: "NSS", type: "text", required: false },
      { name: "cargo", label: "Cargo", type: "selector", selector: "cargo" },
      { name: "telefono", label: "Teléfono", type: "tel", required: false }
    ],
    patios: [
      { name: "nombre", label: "Nombre", type: "text" }
    ],
    clientes: [
      { name: "nombre_cliente", label: "Nombre del Cliente", type: "text" },
      { name: "domicilio", label: "Domicilio", type: "text" },
      { name: "colonia", label: "Colonia", type: "text", required: false },
      { name: "ciudad", label: "Ciudad", type: "text", required: false }
    ],
    origenes: [
      { name: "ciudad", label: "Ciudad", type: "text" }
    ],
    destinos: [
      { name: "ciudad", label: "Ciudad", type: "text" }
    ],
    transportistas: [
      { name: "nombre", label: "Nombre", type: "text" }
    ],
    cargos: [
      { name: "nombre", label: "Nombre", type: "text" }
    ],
    "unidades-terceros": [
      { name: "placas", label: "Placas", type: "text" },
      { name: "transportista", label: "Transportista", type: "selector", selector: "transportista", required: false }
    ],
    "operadores-terceros": [
      { name: "nombre", label: "Nombre", type: "text" },
      { name: "transportista", label: "Transportista", type: "selector", selector: "transportista", required: false }
    ],
  };

  const cacheRef = useRef({});

  useEffect(() => {
    let cancelled = false;

    if (vista === "origenes_destinos") {
      // Cargar orígenes
      if (cacheRef.current["origenes"]) {
        setDataOrigenes(cacheRef.current["origenes"]);
      } else {
        apiClient.get("/origenes/")
          .then(res => {
            if (cancelled) return;
            const datos = porId(Array.isArray(res) ? res : res.results || []);
            cacheRef.current["origenes"] = datos;
            setDataOrigenes(datos);
          })
          .catch(err => {
            if (cancelled) return;
            console.error(err);
          });
      }

      // Cargar destinos
      if (cacheRef.current["destinos"]) {
        setDataDestinos(cacheRef.current["destinos"]);
      } else {
        apiClient.get("/destinos/")
          .then(res => {
            if (cancelled) return;
            const datos = porId(Array.isArray(res) ? res : res.results || []);
            cacheRef.current["destinos"] = datos;
            setDataDestinos(datos);
          })
          .catch(err => {
            if (cancelled) return;
            console.error(err);
          });
      }

      return () => { cancelled = true; };
    }

    if (vista === "terceros") {
      const cargar = (endpoint, cacheKey, setter) => {
        if (cacheRef.current[cacheKey]) {
          setter(cacheRef.current[cacheKey]);
          return;
        }
        apiClient.get(`/${endpoint}/`)
          .then(res => {
            if (cancelled) return;
            const datos = porId(Array.isArray(res) ? res : res.results || []);
            cacheRef.current[cacheKey] = datos;
            setter(datos);
          })
          .catch(err => { if (!cancelled) console.error(err); });
      };
      cargar("unidades-terceros", "unidades-terceros", setDataUnidades);
      cargar("operadores-terceros", "operadores-terceros", setDataOperadores);
      return () => { cancelled = true; };
    }

    // Caso normal: una sola vista, un endpoint
    if (cacheRef.current[vista]) {
      setData(cacheRef.current[vista]);
      return;
    }

    apiClient.get(`/${vista}/`)
      .then(res => {
        if (cancelled) return;
        const datos = porId(Array.isArray(res) ? res : res.results || []);
        cacheRef.current[vista] = datos;
        setData(datos);
      })
      .catch(err => {
        if (cancelled) return;
        if (err.message !== "AbortError") console.error(err);
      });

    return () => { cancelled = true; };
  }, [vista]);

  const eliminarRegistro = async (id, vistaLocal) => {
    if (!isAdmin) {
      alerta({ tipo: "error", msg: "No tienes permisos para eliminar." });
      return;
    }

    const vistaActiva = vistaLocal || vista;

    if (await preguntar({
      titulo: "Eliminar registro",
      mensaje: "Se borrará del catálogo. No se puede deshacer.",
      accion: "Eliminar",
      peligro: true,
    })) {
      setIsSubmitting(true);
      try {
        await apiClient.delete(`/${vistaActiva}/${id}/`);

        sessionStorage.removeItem("adminConteo");
        if (vistaActiva === "origenes") {
          setDataOrigenes(prev => prev.filter(item => item.id !== id));
        } else if (vistaActiva === "destinos") {
          setDataDestinos(prev => prev.filter(item => item.id !== id));
        } else if (vistaActiva === "unidades-terceros") {
          setDataUnidades(prev => prev.filter(item => item.id !== id));
        } else if (vistaActiva === "operadores-terceros") {
          setDataOperadores(prev => prev.filter(item => item.id !== id));
        } else {
          setData(prev => prev.filter(item => item.id !== id));
        }
        alerta({ tipo: "ok", msg: "Registro eliminado." });
      } catch (error) {
        console.error("Error:", error);
        alerta({ tipo: "error", msg: "No se pudo eliminar el registro." });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Qué tractos y remolques ya tienen cada documento, en UNA petición para toda
  // la pantalla: preguntarlo fila a fila serían cuatro por tracto. Solo ids —los
  // bytes se piden al abrir el clip—, así que la respuesta es corta.
  const [documentos, setDocumentos] = useState({});
  useEffect(() => {
    apiClient.get("/fotos/catalogos/")
      .then((data) => setDocumentos(Object.fromEntries(
        Object.entries(data).map(([tipo, ids]) => [tipo, new Set(ids)]))))
      // Sin esto los clips se pintan vacíos: se sigue pudiendo abrir y subir,
      // solo se pierde el "ya tiene" de un vistazo.
      .catch(() => {});
  }, []);

  const marcarDocumento = (tipo, id, hay) => setDocumentos((prev) => {
    const ids = new Set(prev[tipo] ?? []);
    if (hay) ids.add(id); else ids.delete(id);
    return { ...prev, [tipo]: ids };
  });

  // CON CITA (solo Patios): se marca en la propia tabla, como la casilla de
  // Pendientes, porque es un si/no y abrir el modal para un booleano sobra.
  // Optimista con vuelta atras: si el PATCH falla, la casilla regresa sola.
  const alternarConCita = async (patio) => {
    const valor = !patio.con_cita;
    setData((prev) => prev.map((p) => (p.id === patio.id ? { ...p, con_cita: valor } : p)));
    try {
      await apiClient.patch(`/patios/${patio.id}/`, { con_cita: valor });
    } catch (error) {
      console.error("Error:", error);
      setData((prev) => prev.map((p) => (p.id === patio.id ? { ...p, con_cita: !valor } : p)));
      alerta({ tipo: "error", msg: "No se pudo cambiar el Con Cita del patio." });
    }
  };

  const iniciarEdicion = (item, vistaLocal) => {
    setSubVista(vistaLocal || null);
    setEditando(true);
    setRegistroEditando(item);
    setFormData(item);
    setModalAbierto(true);
  };

  const abrirModalAgregar = (vistaLocal) => {
    setFormData({});
    setEditando(false);
    setRegistroEditando(null);
    setSubVista(vistaLocal || null);
    setModalAbierto(true);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const guardarNuevoRegistro = async (e) => {
    e.preventDefault();
    const vistaActiva = subVista || vista;

    // El atributo `required` del navegador solo cubre los <input>. Los campos de
    // tipo selector (Cargo, Transportista) se pintan como botón y se colarían
    // vacíos, así que la comprobación se hace aquí para TODOS los obligatorios.
    const faltan = (configFormularios[vistaActiva] ?? [])
      .filter((campo) => campo.required !== false && !String(formData[campo.name] ?? "").trim())
      .map((campo) => campo.label);
    if (faltan.length) {
      alerta({ tipo: "error", msg: `Falta por llenar: ${faltan.join(", ")}` });
      return;
    }

    setIsSubmitting(true);

    try {
      let resultado;

      if (editando) {
        resultado = await apiClient.put(
          `/${vistaActiva}/${registroEditando.id}/`,
          formData
        );
      } else {
        resultado = await apiClient.post(
          `/${vistaActiva}/`,
          formData
        );
      }

      sessionStorage.removeItem("adminConteo");

      if (vistaActiva === "origenes") {
        setDataOrigenes(prev =>
          editando
            ? prev.map(item => item.id === registroEditando.id ? resultado : item)
            : [...prev, resultado]
        );
      } else if (vistaActiva === "destinos") {
        setDataDestinos(prev =>
          editando
            ? prev.map(item => item.id === registroEditando.id ? resultado : item)
            : [...prev, resultado]
        );
      } else if (vistaActiva === "unidades-terceros") {
        setDataUnidades(prev =>
          editando
            ? prev.map(item => item.id === registroEditando.id ? resultado : item)
            : [...prev, resultado]
        );
      } else if (vistaActiva === "operadores-terceros") {
        setDataOperadores(prev =>
          editando
            ? prev.map(item => item.id === registroEditando.id ? resultado : item)
            : [...prev, resultado]
        );
      } else {
        setData(prev =>
          editando
            ? prev.map(item => item.id === registroEditando.id ? resultado : item)
            : [...prev, resultado]
        );
      }

      setModalAbierto(false);
      setFormData({});
      setEditando(false);
      setRegistroEditando(null);
      setSubVista(null);
      alerta({ tipo: "ok", msg: editando ? "Registro actualizado." : "Registro creado." });
    } catch (error) {
      console.error(error);
      alerta({ tipo: "error", msg: "No se pudo guardar el registro." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const nombresSingulares = {
    tractos: "Tracto",
    remolques: "Remolque",
    choferes: "Chofer",
    empleados: "Empleado",
    patios: "Patio",
    clientes: "Cliente",
    origenes: "Origen",
    destinos: "Destino",
    transportistas: "Transportista",
    cargos: "Cargo",
    "unidades-terceros": "Unidad",
    "operadores-terceros": "Operador",
  };

  const dataFiltrada = Array.isArray(data)
    ? data.filter((item) => {
      if (!busqueda) return true;

      return Object.values(item).some((valor) =>
        String(valor).toLowerCase().includes(busqueda.toLowerCase())
      );
    })
    : [];

  const dataOrigenesFiltrada = Array.isArray(dataOrigenes)
    ? dataOrigenes.filter((item) => {
        if (!busqueda) return true;
        return Object.values(item).some((valor) =>
          String(valor).toLowerCase().includes(busqueda.toLowerCase())
        );
      })
    : [];

  const dataDestinosFiltrada = Array.isArray(dataDestinos)
    ? dataDestinos.filter((item) => {
        if (!busqueda) return true;
        return Object.values(item).some((valor) =>
          String(valor).toLowerCase().includes(busqueda.toLowerCase())
        );
      })
    : [];

  const dataUnidadesFiltrada = Array.isArray(dataUnidades)
    ? dataUnidades.filter((item) => {
        if (!busqueda) return true;
        return Object.values(item).some((valor) =>
          String(valor).toLowerCase().includes(busqueda.toLowerCase())
        );
      })
    : [];

  const dataOperadoresFiltrada = Array.isArray(dataOperadores)
    ? dataOperadores.filter((item) => {
        if (!busqueda) return true;
        return Object.values(item).some((valor) =>
          String(valor).toLowerCase().includes(busqueda.toLowerCase())
        );
      })
    : [];
  return (
    <div className="noeco-container">

      {/* ── Header con título y botón admin ── */}
      {/* Mismo patrón que Movimientos Locales y Documentos de Viaje:
          antetítulo, título y entradilla. */}
      <header className="noeco-header">
        <p className="cp-eyebrow">Registros</p>
        <h1 className="noeco-title">Catálogos</h1>
        <p className="cp-lead">
          Da de alta operadores, unidades, clientes, rutas, patios, etc.
        </p>

        {/* Solo visible para administradores */}
        {isAdmin && (
          <button
            className="noeco-admin-btn"
            onClick={() => navigate("../admin-no-eco")}
            type="button"
          >
            <Settings size={16} /> Admin Catálogos
          </button>
        )}
      </header>

      {/* BARRA DE BÚSQUEDA */}
      <div className="cp-search">
        <SearchBar value={busqueda} onChange={setBusqueda} />
      </div>
      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-button ${vista === "tractos" ? "active" : ""}`}
          onClick={() => { setSubVista(null); setVista("tractos"); }}
        >
          Tractos
        </button>
        <button
          className={`tab-button ${vista === "remolques" ? "active" : ""}`}
          onClick={() => { setSubVista(null); setVista("remolques"); }}
        >
          Remolques
        </button>
        <button
          className={`tab-button ${vista === "choferes" ? "active" : ""}`}
          onClick={() => { setSubVista(null); setVista("choferes"); }}
        >
          Choferes
        </button>
        <button
          className={`tab-button ${vista === "empleados" ? "active" : ""}`}
          onClick={() => { setSubVista(null); setVista("empleados"); }}
        >
          Empleados
        </button>
        <button
          className={`tab-button ${vista === "patios" ? "active" : ""}`}
          onClick={() => { setSubVista(null); setVista("patios"); }}
        >
          Patios
        </button>
        <button
          className={`tab-button ${vista === "clientes" ? "active" : ""}`}
          onClick={() => { setSubVista(null); setVista("clientes"); }}
        >
          Clientes
        </button>
        <button
          className={`tab-button ${vista === "origenes_destinos" ? "active" : ""}`}
          onClick={() => { setSubVista(null); setVista("origenes_destinos"); }}
        >
          Orígenes y Destinos
        </button>
        <button
          className={`tab-button ${vista === "transportistas" ? "active" : ""}`}
          onClick={() => { setSubVista(null); setVista("transportistas"); }}
        >
          Transportistas
        </button>
        <button
          className={`tab-button ${vista === "cargos" ? "active" : ""}`}
          onClick={() => { setSubVista(null); setVista("cargos"); }}
        >
          Cargos
        </button>
        <button
          className={`tab-button ${vista === "terceros" ? "active" : ""}`}
          onClick={() => { setSubVista(null); setVista("terceros"); }}
        >
          Terceros
        </button>
      </div>

      {/* Tabla */}
      {vista === "origenes_destinos" ? (
        <>
          {/* ── TABLA ORÍGENES ── */}
          <div className="bst-zona">
          <BarraScrollTabla contenedorRef={refOrigenes} />
          <div className="table-container" ref={refOrigenes} style={{ marginBottom: "30px" }}>
            <div className="add-button-container">
              <button
                onClick={() => abrirModalAgregar("origenes")}
                className="btn-add"
                disabled={isSubmitting}
              >
                <span>+</span> Agregar Origen
              </button>
            </div>
            <h3 className="subtable-title">
              Orígenes
            </h3>
            <table className="custom-table">
              <thead>
                <tr>
                  {dataOrigenes.length > 0 &&
                    Object.keys(dataOrigenes[0]).map((key) => (
                      <th key={key}>
                        {TRADUCCIONES_COLUMNAS[key] || key.replace('_', ' ')}
                      </th>
                    ))}
                  {dataOrigenes.length > 0 && <th style={{ textAlign: "center" }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {dataOrigenesFiltrada.length === 0 ? (
                  <tr>
                    <td colSpan="100%" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                      No hay registros de orígenes en la base de datos
                    </td>
                  </tr>
                ) : (
                  dataOrigenesFiltrada.map((item) => (
                    <tr key={item.id}>
                      {Object.entries(item).map(([clave, val]) => (
                        <td key={clave}>{valorParaMostrar(clave, val)}</td>
                      ))}
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button
                            onClick={() => iniciarEdicion(item, "origenes")}
                            className="btn-edit"
                            disabled={isSubmitting}
                          >
                            <SquarePen size={18} />
                          </button>
                          {isAdmin && (
                            <button
                              className="btn-delete"
                              onClick={() => eliminarRegistro(item.id, "origenes")}
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

          {/* ── TABLA DESTINOS ── */}
          <div className="bst-zona">
          <BarraScrollTabla contenedorRef={refDestinos} />
          <div className="table-container" ref={refDestinos}>
            <div className="add-button-container">
              <button
                onClick={() => abrirModalAgregar("destinos")}
                className="btn-add"
                disabled={isSubmitting}
              >
                <span>+</span> Agregar Destino
              </button>
            </div>
            <h3 className="subtable-title">
              Destinos
            </h3>
            <table className="custom-table">
              <thead>
                <tr>
                  {dataDestinos.length > 0 &&
                    Object.keys(dataDestinos[0]).map((key) => (
                      <th key={key}>
                        {TRADUCCIONES_COLUMNAS[key] || key.replace('_', ' ')}
                      </th>
                    ))}
                  {dataDestinos.length > 0 && <th style={{ textAlign: "center" }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {dataDestinosFiltrada.length === 0 ? (
                  <tr>
                    <td colSpan="100%" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                      No hay registros de destinos en la base de datos
                    </td>
                  </tr>
                ) : (
                  dataDestinosFiltrada.map((item) => (
                    <tr key={item.id}>
                      {Object.entries(item).map(([clave, val]) => (
                        <td key={clave}>{valorParaMostrar(clave, val)}</td>
                      ))}
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button
                            onClick={() => iniciarEdicion(item, "destinos")}
                            className="btn-edit"
                            disabled={isSubmitting}
                          >
                            <SquarePen size={18} />
                          </button>
                          {isAdmin && (
                            <button
                              className="btn-delete"
                              onClick={() => eliminarRegistro(item.id, "destinos")}
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
        </>
      ) : vista === "terceros" ? (
        <>
          {/* ── TABLA UNIDADES ── */}
          <div className="bst-zona">
          <BarraScrollTabla contenedorRef={refUnidades} />
          <div className="table-container" ref={refUnidades} style={{ marginBottom: "30px" }}>
            <div className="add-button-container">
              <button
                onClick={() => abrirModalAgregar("unidades-terceros")}
                className="btn-add"
                disabled={isSubmitting}
              >
                <span>+</span> Agregar Unidad
              </button>
            </div>
            <h3 className="subtable-title">
              Unidades
            </h3>
            <table className="custom-table">
              <thead>
                <tr>
                  {dataUnidades.length > 0 &&
                    Object.keys(dataUnidades[0]).map((key) => (
                      <th key={key}>
                        {TRADUCCIONES_COLUMNAS[key] || key.replace('_', ' ')}
                      </th>
                    ))}
                  {dataUnidades.length > 0 && <th style={{ textAlign: "center" }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {dataUnidadesFiltrada.length === 0 ? (
                  <tr>
                    <td colSpan="100%" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                      No hay registros de unidades de terceros en la base de datos
                    </td>
                  </tr>
                ) : (
                  dataUnidadesFiltrada.map((item) => (
                    <tr key={item.id}>
                      {Object.entries(item).map(([clave, val]) => (
                        <td key={clave}>{valorParaMostrar(clave, val)}</td>
                      ))}
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button
                            onClick={() => iniciarEdicion(item, "unidades-terceros")}
                            className="btn-edit"
                            disabled={isSubmitting}
                          >
                            <SquarePen size={18} />
                          </button>
                          {isAdmin && (
                            <button
                              className="btn-delete"
                              onClick={() => eliminarRegistro(item.id, "unidades-terceros")}
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

          {/* ── TABLA OPERADORES ── */}
          <div className="bst-zona">
          <BarraScrollTabla contenedorRef={refOperadores} />
          <div className="table-container" ref={refOperadores}>
            <div className="add-button-container">
              <button
                onClick={() => abrirModalAgregar("operadores-terceros")}
                className="btn-add"
                disabled={isSubmitting}
              >
                <span>+</span> Agregar Operador
              </button>
            </div>
            <h3 className="subtable-title">
              Operadores
            </h3>
            <table className="custom-table">
              <thead>
                <tr>
                  {dataOperadores.length > 0 &&
                    Object.keys(dataOperadores[0]).map((key) => (
                      <th key={key}>
                        {TRADUCCIONES_COLUMNAS[key] || key.replace('_', ' ')}
                      </th>
                    ))}
                  {dataOperadores.length > 0 && <th style={{ textAlign: "center" }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {dataOperadoresFiltrada.length === 0 ? (
                  <tr>
                    <td colSpan="100%" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                      No hay registros de operadores de terceros en la base de datos
                    </td>
                  </tr>
                ) : (
                  dataOperadoresFiltrada.map((item) => (
                    <tr key={item.id}>
                      {Object.entries(item).map(([clave, val]) => (
                        <td key={clave}>{valorParaMostrar(clave, val)}</td>
                      ))}
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button
                            onClick={() => iniciarEdicion(item, "operadores-terceros")}
                            className="btn-edit"
                            disabled={isSubmitting}
                          >
                            <SquarePen size={18} />
                          </button>
                          {isAdmin && (
                            <button
                              className="btn-delete"
                              onClick={() => eliminarRegistro(item.id, "operadores-terceros")}
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
        </>
      ) : (
        <div className="bst-zona">
        <BarraScrollTabla contenedorRef={refPrincipal} />
        <div className="table-container" ref={refPrincipal}>
          <div className="add-button-container">
            <button
              onClick={() => abrirModalAgregar(null)}
              className="btn-add"
              disabled={isSubmitting}
            >
              <span>+</span> Agregar Nuevo {nombresSingulares[vista] || "Registro"}
            </button>
          </div>

          <table className="custom-table">
            <thead>
              <tr>
                {data.length > 0 &&
                  Object.keys(data[0]).map((key) => (
                    <th key={key}>
                      {TRADUCCIONES_COLUMNAS[key] || key.replace('_', ' ')}
                    </th>
                  ))}
                {data.length > 0 && DOCUMENTOS_SUELTOS[vista]?.map((doc) => (
                  <th key={doc.tipo}>{doc.etiqueta}</th>
                ))}
                {data.length > 0 && <th style={{ textAlign: "center" }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {dataFiltrada.length === 0 ? (
                <tr>
                  <td colSpan="100%" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                    No hay registros encontrados en la base de datos de {vista}
                  </td>
                </tr>
              ) : (
                dataFiltrada.map((item) => (
                  <tr key={item.id}>
                    {Object.entries(item).map(([clave, val]) => (
                      <td key={clave}>
                        {DOCUMENTOS_EN_FECHA[vista]?.[clave] ? (
                          <>
                            {valorParaMostrar(clave, val)}
                            <DocumentoCelda
                              {...DOCUMENTOS_EN_FECHA[vista][clave]}
                              registroId={item.id}
                              tiene={documentos[DOCUMENTOS_EN_FECHA[vista][clave].tipo]?.has(item.id)}
                              isAdmin={isAdmin}
                              onCambio={marcarDocumento}
                            />
                          </>
                        ) : clave === "con_cita" ? (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={!!val}
                            aria-label={val
                              ? `${item.nombre}: quitar que va con cita`
                              : `${item.nombre}: marcar que va con cita`}
                            className={`cat-check ${val ? "cat-check--si" : ""}`}
                            onClick={() => alternarConCita(item)}
                            disabled={isSubmitting}
                          >
                            {val && <Check size={14} strokeWidth={3} />}
                          </button>
                        ) : valorParaMostrar(clave, val)}
                      </td>
                    ))}
                    {DOCUMENTOS_SUELTOS[vista]?.map((doc) => (
                      <td key={doc.tipo}>
                        <DocumentoCelda
                          {...doc}
                          registroId={item.id}
                          tiene={documentos[doc.tipo]?.has(item.id)}
                          isAdmin={isAdmin}
                          onCambio={marcarDocumento}
                        />
                      </td>
                    ))}
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                        <button
                          onClick={() => iniciarEdicion(item)}
                          className="btn-edit"
                          disabled={isSubmitting}
                        >
                          <SquarePen size={18} />
                        </button>
                        {isAdmin && (
                          <button
                            className="btn-delete"
                            onClick={() => eliminarRegistro(item.id)}
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
      )}

      {/* Modal */}
      <AnimatePresence>
        {modalAbierto && (
          <motion.div className="modal-overlay" {...overlayMotion}>
          <motion.div className="modal-content" {...contentMotion}>
            <h2 className="modal-title">
              {editando ? "Editar" : "Agregar"} {nombresSingulares[subVista || vista]}
            </h2>
            <form onSubmit={guardarNuevoRegistro}>
              {configFormularios[subVista || vista]?.map((campo) => (
                <div key={campo.name} className="form-group">
                  <label>{campo.label}</label>
                  {campo.type === "selector" && campo.selector === "cargo" ? (
                    <CargoSelector
                      currentValue={formData[campo.name] || ""}
                      onSelect={(nombre) => setFormData({ ...formData, [campo.name]: nombre })}
                      disabled={false}
                    />
                  ) : campo.type === "selector" && campo.selector === "transportista" ? (
                    <TransportistaSelector
                      currentValue={formData[campo.name] || ""}
                      onSelect={(nombre) => setFormData({ ...formData, [campo.name]: nombre })}
                      disabled={false}
                    />
                  ) : (
                    <input
                      type={campo.type}
                      name={campo.name}
                      value={formData[campo.name] || ""}
                      onChange={handleInputChange}
                      className="form-input"
                      placeholder={`Ingresa ${campo.label.toLowerCase()}`}
                      required={campo.required !== false}
                    />
                  )}
                </div>
              ))}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setModalAbierto(false);
                    setFormData({});
                    setEditando(false);
                    setRegistroEditando(null);
                    setSubVista(null);
                  }}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-save" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <BotonArriba />
    </div>
  );
}