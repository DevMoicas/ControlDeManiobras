import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/apiClient";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./TransportistaSelector.css";

export default function TransportistaSelector({ currentValue, onSelect, disabled }) {
  const [abierto, setAbierto] = useState(false);
  const [transportistas, setTransportistas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [coords, setCoords] = useState(null);
  const ref = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto, setAbierto, wrapperRef: ref, dropdownRef: dropRef });

  // El desplegable se renderiza en un portal con position: fixed para que no lo
  // recorte el overflow de la tabla (mismo patrón que OperadorSelector).
  const actualizarCoords = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left });
  };

  useLayoutEffect(() => {
    if (abierto) actualizarCoords();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    setCargando(true);
    setError(null);
    apiClient
      .getCatalogo("/transportistas/")
      .then((data) => setTransportistas(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => setError("Error al cargar transportistas"))
      .finally(() => setCargando(false));
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const handleKey = (e) => { if (e.key === "Escape") setAbierto(false); };
    const handleClick = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (dropRef.current && dropRef.current.contains(e.target)) return;
      setAbierto(false);
    };
    const reposicionar = () => actualizarCoords();
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", reposicionar, true);
    window.addEventListener("resize", reposicionar);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", reposicionar, true);
      window.removeEventListener("resize", reposicionar);
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
      {abierto && coords && createPortal(
        <div className="tsl-dropdown" ref={dropRef} style={{ top: coords.top, left: coords.left }}>
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
        </div>,
        document.body
      )}
    </div>
  );
}
