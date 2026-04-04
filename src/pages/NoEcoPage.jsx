import { useState, useEffect } from "react";
import "./NoEcoPage.css";

export default function NoEcoPage() {
  const [vista, setVista] = useState("tractos");
  const [data, setData] = useState([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [formData, setFormData] = useState({}); 

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
        // Filtramos el estado local para que desaparezca de la tabla al instante
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

// Detecta lo que escribes en los inputs y lo guarda en el estado
const handleInputChange = (e) => {
  setFormData({
    ...formData,
    [e.target.name]: e.target.value
  });
};

// Envía el formulario a Django
const guardarNuevoRegistro = async (e) => {
  e.preventDefault(); // Evita que la página se recargue

  try {
    const response = await fetch(`http://127.0.0.1:8000/api/${vista}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData), // Enviamos lo que llenaste en el form
    });

    if (response.ok) {
      const creado = await response.json();
      setData([...data, creado]); // Actualiza la tabla
      setModalAbierto(false); // Cierra la ventana
      setFormData({}); // Limpia el formulario para la próxima vez
      alert("Registro guardado con éxito");
    } else {
      const errorData = await response.json(); 
      console.error("Detalles del rechazo de Django:", errorData);
      alert(`Django rechazó los datos: ${JSON.stringify(errorData)}`);
    }
  } catch (error) {
    console.error("Error al agregar:", error);
  }
};

const nombresSingulares = {
  tractos: "Tracto",
  remolques: "Remolque",
  choferes: "Chofer" 
};

  return (
    <div className="noeco-container">
      <h1 className="noeco-title">NO. ECO</h1>

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
        <table>
          <thead>
            <tr>
              {data.length > 0 &&
                Object.keys(data[0]).map((key) => (
                  <th key={key}>{key}</th>
                ))}
            </tr>
          </thead>
          
          <button 
            onClick={() => setModalAbierto(true)} 
            className="btn-add"
            style={{ marginBottom: '20px', padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
          >
            Agregar Nuevo {nombresSingulares[vista] || "Registro"}
          </button>

   
          <tbody>
              {data.map((item, index) => (
                <tr key={index}>
                  {Object.values(item).map((val, i) => (
                    <td key={i}>{val}</td>
                  ))}
                  {/* Botón de eliminar al final de cada fila */}
                  <td>
                    <button 
                      onClick={() => eliminarRegistro(item.id)}
                      style={{ color: 'red', cursor: 'pointer' }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      </div>
      
      {modalAbierto && (
  <div style={{
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', 
    justifyContent: 'center', alignItems: 'center', zIndex: 1000
  }}>
    <div style={{
      backgroundColor: 'white', padding: '30px', borderRadius: '10px', 
      width: '400px', boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
    }}>
      <h2 style={{ marginTop: 0 }}>Agregar {nombresSingulares[vista]}</h2>
      
      <form onSubmit={guardarNuevoRegistro} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        
      {/* INPUTS */}
        {configFormularios[vista] && configFormularios[vista].map((campo) => (
          <div key={campo.name} style={{ display: 'flex', flexDirection: 'column' }}>
            <label>{campo.label}:</label>
            <input 
              type={campo.type} 
              name={campo.name} 
              value={formData[campo.name] || ""} 
              onChange={handleInputChange} 
              required 
              style={{ padding: '8px', marginTop: '5px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
        ))}

        {/* Botones de acción del Modal */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button 
            type="button" 
            onClick={() => { setModalAbierto(false); setFormData({}); }}
            style={{ padding: '8px 15px', cursor: 'pointer', backgroundColor: '#ccc', border: 'none', borderRadius: '4px' }}
          >
            Cancelar
          </button>
          <button 
            type="submit"
            style={{ padding: '8px 15px', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}
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