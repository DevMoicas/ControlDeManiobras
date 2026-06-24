import { useState, useEffect, useRef } from "react";
import "./VacioStatusSelector.css";

const VACIO_STATUSES = [
  { id: "pendiente", label: "Pendiente" },
  { id: "entregado", label: "Entregado" },
];

function getStatusStyle(status) {
  switch (status) {
    case "pendiente": return { background: "#fef9c3", color: "#854d0e" };
    case "entregado": return { background: "#dcfce7", color: "#166534" };
    default:          return { background: "#f3f4f6", color: "#6b7280" };
  }
}

function getStatusLabel(status) {
  const found = VACIO_STATUSES.find((s) => s.id === status);
  return found ? found.label : (status || "—");
}

export default function VacioStatusSelector({ currentStatus, onSelect, loading }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const keyHandler = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [open]);

  const handleSelect = (statusId) => {
    setOpen(false);
    onSelect(statusId);
  };

  const style = getStatusStyle(currentStatus);

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
        <span className="vss-label">{getStatusLabel(currentStatus)}</span>
        {!loading && <span className="vss-chevron">{open ? "▲" : "▼"}</span>}
      </button>

      {open && (
        <ul className="vss-dropdown" role="listbox">
          {VACIO_STATUSES.map((s) => (
            <li
              key={s.id}
              role="option"
              aria-selected={s.id === currentStatus}
              className={`vss-option ${s.id === currentStatus ? "vss-option--selected" : ""}`}
              style={getStatusStyle(s.id)}
              onClick={(e) => { e.stopPropagation(); handleSelect(s.id); }}
            >
              {s.label}
              {s.id === currentStatus && <span className="vss-check">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
