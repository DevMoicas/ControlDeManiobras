import React, { useState, useEffect } from 'react';
import { Trash2, ArrowDown, Truck, Terminal } from 'lucide-react';
import './ManiobrasPage.css';

const ManiobrasPage = () => {
  const [maniobras, setManiobras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

    // Estados necesarios para el Modal de Edición
const [modalEditar, setModalEditar] = useState(false);
const [maniobraAEditar, setManiobraAEditar] = useState(null);

// --- FUNCIÓN ELIMINAR ---
const eliminarManiobra = async (id) => {
  if (window.confirm("¿Estás seguro de que deseas eliminar esta maniobra de la base de datos?")) {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/maniobras/${id}/`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Actualizamos la tabla quitando el elemento borrado
        setManiobras(maniobras.filter(m => m.id !== id));
        alert("Maniobra eliminada con éxito");
      } else {
        alert("Error: El servidor no permitió eliminar el registro.");
      }
    } catch (error) {
      console.error("Error al conectar con Django:", error);
    }
  }
};

// --- FUNCIONES ACTUALIZAR ---

// 1. Abre el modal y carga los datos
const prepararEdicion = (maniobra) => {
  console.log("Se hizo clic en actualizar. Datos recibidos:", maniobra);
  if (!maniobra) {
    console.error("Error: La maniobra viene vacía");
    return;
  }
  setManiobraAEditar(maniobra);
  setModalEditar(true);
};

const cargarDatos = async () => {
  try {
    const response = await fetch('http://127.0.0.1:8000/api/maniobras/');
    if (!response.ok) throw new Error('Error de conexión');
    
    const data = await response.json();
    
    // Ordenamos de menor a mayor (1, 2, 3...)
    const datosOrdenados = [...data].sort((a, b) => Number(a.id) - Number(b.id));
    
    setManiobras(datosOrdenados);
    setLoading(false);
  } catch (err) {
    console.error('Error fetching maniobras:', err);
    setError(true);
    setLoading(false);
  }
};
// 2. Envía los cambios a Django (PUT)
const guardarCambiosManiobra = async (e) => {
  e.preventDefault();

  if (!maniobraAEditar || !maniobraAEditar.id) return;

  const idActualizar = maniobraAEditar.id;
  // Solo mandamos los campos que Django reconoce (sin espacios)
  const { id, ...datosSinId } = maniobraAEditar;

  try {
    const response = await fetch(`http://127.0.0.1:8000/api/maniobras/${idActualizar}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosSinId),
    });

    if (response.ok) {
      await cargarDatos();
      
      setModalEditar(false);
      setManiobraAEditar(null);
      alert("¡Sincronizado con PostgreSQL con éxito!");
    } else {
      const errorData = await response.json();
      alert("Error: " + JSON.stringify(errorData));
    }
  } catch (error) {
    console.error("Error de red:", error);
  }
};
  useEffect(() => {
    cargarDatos();
  }, []);

  if (loading) {
    return (
      <div className="maniobras-container">
        <h1 className="maniobras-title">
          <Truck size={36} className="title-icon" /> Control de Maniobras
        </h1>
        <div className="loading-box">
          <p className="loading-text">Cargando datos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="maniobras-container">
        <h1 className="maniobras-title">
          <Truck size={36} className="title-icon" /> Control de Maniobras
        </h1>
        <div className="error-box">
          <h2 className="error-title">¡Ups!</h2>
          <p className="error-text">Error al conectar con el servidor</p>
        </div>
      </div>
    );
  }



  return (
    <div className="maniobras-container">
      <h1 className="maniobras-title">
        <Truck size={36} className="title-icon" /> Control de Maniobras
      </h1>

      <div className="table-responsive">
        <table className="maniobras-table">
          <thead>
            <tr>
              <th>Solicita</th>
              <th>Agencia</th>
              <th>Codigo PIS</th>
              <th>Terminal</th>
              <th>Placas PIS</th>
              <th>Fecha PIS</th>
              <th>Horario</th>
            </tr>
          </thead>
          <tbody>
            {maniobras.length === 0 ? (
              <tr>
                <td colSpan="100%" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                  No hay maniobras registradas en el servidor
                </td>
              </tr>
            ) : (
              maniobras.map((maniobra, index) => (
                <tr key={maniobra.id || index}>
                  <td>{maniobra.Solicita || maniobra.solicita}</td>
                  <td>{maniobra.Agencia || maniobra.agencia}</td>
                  <td style={{ color: "var(--primary-blue)", fontWeight: "bold", fontFamily: "monospace" }}>
                    {maniobra["Codigo PIS"] || maniobra.codigoPIS || maniobra.codigo_pis}
                  </td>
                  <td>{maniobra.Terminal || maniobra.terminal}</td>
                  <td>{maniobra["Placas PIS"] || maniobra.placasPIS || maniobra.placas_pis}</td>
                  <td>{maniobra["Fecha PIS"] || maniobra.fechaPIS || maniobra.fecha_pis}</td>
                  <td>{maniobra.Horario || maniobra.horario}</td>

                  {/* 2. AGREGAMOS LA CELDA DE BOTONES (Estilizada con Tailwind) */}
                <td className="px-2 py-2">
                  <div className="flex justify-center gap-3">
                    {/* Botón Actualizar: Flecha Azul apuntando abajo */}
                    <td className="px-2 py-2">
  <div className="flex justify-center gap-3">
 <td className="px-2 py-2">
  <div className="flex justify-center gap-3">
    {/* Botón Actualizar */}
    <button 
      onClick={() => prepararEdicion(maniobra)}
      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1.5 rounded-full transition-all"
    >
      <ArrowDown size={18} />
    </button>

    {/* Botón Eliminar */}
    <button 
      onClick={() => eliminarManiobra(maniobra.id)}
      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-full transition-all"
    >
      <Trash2 size={18} />
    </button>
  </div>
</td>
  </div>
</td>
                  </div>
                </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
     {modalEditar && maniobraAEditar && (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Fondo oscuro más fuerte
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999 // Super alto para que nada lo tape
  }}>
    <div style={{
      backgroundColor: 'white',
      padding: '30px',
      borderRadius: '12px',
      width: '450px',
      boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
      color: '#333'
    }}>
      <h2 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
        Editar Maniobra
      </h2>
      
      <form onSubmit={guardarCambiosManiobra} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Solicita:</label>
          <input 
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            value={maniobraAEditar.solicita || ""}
            onChange={(e) => setManiobraAEditar({...maniobraAEditar, solicita: e.target.value})}
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Agencia:</label>
          <input 
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            value={maniobraAEditar.agencia || ""}
            onChange={(e) => setManiobraAEditar({...maniobraAEditar, agencia: e.target.value})}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Codigo PIS:</label>
          <input 
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            value={maniobraAEditar.codigo_pis || ""}
            onChange={(e) => setManiobraAEditar({...maniobraAEditar, codigo_pis: e.target.value})}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Terminal:</label>
          <input 
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            value={maniobraAEditar.terminal || ""}
            onChange={(e) => setManiobraAEditar({...maniobraAEditar, terminal: e.target.value})}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Placas PIS:</label>
          <input 
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            value={maniobraAEditar.placas_pis || ""}
            onChange={(e) => setManiobraAEditar({...maniobraAEditar, placas_pis: e.target.value})}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Fecha PIS:</label>
          <input 
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            value={maniobraAEditar.fecha_pis || ""}
            onChange={(e) => setManiobraAEditar({...maniobraAEditar, fecha_pis: e.target.value})}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Horario:</label>
          <input 
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            value={maniobraAEditar.horario || ""}
            onChange={(e) => setManiobraAEditar({...maniobraAEditar, horario: e.target.value})}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button 
            type="button"
            onClick={() => setModalEditar(false)}
            style={{ padding: '8px 15px', borderRadius: '6px', border: 'none', backgroundColor: '#e5e7eb', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button 
            type="submit"
            style={{ padding: '8px 15px', borderRadius: '6px', border: 'none', backgroundColor: '#2563eb', color: 'white', cursor: 'pointer' }}
          >
            Guardar Cambios
          </button>
        </div>
      </form>
    </div>
  </div>
)}
    </div>
  );
  
};

export default ManiobrasPage;
