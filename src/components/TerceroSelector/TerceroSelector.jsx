import { useState, useEffect, useRef } from "react";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./TerceroSelector.css";

// Valor canónico que se guarda en la columna `tercero` de la maniobra.
// "" (o null) = sin marca. Es un único status que se activa/desactiva, no un combo.
const TERCERO_VALUE = "tercero";

/**
 * Selector inline con UNA sola opción ("Tercero"), al estilo de VacioStatusSelector.
 * Se puede seleccionar y deseleccionar: al alternar emite onSelect("tercero") o
 * onSelect("") para limpiar (apiClient convierte "" → null antes del PATCH).
 *
 * @param {Object}   props
 * @param {string|null} props.currentValue - "tercero" | "" | null
 * @param {Function} props.onSelect        - Callback(nuevoValor: "tercero" | "")
 * @param {boolean}  [props.loading]       - true mientras el PATCH está en vuelo
 */
export default function TerceroSelector({ currentValue, onSelect, loading }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto: open, setAbierto: setOpen, wrapperRef: containerRef, dropdownRef: dropRef });

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

  const activo = currentValue === TERCERO_VALUE;

  // Toggle: si ya está puesto lo quita (""), si no lo pone ("tercero").
  const handleToggle = () => {
    setOpen(false);
    onSelect(activo ? "" : TERCERO_VALUE);
  };

  return (
    <div className="ts-container" ref={containerRef}>
      <button
        type="button"
        className={`ts-trigger ${activo ? "ts-trigger--activo" : "ts-trigger--vacio"}`}
        onClick={(e) => { e.stopPropagation(); if (!loading) setOpen((o) => !o); }}
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Marca de tercero"
      >
        {loading ? <span className="ts-spinner" /> : null}
        <span className="ts-label">{activo ? "Tercero" : "—"}</span>
        {!loading && <span className="ts-chevron">{open ? "▲" : "▼"}</span>}
      </button>

      {open && (
        <ul className="ts-dropdown" role="listbox" ref={dropRef}>
          <li
            role="option"
            aria-selected={activo}
            className={`ts-option ${activo ? "ts-option--selected" : ""}`}
            onClick={(e) => { e.stopPropagation(); handleToggle(); }}
          >
            Tercero
            {activo && <span className="ts-check">✓</span>}
          </li>
        </ul>
      )}
    </div>
  );
}
