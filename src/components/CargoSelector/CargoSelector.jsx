import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../api/apiClient";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./CargoSelector.css";

export default function CargoSelector({ currentValue, onSelect, disabled }) {
  const [abierto, setAbierto] = useState(false);
  const [cargos, setCargos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto, setAbierto, wrapperRef: ref, dropdownRef: dropRef });

  useEffect(() => {
    if (!abierto) return;
    setCargando(true);
    setError(null);
    apiClient
      .getCatalogo("/cargos/")
      .then((data) => setCargos(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => setError("Error al cargar cargos"))
      .finally(() => setCargando(false));
  }, [abierto]);

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

  const handleSeleccionar = (c) => {
    onSelect(c.nombre === currentValue ? "" : c.nombre);   // reelegir = deseleccionar
    setAbierto(false);
  };

  return (
    <div className="cgs-wrapper" ref={ref}>
      <button type="button" className="cgs-btn" disabled={disabled} onClick={() => setAbierto((v) => !v)}>
        {currentValue || "— Seleccionar cargo —"}
      </button>
      {abierto && (
        <div className="cgs-dropdown" ref={dropRef}>
          {cargando && <div className="cgs-msg">Cargando...</div>}
          {error && <div className="cgs-msg cgs-error">{error}</div>}
          {!cargando && !error && cargos.length === 0 && (
            <div className="cgs-msg">Sin cargos registrados</div>
          )}
          {cargos.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cgs-item ${c.nombre === currentValue ? "cgs-item--selected" : ""}`}
              onClick={() => handleSeleccionar(c)}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
