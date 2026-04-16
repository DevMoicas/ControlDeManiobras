import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import "./NoEcoPage.css";

export default function NoEcoPage() {
  const [vista, setVista] = useState("tractos");
  const [data, setData] = useState([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [formData, setFormData] = useState({});
  const [editando, setEditando] = useState(false);
  const [registroEditando, setRegistroEditando] = useState(null);

  // Configuración de los campos para cada tabla
  const configFormularios = {
    tractos: [
      { name: "no_eco", label: "No. Eco", type: "text" },
      { name: "unidad", label: "Unidad", type: "text" },
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

  // 🔥 Fetch dinámico según vista
  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/${vista}`)
      .then(res => res.json())
      .then(res => setData(res))
      .catch(err => console.error(err));
  }, [vista]);

  const eliminarRegistro = async (id) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este registro?")) {
      try {
        const response = await fetch(`http://127.0.0.1:8000/api/${vista}/${id}/`, {
          method: 'DELETE',
        });

        if (response.ok) {
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

  // Carga los datos en el formulario y abre el modal
  const iniciarEdicion = (item) => {
    setEditando(true);
    setRegistroEditando(item);
    setFormData(item); // llena el formulario automáticamente
    setModalAbierto(true);
  };

  // Detecta lo que escribes en los inputs y lo guarda en el estado
  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Envía el formulario a Django
  const guardarNuevoRegistro = async (e) => {
    e.preventDefault();

    try {
      const url = editando
        ? `http://127.0.0.1:8000/api/${vista}/${registroEditando.id}/`
        : `http://127.0.0.1:8000/api/${vista}/`;

      const method = editando ? "PUT" : "POST";

      const response = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const resultado = await response.json();

        if (editando) {
          // Actualizar en la tabla
          setData(data.map(item =>
            item.id === registroEditando.id ? resultado : item
          ));
        } else {
          // Crear nuevo
          setData([...data, resultado]);
        }

        // Reset general
        setModalAbierto(false);
        setFormData({});
        setEditando(false);
        setRegistroEditando(null);

        alert(editando ? "Registro actualizado" : "Registro creado");
      } else {
        const errorData = await response.json();
        console.error(errorData);
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

  return (
    <div className="noeco-container">
      <h1 className="noeco-title">
        <Settings size={36} color="var(--primary-blue)" /> NO. ECO
      </h1>

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

      {/* Tabla Container */}
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
                  <th key={key}>{key.replace('_', ' ')}</th>
                ))}
              {data.length > 0 && <th style={{ textAlign: "center" }}>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan="100%" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                  No hay registros encontrados en la base de datos de {vista}
                </td>
              </tr>
            ) : (
              data.map((item, index) => (
                <tr key={index}>
                  {Object.values(item).map((val, i) => (
                    <td key={i}>{val}</td>
                  ))}
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                      <button
                        className="btn-delete"
                        onClick={() => eliminarRegistro(item.id)}
                      >
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

      {/* Modal Premium */}
      {modalAbierto && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">
              {editando ? "Editar" : "Agregar"} {nombresSingulares[vista]}
            </h2>

            <form onSubmit={guardarNuevoRegistro}>
              {configFormularios[vista] && configFormularios[vista].map((campo) => (
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
                <button
                  type="submit"
                  className="btn-save"
                >
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