import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import "./PendientePagadoSelector.css";

const OPCIONES = [
  { value: "pendiente", label: "Pendiente" },
  { value: "pagado",    label: "Pagado"    },
];

/**
 * PendientePagadoSelector
 * Selector de dos estados: pendiente / pagado. Hace PATCH directo al seleccionar.
 * El desplegable se renderiza en un portal (position: fixed) para que no lo
 * recorte el overflow del panel de la tabla.
 *
 * Props:
 *   currentStatus  'pendiente' | 'pagado'
 *   onSelect       function(nuevoStatus: string)
 *   loading        boolean
 */
export default function PendientePagadoSelector({ currentStatus, onSelect, loading }) {
  const [abierto, setAbierto] = useState(false);
  const [coords, setCoords]   = useState(null);
  const btnRef  = useRef(null);
  const dropRef = useRef(null);

  const actualizarCoords = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 5, left: r.left, width: r.width });
  };

  useLayoutEffect(() => {
    if (abierto) actualizarCoords();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const handleKey = (e) => { if (e.key === "Escape") setAbierto(false); };
    const handleClick = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (dropRef.current?.contains(e.target)) return;
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

  const handleSelect = (value) => {
    onSelect(value);
    setAbierto(false);
  };

  const label = OPCIONES.find((o) => o.value === currentStatus)?.label ?? "—";

  return (
    <div className="pps-wrapper">
      <button
        ref={btnRef}
        type="button"
        className={`pps-btn pps-btn--${currentStatus ?? "pendiente"}`}
        onClick={() => setAbierto((v) => !v)}
        disabled={loading}
      >
        {loading ? "..." : label}
      </button>

      {abierto && coords && createPortal(
        <div
          ref={dropRef}
          className="pps-dropdown"
          style={{ top: coords.top, left: coords.left, minWidth: coords.width }}
        >
          {OPCIONES.map((op) => (
            <button
              key={op.value}
              type="button"
              className={`pps-item pps-item--${op.value} ${op.value === currentStatus ? "pps-item--selected" : ""}`}
              onClick={() => handleSelect(op.value)}
            >
              {op.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
