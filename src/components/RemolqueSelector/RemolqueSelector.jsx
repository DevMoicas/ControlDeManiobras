import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../api/apiClient";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./RemolqueSelector.css";

export default function RemolqueSelector({ currentValue, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const [remolques, setRemolques] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errorList, setErrorList] = useState(null);
  const containerRef = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto: open, setAbierto: setOpen, wrapperRef: containerRef, dropdownRef: dropRef });

  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    setErrorList(null);
    apiClient.getCatalogo("/remolques/")
      .then((res) => {
        const lista = Array.isArray(res) ? res : (res?.results ?? []);
        setRemolques(lista);
      })
      .catch(() => setErrorList("Error al cargar remolques"))
      .finally(() => setLoadingList(false));
  }, [open]);

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

  const handleSelect = (remolque) => {
    setOpen(false);
    // Retrocompatible: 1er arg = placas (string), 2º arg = remolque completo
    // reelegir la misma = deseleccionar
    onSelect(remolque.placas === currentValue ? "" : remolque.placas, remolque);
  };

  return (
    <div className="rs-container" ref={containerRef}>
      <button
        type="button"
        className={`rs-trigger ${currentValue ? "" : "rs-trigger--empty"}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{currentValue || "— Seleccionar —"}</span>
        <span className="rs-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {/* Limpiar: funciona aunque el trigger esté bloqueado (ej. remolque 2 en
          servicio no-full), para poder quitar un valor previo. */}
      {currentValue && (
        <button
          type="button"
          className="rs-clear"
          onClick={(e) => { e.stopPropagation(); onSelect(""); }}
          title="Quitar remolque"
          aria-label="Quitar remolque"
        >
          ✕
        </button>
      )}

      {open && (
        <ul className="rs-dropdown" role="listbox" ref={dropRef}>
          {loadingList && <li className="rs-state">Cargando...</li>}
          {errorList && <li className="rs-state rs-state--error">{errorList}</li>}
          {!loadingList && !errorList && remolques.length === 0 && (
            <li className="rs-state">No hay remolques registrados</li>
          )}
          {!loadingList && !errorList && remolques.map((r) => (
            <li
              key={r.id}
              role="option"
              aria-selected={r.placas === currentValue}
              className={`rs-option ${r.placas === currentValue ? "rs-option--selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleSelect(r); }}
            >
              <span>{r.placas}</span>
              <span className="rs-tipo">Tipo: {r.tipo}</span>
              {r.placas === currentValue && <span className="rs-check">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
