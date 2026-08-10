import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./VacioStatusSelector.css";

// Los colores viven en la propia lista (antes eran un switch por id): así el
// selector sirve para cualquier juego de estados sin tocar su interior.
export const VACIO_STATUSES = [
  { id: "pendiente", label: "Pendiente", bg: "#fef9c3", fg: "#854d0e" },
  { id: "entregado", label: "Entregado", bg: "#dcfce7", fg: "#166534" },
];

// Columna STATUS EIR de Vacíos. Los ids son los choices de Vacio.status_eir.
export const EIR_STATUSES = [
  { id: "enviado",        label: "Enviado",        bg: "#dcfce7", fg: "#166534" },
  { id: "pendiente",      label: "Pendiente",      bg: "#fef9c3", fg: "#854d0e" },
  { id: "sin_eir_fisico", label: "Sin EIR Físico", bg: "#fee2e2", fg: "#991b1b" },
];

const SIN_STATUS = { background: "#f3f4f6", color: "#6b7280" };

function estiloDe(opciones, status) {
  const opcion = opciones.find((s) => s.id === status);
  return opcion ? { background: opcion.bg, color: opcion.fg } : SIN_STATUS;
}

function etiquetaDe(opciones, status) {
  const opcion = opciones.find((s) => s.id === status);
  return opcion ? opcion.label : (status || "—");
}

// `opciones` por defecto = los estados del vacío, así las llamadas que ya existían
// no cambian ni una línea.
export default function VacioStatusSelector({ currentStatus, onSelect, loading, opciones = VACIO_STATUSES }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const containerRef = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto: open, setAbierto: setOpen, wrapperRef: containerRef, dropdownRef: dropRef });

  // El desplegable se renderiza en un portal con position: fixed para que no lo
  // recorte el overflow de la tabla (mismo patrón que OperadorSelector).
  const actualizarCoords = () => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left });
  };

  useLayoutEffect(() => {
    if (open) actualizarCoords();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      if (dropRef.current && dropRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const keyHandler = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const reposicionar = () => actualizarCoords();
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    window.addEventListener("scroll", reposicionar, true);
    window.addEventListener("resize", reposicionar);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
      window.removeEventListener("scroll", reposicionar, true);
      window.removeEventListener("resize", reposicionar);
    };
  }, [open]);

  const handleSelect = (statusId) => {
    setOpen(false);
    onSelect(statusId);
  };

  const style = estiloDe(opciones, currentStatus);

  return (
    <div className="vss-container" ref={containerRef}>
      <button
        type="button"
        className="vss-trigger"
        style={style}
        onClick={(e) => { e.stopPropagation(); if (!loading) setOpen((o) => !o); }}
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {loading ? <span className="vss-spinner" /> : null}
        <span className="vss-label">{etiquetaDe(opciones, currentStatus)}</span>
        {!loading && <span className="vss-chevron">{open ? "▲" : "▼"}</span>}
      </button>

      {open && coords && createPortal(
        <ul
          className="vss-dropdown"
          role="listbox"
          ref={dropRef}
          style={{ top: coords.top, left: coords.left }}
        >
          {opciones.map((s) => (
            <li
              key={s.id}
              role="option"
              aria-selected={s.id === currentStatus}
              className={`vss-option ${s.id === currentStatus ? "vss-option--selected" : ""}`}
              style={estiloDe(opciones, s.id)}
              onClick={(e) => { e.stopPropagation(); handleSelect(s.id); }}
            >
              {s.label}
              {s.id === currentStatus && <span className="vss-check">✓</span>}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
