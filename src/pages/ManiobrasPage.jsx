import React, { useState, useEffect } from 'react';
import { Truck } from 'lucide-react';
import './ManiobrasPage.css';

const ManiobrasPage = () => {
  const [maniobras, setManiobras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/maniobras/')
      .then(response => {
        if (!response.ok) {
          throw new Error('Error de conexión');
        }
        return response.json();
      })
      .then(data => {
        setManiobras(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching maniobras:', error);
        setError(true);
        setLoading(false);
      });
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ManiobrasPage;
