import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../api/apiClient";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./FolioSelector.css";

/**
 * FolioSelector
 * Muestra los últimos 30 folios de maniobras (con folio no vacío).
 * Al seleccionar, llama a onSelect(maniobraCompleta) con el objeto completo.
 *
 * Props:
 *   currentValue  string   — folio actualmente seleccionado (para mostrar en botón)
 *   onSelect      function — callback recibe el objeto maniobra completo
 *   disabled      boolean  — deshabilita el selector
 */
export default function FolioSelector({ currentValue, onSelect, disabled }) {
  const [abierto, setAbierto]     = useState(false);
  const [folios,  setFolios]      = useState([]);
  const [cargando, setCargando]   = useState(false);
  const [error,   setError]       = useState(null);
  const ref = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto, setAbierto, wrapperRef: ref, dropdownRef: dropRef });

  // Cargar folios al abrir el dropdown
  useEffect(() => {
    if (!abierto) return;
    setCargando(true);
    setError(null);
    apiClient
      .getCatalogo("/maniobras/folios-recientes/")
      .then((data) => setFolios(data || []))
      .catch(() => setError("Error al cargar folios"))
      .finally(() => setCargando(false));
  }, [abierto]);

  // Cerrar con Escape o clic fuera
  useEffect(() => {
    if (!abierto) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setAbierto(false);
    };
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [abierto]);

  const handleSeleccionar = (maniobra) => {
    onSelect(maniobra);
    setAbierto(false);
  };

  return (
    <div className="fsl-wrapper" ref={ref}>
      <button
        type="button"
        className="fsl-btn"
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
      >
        {currentValue || "— Seleccionar folio —"}
      </button>

      {abierto && (
        <div className="fsl-dropdown" ref={dropRef}>
          {cargando && <div className="fsl-msg">Cargando...</div>}
          {error && <div className="fsl-msg fsl-error">{error}</div>}
          {!cargando && !error && folios.length === 0 && (
            <div className="fsl-msg">Sin folios registrados</div>
          )}
          {folios.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`fsl-item ${m.folio === currentValue ? "fsl-item--selected" : ""}`}
              onClick={() => handleSeleccionar(m)}
            >
              <span className="fsl-folio">{m.folio}</span>
              {m.origen && m.destino && (
                <span className="fsl-ruta">{m.origen} → {m.destino}</span>
              )}
              {m.operador && <span className="fsl-ruta">{m.operador}</span>}
              {m.cliente_nombre && <span className="fsl-ruta">{m.cliente_nombre}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
