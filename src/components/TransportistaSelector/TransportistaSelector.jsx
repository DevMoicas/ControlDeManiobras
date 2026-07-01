import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../api/apiClient";
import "./TransportistaSelector.css";

export default function TransportistaSelector({ currentValue, onSelect, disabled }) {
  const [abierto, setAbierto] = useState(false);
  const [transportistas, setTransportistas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    apiClient
      .get("/transportistas/")
      .then((data) => setTransportistas(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => setError("Error al cargar transportistas"))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const handleKey = (e) => { if (e.key === "Escape") setAbierto(false); };
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [abierto]);

  const handleSeleccionar = (t) => {
    onSelect(t.nombre === currentValue ? "" : t.nombre);   // reelegir = deseleccionar
    setAbierto(false);
  };

  return (
    <div className="tsl-wrapper" ref={ref}>
      <button type="button" className="tsl-btn" disabled={disabled} onClick={() => setAbierto((v) => !v)}>
        {currentValue || "— Seleccionar transportista —"}
      </button>
      {abierto && (
        <div className="tsl-dropdown">
          {cargando && <div className="tsl-msg">Cargando...</div>}
          {error && <div className="tsl-msg tsl-error">{error}</div>}
          {!cargando && !error && transportistas.length === 0 && (
            <div className="tsl-msg">Sin transportistas registrados</div>
          )}
          {transportistas.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tsl-item ${t.nombre === currentValue ? "tsl-item--selected" : ""}`}
              onClick={() => handleSeleccionar(t)}
            >
              {t.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
