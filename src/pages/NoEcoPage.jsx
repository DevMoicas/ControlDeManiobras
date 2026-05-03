import { useState, useEffect, useRef } from "react";
import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import "./NoEcoPage.css";
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
  const TRADUCCIONES_COLUMNAS = {
    no_eco: "No. Eco",
    anio: "Año",
    unidad: "Unidad",
    placas: "Placas",
    tipo: "Tipo",
    id: "ID",
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
    ]
  };

  const cacheRef = useRef({});

useEffect(() => {
  // usar cache
  if (cacheRef.current[vista]) {
    setData(cacheRef.current[vista]);
    return;
  }

  const controller = new AbortController();

  fetch(`http://127.0.0.1:8000/api/${vista}`, {
    signal: controller.signal
  })
    .then(res => {
      if (!res.ok) {
        if (res.status === 429) {
          console.warn("Demasiadas solicitudes (429)");
          return null;
        }
        throw new Error("Error en la petición");
      }
      return res.json();
    })
    .then(res => {
      if (!res) return;

      const datos = Array.isArray(res)
        ? res
        : res.results || [];

      cacheRef.current[vista] = datos; //guardar cache
      setData(datos);
    })
    .catch(err => {
      if (err.name !== "AbortError") {
        console.error(err);
      }
    });

  return () => {
    controller.abort();
  };
}, [vista]);

  const eliminarRegistro = async (id) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este registro?")) {
      try {
        const response = await fetch(`http://127.0.0.1:8000/api/${vista}/${id}/`, {
          method: 'DELETE',
        });
        if (response.ok) {
          sessionStorage.removeItem("adminConteo");
          setData(data.filter(item => item.id !== id));
          alert("Eliminado con éxito");
        } else {
          alert("Error al eliminar");
        }
      } catch (error) {
        console.error("Error:", error);
      }
    }
  };

  const iniciarEdicion = (item) => {
    setEditando(true);
    setRegistroEditando(item);
    setFormData(item);
    setModalAbierto(true);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const guardarNuevoRegistro = async (e) => {
    e.preventDefault();
    try {
      const url = editando
        ? `http://127.0.0.1:8000/api/${vista}/${registroEditando.id}/`
        : `http://127.0.0.1:8000/api/${vista}/`;

      const response = await fetch(url, {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        sessionStorage.removeItem("adminConteo");
        const resultado = await response.json();
        setData(editando
          ? data.map(item => item.id === registroEditando.id ? resultado : item)
          : [...data, resultado]
        );
        setModalAbierto(false);
        setFormData({});
        setEditando(false);
        setRegistroEditando(null);
        alert(editando ? "Registro actualizado" : "Registro creado");
      } else {
        alert("Error en la operación");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const nombresSingulares = {
    tractos: "Tracto",
    remolques: "Remolque",
    choferes: "Chofer"
  };
  
  const dataFiltrada = Array.isArray(data)
  ? data.filter((item) => {
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
          <Settings size={36} color="var(--primary-blue)" /> NO. ECO
        </h1>

        {/* Solo visible para administradores */}
        {isAdmin && (
          <button
            className="noeco-admin-btn"
            onClick={() => navigate("../admin-no-eco")}
            type="button"
          >
            ⚙ Admin NoEco
          </button>
        )}
      </div>
    {/* BARRA DE BÚSQUEDA */}
      <SearchBar value={busqueda} onChange={setBusqueda} />
      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-button ${vista === "tractos" ? "active" : ""}`}
          onClick={() => setVista("tractos")}
        >
          Tractos
        </button>
        <button
          className={`tab-button ${vista === "remolques" ? "active" : ""}`}
          onClick={() => setVista("remolques")}
        >
          Remolques
        </button>
        <button
          className={`tab-button ${vista === "choferes" ? "active" : ""}`}
          onClick={() => setVista("choferes")}
        >
          Choferes
        </button>
      </div>

      {/* Tabla */}
      <div className="table-container">
        <div className="add-button-container">
          <button
            onClick={() => {
              setFormData({});
              setEditando(false);
              setRegistroEditando(null);
              setModalAbierto(true);
            }}
            className="btn-add"
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
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                      <button className="btn-delete" onClick={() => eliminarRegistro(item.id)}>
                        Eliminar
                      </button>
                      <button
                        onClick={() => iniciarEdicion(item)}
                        style={{
                          color: 'var(--primary-blue)',
                          background: 'transparent',
                          border: 'none',
                          fontWeight: '600',
                          cursor: 'pointer',
                          padding: '4px 8px'
                        }}
                      >
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalAbierto && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">
              {editando ? "Editar" : "Agregar"} {nombresSingulares[vista]}
            </h2>
            <form onSubmit={guardarNuevoRegistro}>
              {configFormularios[vista]?.map((campo) => (
                <div key={campo.name} className="form-group">
                  <label>{campo.label}</label>
                  <input
                    type={campo.type}
                    name={campo.name}
                    value={formData[campo.name] || ""}
                    onChange={handleInputChange}
                    className="form-input"
                    placeholder={`Ingresa ${campo.label.toLowerCase()}`}
                    required
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
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-save">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}