import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../api/apiClient";
import "./OperadorSelector.css";

export default function OperadorSelector({ currentValue, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const [choferes, setChoferes] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errorList, setErrorList] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    setErrorList(null);
    apiClient.get("/choferes/")
      .then((res) => {
        const lista = Array.isArray(res) ? res : (res?.results ?? []);
        setChoferes(lista);
      })
      .catch(() => setErrorList("Error al cargar choferes"))
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

  const handleSelect = (nombre) => {
    setOpen(false);
    onSelect(nombre);
  };

  return (
    <div className="op-container" ref={containerRef}>
      <button
        type="button"
        className={`op-trigger ${currentValue ? "" : "op-trigger--empty"}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{currentValue || "— Asignar —"}</span>
        <span className="op-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <ul className="op-dropdown" role="listbox">
          {loadingList && (
            <li className="op-state">Cargando…</li>
          )}
          {errorList && (
            <li className="op-state op-state--error">{errorList}</li>
          )}
          {!loadingList && !errorList && choferes.length === 0 && (
            <li className="op-state">No hay choferes registrados</li>
          )}
          {!loadingList && !errorList && choferes.map((c) => (
            <li
              key={c.id}
              role="option"
              aria-selected={c.nombre === currentValue}
              className={`op-option ${c.nombre === currentValue ? "op-option--selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleSelect(c.nombre); }}
            >
              {c.nombre}
              {c.nombre === currentValue && <span className="op-check">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
