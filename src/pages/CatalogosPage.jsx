import { useState, useEffect, useRef } from "react";
import { apiClient } from "../api/apiClient";
import { Library, SquarePen, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import "./CatalogosPage.css";
import SearchBar from "../components/SearchBar/SearchBar";
export default function NoEcoPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuthContext();

  const [vista, setVista] = useState("tractos");
  const [data, setData] = useState([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [formData, setFormData] = useState({});
  const [editando, setEditando] = useState(false);
  const [registroEditando, setRegistroEditando] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataOrigenes, setDataOrigenes] = useState([]);
  const [dataDestinos, setDataDestinos] = useState([]);
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
    ciudad: "Ciudad",
  };

  const configFormularios = {
    tractos: [
      { name: "no_eco", label: "No. Eco", type: "text" },
      { name: "unidad", label: "Unidad", type: "text" },
      { name: "anio", label: "Año", type: "number" },
      { name: "placas", label: "Placas", type: "text" },
      { name: "tipo", label: "Tipo", type: "text" }
    ],
    remolques: [
      { name: "color", label: "Color", type: "text" },
      { name: "tipo", label: "Tipo de remolque", type: "text" },
      { name: "placas", label: "Placas del remolque", type: "text" }
    ],
    choferes: [
      { name: "nombre", label: "Nombre Completo", type: "text" },
      { name: "rfc", label: "RFC del operador", type: "text" },
      { name: "licencia", label: "Número de Licencia", type: "text" }
    ],
    empleados: [
      { name: "nombre_trabajador", label: "Nombre del Trabajador", type: "text" },
      { name: "fecha_ingreso", label: "Fecha de Ingreso", type: "date" },
      { name: "nss", label: "NSS", type: "text" }
    ],
    patios: [
      { name: "nombre", label: "Nombre", type: "text" }
    ],
    clientes: [
      { name: "nombre_cliente", label: "Nombre del Cliente", type: "text" },
      { name: "domicilio", label: "Domicilio", type: "text" }
    ],
    origenes: [
      { name: "ciudad", label: "Ciudad", type: "text" }
    ],
    destinos: [
      { name: "ciudad", label: "Ciudad", type: "text" }
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
            const datos = Array.isArray(res) ? res : res.results || [];
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
            const datos = Array.isArray(res) ? res : res.results || [];
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

    // Caso normal: una sola vista, un endpoint
    if (cacheRef.current[vista]) {
      setData(cacheRef.current[vista]);
      return;
    }

    apiClient.get(`/${vista}/`)
      .then(res => {
        if (cancelled) return;
        const datos = Array.isArray(res) ? res : res.results || [];
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
      alert("No tienes permisos para eliminar.");
      return;
    }

    const vistaActiva = vistaLocal || vista;

    if (window.confirm("¿Estás seguro de que deseas eliminar este registro?")) {
      setIsSubmitting(true);
      try {
        await apiClient.delete(`/${vistaActiva}/${id}/`);

        sessionStorage.removeItem("adminConteo");
        if (vistaActiva === "origenes") {
          setDataOrigenes(prev => prev.filter(item => item.id !== id));
        } else if (vistaActiva === "destinos") {
          setDataDestinos(prev => prev.filter(item => item.id !== id));
        } else {
          setData(prev => prev.filter(item => item.id !== id));
        }
        alert("Eliminado con éxito");
      } catch (error) {
        console.error("Error:", error);
        alert("Error al eliminar");
      } finally {
        setIsSubmitting(false);
      }
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
    setIsSubmitting(true);
    const vistaActiva = subVista || vista;

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
      alert(editando ? "Registro actualizado" : "Registro creado");
    } catch (error) {
      console.error(error);
      alert("Error en la operación");
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
  return (
    <div className="noeco-container">

      {/* ── Header con título y botón admin ── */}
      <div className="noeco-header">
        <h1 className="noeco-title">
          <Library size={45} color="var(--primary-blue)" /> CATÁLOGOS
        </h1>

        {/* Solo visible para administradores */}
        {isAdmin && (
          <button
            className="noeco-admin-btn"
            onClick={() => navigate("../admin-no-eco")}
            type="button"
          >
            ⚙ ADMIN CATÁLOGOS
          </button>
        )}
      </div>
      {/* BARRA DE BÚSQUEDA */}
      <SearchBar value={busqueda} onChange={setBusqueda} />
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
      </div>

      {/* Tabla */}
      {vista === "origenes_destinos" ? (
        <>
          {/* ── TABLA ORÍGENES ── */}
          <div className="table-container" style={{ marginBottom: "30px" }}>
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
                      {Object.values(item).map((val, i) => (
                        <td key={i}>{val}</td>
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

          {/* ── TABLA DESTINOS ── */}
          <div className="table-container">
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
                      {Object.values(item).map((val, i) => (
                        <td key={i}>{val}</td>
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
        </>
      ) : (
        <div className="table-container">
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
                    {Object.values(item).map((val, i) => (
                      <td key={i}>{val}</td>
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
      )}

      {/* Modal */}
      {modalAbierto && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">
              {editando ? "Editar" : "Agregar"} {nombresSingulares[subVista || vista]}
            </h2>
            <form onSubmit={guardarNuevoRegistro}>
              {configFormularios[subVista || vista]?.map((campo) => (
                <div key={campo.name} className="form-group">
                  <label>{campo.label}</label>
                  <input
                    type={campo.type}
                    name={campo.name}
                    value={formData[campo.name] || ""}
                    onChange={handleInputChange}
                    className="form-input"
                    placeholder={`Ingresa ${campo.label.toLowerCase()}`}
                    required={campo.required !== false}
                  />
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
          </div>
        </div>
      )}
    </div>
  );
}